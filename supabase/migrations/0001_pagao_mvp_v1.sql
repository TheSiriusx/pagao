-- ============================================================================
-- Pagao — MVP v1 — Migración inicial
-- ============================================================================
-- Pegar COMPLETO en: Supabase Studio → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- La sección 8 (pg_cron) va al final a propósito: si la extensión no está
-- habilitada en tu proyecto, esa sección fallará pero TODO lo anterior ya
-- quedó aplicado. Habilítala en Database → Extensions → pg_cron y vuelve a
-- correr solo la sección 8.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONES
-- ============================================================================
-- gen_random_uuid() es nativo desde PostgreSQL 13, pero pgcrypto no estorba.
create extension if not exists pgcrypto;


-- ============================================================================
-- 2. TABLAS
-- ============================================================================

create table if not exists merchants (
  id                uuid primary key references auth.users(id) on delete cascade,
  phone             text unique not null,
  business_name     text not null,
  owner_name        text,
  bank_name         text,
  bank_phone        text,
  plan              text not null default 'free',
  plan_expires_at   timestamptz,
  free_queries_used int not null default 0,
  created_at        timestamptz not null default now()
);

create table if not exists debtors (
  id         uuid primary key default gen_random_uuid(),
  cedula     text unique not null,          -- normalizada: V12345678 (sin guion, mayúscula)
  full_name  text not null,
  phone      text,
  score      int not null default 50,
  created_at timestamptz not null default now()
);

create table if not exists debts (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  debtor_id    uuid not null references debtors(id)   on delete cascade,
  amount       numeric(10,2) not null check (amount > 0),
  due_date     date not null,
  status       text not null default 'active'
               check (status in ('active','paid','overdue','disputed')),
  notes        text,
  payment_date timestamptz,
  days_late    int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists score_history (
  id          uuid primary key default gen_random_uuid(),
  debtor_id   uuid references debtors(id)  on delete cascade,
  debt_id     uuid references debts(id)    on delete set null,
  merchant_id uuid references merchants(id) on delete set null,
  old_score   int,
  new_score   int,
  reason      text,
  created_at  timestamptz not null default now()
);


-- ============================================================================
-- 3. ÍNDICES
-- ============================================================================
create index if not exists debts_merchant_status_idx on debts (merchant_id, status);
create index if not exists debts_debtor_status_idx   on debts (debtor_id, status);
create index if not exists debts_due_date_idx        on debts (due_date) where status = 'active';
create index if not exists score_history_debtor_idx  on score_history (debtor_id, created_at desc);


-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

-- merchants: cada comerciante solo se ve a sí mismo.
alter table merchants enable row level security;
drop policy if exists merchants_self on merchants;
create policy merchants_self on merchants
  for all using (id = auth.uid()) with check (id = auth.uid());

-- debts: cada comerciante solo ve/toca sus propias deudas.
alter table debts enable row level security;
drop policy if exists debts_own on debts;
create policy debts_own on debts
  for all using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());

-- debtors: CERRADA. Sin una sola política. Único acceso: get_debtor_score().
alter table debtors enable row level security;

-- score_history: CERRADA. Contiene el rastro de deudas de otros comercios.
alter table score_history enable row level security;


-- ============================================================================
-- 5. PRIVILEGIOS DE TABLA
-- ============================================================================
-- RLS filtra filas; los GRANT filtran COLUMNAS y verbos. Se necesitan ambos:
-- sin esto, un comerciante puede hacer PATCH /merchants?id=eq.<su-uid> y
-- ponerse plan='pro' o free_queries_used=0 él mismo. La política RLS lo
-- permitiría (la fila SÍ es suya) — el paywall se cae entero.

-- merchants: lee todo lo suyo, pero solo escribe columnas de perfil.
revoke all on table merchants from anon, authenticated;
grant select on table merchants to authenticated;
grant insert (id, phone, business_name, owner_name, bank_name, bank_phone)
  on table merchants to authenticated;
grant update (phone, business_name, owner_name, bank_name, bank_phone)
  on table merchants to authenticated;
-- plan, plan_expires_at y free_queries_used quedan fuera: solo los tocan las
-- funciones SECURITY DEFINER (o tú a mano desde el dashboard).

-- debts: lectura directa para listar/filtrar; toda escritura vía RPC.
revoke all on table debts from anon, authenticated;
grant select on table debts to authenticated;

-- debtors y score_history: sin acceso directo de ningún tipo.
revoke all on table debtors      from anon, authenticated;
revoke all on table score_history from anon, authenticated;


-- ============================================================================
-- 6. HELPERS
-- ============================================================================

-- Normaliza la cédula a forma canónica: quita guiones/espacios/puntos y
-- pasa a mayúscula. "v-12.345.678" y "V12345678" son la MISMA persona.
-- Sin esto, el unique(cedula) deja crear varias fichas del mismo deudor y el
-- score se fragmenta — que es justo lo que la Red Pagao no debe permitir.
-- No es SECURITY DEFINER a propósito: no toca tablas ni necesita auth.uid().
create or replace function public.normalize_cedula(p_cedula text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_cedula, ''), '[^A-Za-z0-9]', '', 'g'))
$$;


-- ============================================================================
-- 7. SCORE — TRIGGER
-- ============================================================================

create or replace function public.apply_score_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta  int := 0;
  d_late int;
  old_s  int;
  new_s  int;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    -- Si nadie fijó payment_date, se toma el momento actual.
    new.payment_date := coalesce(new.payment_date, now());

    -- Fecha LOCAL de Venezuela: un pago a las 21:00 VET son las 01:00 UTC del
    -- día siguiente. Sin el at time zone, ese pago puntual contaría 1 día tarde
    -- (+10 en vez de +15). Aritmética de fechas nativa de PostgreSQL.
    d_late := ((new.payment_date at time zone 'America/Caracas')::date - new.due_date);

    new.days_late := greatest(d_late, 0);

    if    d_late <  0  then delta :=  15;   -- pagó antes de vencer
    elsif d_late <= 1  then delta :=  10;   -- puntual
    elsif d_late <= 7  then delta :=  -5;
    elsif d_late <= 30 then delta := -15;
    else                    delta := -30;
    end if;

  elsif new.status = 'overdue' and old.status is distinct from 'overdue' then
    delta := -30;

  else
    return new;
  end if;

  select score into old_s from debtors where id = new.debtor_id for update;
  new_s := greatest(0, least(100, old_s + delta));

  update debtors set score = new_s where id = new.debtor_id;

  insert into score_history (debtor_id, debt_id, merchant_id, old_score, new_score, reason)
  values (new.debtor_id, new.id, new.merchant_id, old_s, new_s, new.status || ' ' || delta);

  return new;
end;
$$;

drop trigger if exists trg_apply_score on debts;
create trigger trg_apply_score
  before update of status on debts
  for each row execute function public.apply_score_change();


-- ============================================================================
-- 8. FUNCIONES RPC
-- ============================================================================

-- ---- create_debt ----------------------------------------------------------
-- Se elimina la firma de 5 argumentos por si quedó de una corrida anterior:
-- con las dos vivas, PostgREST no sabe cuál llamar y responde 300.
drop function if exists public.create_debt(text, text, numeric, date, text);

create or replace function public.create_debt(
  p_cedula    text,
  p_full_name text,
  p_amount    numeric,
  p_due_date  date,
  p_notes     text default null,
  p_phone     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cedula text;
  v_debtor uuid;
  v_debt   uuid;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;
  if not exists (select 1 from merchants where id = auth.uid()) then
    raise exception 'NOT_A_MERCHANT';
  end if;

  v_cedula := normalize_cedula(p_cedula);
  if v_cedula !~ '^[VE][0-9]{6,9}$' then
    raise exception 'INVALID_CEDULA';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'INVALID_NAME';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_due_date is null then
    raise exception 'INVALID_DUE_DATE';
  end if;

  insert into debtors (cedula, full_name, phone)
  values (v_cedula, btrim(p_full_name), nullif(btrim(p_phone), ''))
  on conflict (cedula) do update
    set full_name = debtors.full_name,                      -- conserva el nombre original
        phone     = coalesce(debtors.phone, excluded.phone) -- solo rellena si estaba vacío
  returning id into v_debtor;

  insert into debts (merchant_id, debtor_id, amount, due_date, notes)
  values (auth.uid(), v_debtor, p_amount, p_due_date, nullif(btrim(p_notes), ''))
  returning id into v_debt;

  return v_debt;
end;
$$;


-- ---- mark_debt_paid -------------------------------------------------------
create or replace function public.mark_debt_paid(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  update debts
     set status = 'paid', payment_date = now()
   where id = p_debt_id
     and merchant_id = auth.uid()
     and status <> 'paid';

  if not found then
    raise exception 'NOT_YOUR_DEBT_OR_ALREADY_PAID';
  end if;
end;
$$;


-- ---- get_debtor_score -----------------------------------------------------
-- Única puerta de entrada a debtors. Devuelve score, color y nº de deudas
-- activas. Nunca el nombre, los montos ni qué comercios están involucrados.
create or replace function public.get_debtor_score(p_cedula text)
returns table (score int, band text, active_debts int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cedula text;
  v_plan   text;
  v_exp    timestamptz;
  v_used   int;
  v_id     uuid;
  v_score  int;
  v_active int;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  select m.plan, m.plan_expires_at, m.free_queries_used
    into v_plan, v_exp, v_used
    from merchants m
   where m.id = auth.uid();

  -- Usuario autenticado sin ficha de comerciante: v_plan queda NULL y
  -- 'NULL = free' es NULL (ni true ni false), así que se saltaría el límite
  -- y consultaría gratis para siempre.
  if v_plan is null then
    raise exception 'NOT_A_MERCHANT';
  end if;

  -- Plan pro vencido = free. El paywall se decide aquí, en el servidor.
  if v_plan <> 'free' and v_exp is not null and v_exp < now() then
    v_plan := 'free';
  end if;

  if v_plan = 'free' and v_used >= 1 then
    raise exception 'FREE_LIMIT';
  end if;

  v_cedula := normalize_cedula(p_cedula);
  if v_cedula !~ '^[VE][0-9]{6,9}$' then
    raise exception 'INVALID_CEDULA';
  end if;

  select d.id, d.score into v_id, v_score
    from debtors d
   where d.cedula = v_cedula;

  -- Desconocido en la red: gris. No consume la consulta gratis.
  if v_id is null then
    return query select null::int, 'gris'::text, 0;
    return;
  end if;

  select count(*)::int into v_active
    from debts
   where debtor_id = v_id
     and status in ('active', 'overdue');

  if v_plan = 'free' then
    update merchants set free_queries_used = free_queries_used + 1
     where id = auth.uid();
  end if;

  return query
  select v_score,
         case when v_score >= 80 then 'verde'
              when v_score >= 60 then 'amarillo'
              when v_score >= 40 then 'naranja'
              else                    'rojo'
         end,
         v_active;
end;
$$;


-- ---- Privilegios de ejecución ---------------------------------------------
-- Por defecto PostgreSQL da EXECUTE a PUBLIC, lo que expone las RPC al rol
-- anon (sin sesión). Se revoca y se concede solo a authenticated.
revoke execute on function public.create_debt(text, text, numeric, date, text, text) from public, anon;
revoke execute on function public.mark_debt_paid(uuid)                               from public, anon;
revoke execute on function public.get_debtor_score(text)                             from public, anon;
revoke execute on function public.normalize_cedula(text)                             from public, anon;

grant execute on function public.create_debt(text, text, numeric, date, text, text) to authenticated;
grant execute on function public.mark_debt_paid(uuid)                               to authenticated;
grant execute on function public.get_debtor_score(text)                             to authenticated;


-- ============================================================================
-- 9. pg_cron — marcar vencidas
-- ============================================================================
-- Si esta sección falla: Database → Extensions → habilitar pg_cron, y correr
-- solo desde aquí. Todo lo anterior ya quedó aplicado.

create extension if not exists pg_cron;

select cron.unschedule('pagao_mark_overdue')
 where exists (select 1 from cron.job where jobname = 'pagao_mark_overdue');

-- 08:10 UTC = 04:10 en Venezuela. Cada fila que pasa a 'overdue' dispara
-- trg_apply_score y le resta 30 puntos al deudor.
select cron.schedule(
  'pagao_mark_overdue',
  '10 8 * * *',
  $job$
    update public.debts
       set status = 'overdue'
     where status = 'active'
       and due_date < ((now() at time zone 'America/Caracas')::date - 30)
  $job$
);

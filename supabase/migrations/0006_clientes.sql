-- ============================================================================
-- Pagao — 0006 — Ficha de cliente por comerciante
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- Hasta ahora el nombre y el teléfono del deudor vivían en debtors, que es una
-- tabla GLOBAL con una fila por cédula. Tiene que serlo: sin eso no hay score
-- compartido. Pero eso significaba que si dos comercios le fiaban a la misma
-- persona, el segundo heredaba lo que había cargado el primero.
--
-- Con el nombre era incómodo. Con la dirección de la casa es inaceptable.
--
-- A partir de aquí:
--   debtors          → SOLO lo que la red comparte: cédula y score
--   merchant_debtors → la ficha que cada comerciante lleva de SU cliente
--
-- Dos bodegas pueden tener al mismo deudor con nombres, teléfonos y
-- direcciones distintas, y ninguna ve la del otro.
-- ============================================================================


-- ---- Ficha privada de cada comerciante -------------------------------------
create table if not exists merchant_debtors (
  merchant_id uuid not null references merchants(id) on delete cascade,
  debtor_id   uuid not null references debtors(id)   on delete cascade,
  full_name   text not null,
  phone       text,
  phone2      text,
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (merchant_id, debtor_id)
);

create index if not exists merchant_debtors_merchant_idx on merchant_debtors (merchant_id);

alter table merchant_debtors enable row level security;
drop policy if exists merchant_debtors_own on merchant_debtors;
create policy merchant_debtors_own on merchant_debtors
  for all using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());

revoke all on table merchant_debtors from anon, authenticated;
grant select on table merchant_debtors to authenticated;


-- ---- Traer lo que ya existía ------------------------------------------------
-- Cada comerciante se queda con una copia de lo que hoy ve, para que nadie
-- pierda datos ni note el cambio.
insert into merchant_debtors (merchant_id, debtor_id, full_name, phone)
select distinct on (d.merchant_id, d.debtor_id)
       d.merchant_id, d.debtor_id, dt.full_name, dt.phone
  from debts d
  join debtors dt on dt.id = d.debtor_id
 on conflict (merchant_id, debtor_id) do nothing;


-- ---- create_debt ------------------------------------------------------------
-- Se eliminan las firmas viejas: con varias vivas PostgREST no sabe cuál
-- llamar y responde 300.
drop function if exists public.create_debt(text, text, numeric, date, text);
drop function if exists public.create_debt(text, text, numeric, date, text, text);

create or replace function public.create_debt(
  p_cedula    text,
  p_full_name text,
  p_amount    numeric,
  p_due_date  date,
  p_notes     text default null,
  p_phone     text default null,
  p_phone2    text default null,
  p_address   text default null
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

  -- En la tabla global solo se toca la cédula. El nombre que se guarda ahí es
  -- el del primero que lo registró y ya no lo lee nadie: queda como rastro.
  insert into debtors (cedula, full_name)
  values (v_cedula, btrim(p_full_name))
  on conflict (cedula) do update set full_name = debtors.full_name
  returning id into v_debtor;

  -- La ficha privada sí se actualiza con lo que escriba ESTE comerciante.
  insert into merchant_debtors (merchant_id, debtor_id, full_name, phone, phone2, address)
  values (auth.uid(), v_debtor, btrim(p_full_name),
          nullif(btrim(p_phone), ''), nullif(btrim(p_phone2), ''), nullif(btrim(p_address), ''))
  on conflict (merchant_id, debtor_id) do update
    set full_name  = excluded.full_name,
        phone      = coalesce(excluded.phone,   merchant_debtors.phone),
        phone2     = coalesce(excluded.phone2,  merchant_debtors.phone2),
        address    = coalesce(excluded.address, merchant_debtors.address),
        updated_at = now();

  insert into debts (merchant_id, debtor_id, amount, due_date, notes)
  values (auth.uid(), v_debtor, p_amount, p_due_date, nullif(btrim(p_notes), ''))
  returning id into v_debt;

  return v_debt;
end;
$$;


-- ---- list_debts -------------------------------------------------------------
-- El nombre y el teléfono ahora salen de la ficha privada.
drop function if exists public.list_debts();

create or replace function public.list_debts()
returns table (
  id           uuid,
  debtor_id    uuid,
  cedula       text,
  full_name    text,
  phone        text,
  amount       numeric,
  abonado      numeric,
  due_date     date,
  status       text,
  notes        text,
  payment_date timestamptz,
  days_late    int,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  return query
    select d.id, d.debtor_id, dt.cedula,
           coalesce(md.full_name, dt.full_name),
           md.phone,
           d.amount,
           coalesce((select sum(p.amount) from payments p where p.debt_id = d.id), 0),
           d.due_date, d.status, d.notes,
           d.payment_date, d.days_late, d.created_at
      from debts d
      join debtors dt on dt.id = d.debtor_id
      left join merchant_debtors md
             on md.debtor_id = d.debtor_id and md.merchant_id = d.merchant_id
     where d.merchant_id = auth.uid()
     order by (d.status = 'paid'), d.due_date, d.created_at;
end;
$$;


-- ---- list_clients -----------------------------------------------------------
-- La pestaña de Clientes: un renglón por persona, con lo que te debe y si
-- está en mora CONTIGO.
--
-- No devuelve el score a propósito. Ese dato es de la red y se paga: sale
-- solo por get_debtor_score, que lleva la cuenta de las consultas gratis.
create or replace function public.list_clients()
returns table (
  debtor_id    uuid,
  cedula       text,
  full_name    text,
  phone        text,
  phone2       text,
  address      text,
  debe         numeric,
  pendientes   int,
  vencidas     int,
  total_fiado  numeric,
  ultima_fecha date
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Caracas')::date;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  return query
    select md.debtor_id,
           dt.cedula,
           md.full_name,
           md.phone,
           md.phone2,
           md.address,
           coalesce(sum(case when d.status <> 'paid'
                             then d.amount - coalesce(ab.pagado, 0) else 0 end), 0),
           count(*) filter (where d.status <> 'paid')::int,
           count(*) filter (where d.status in ('active', 'overdue') and d.due_date < v_hoy)::int,
           coalesce(sum(d.amount), 0),
           max(d.due_date)
      from merchant_debtors md
      join debtors dt on dt.id = md.debtor_id
      left join debts d
             on d.debtor_id = md.debtor_id and d.merchant_id = md.merchant_id
      left join lateral (
             select sum(p.amount) as pagado from payments p where p.debt_id = d.id
           ) ab on true
     where md.merchant_id = auth.uid()
     group by md.debtor_id, dt.cedula, md.full_name, md.phone, md.phone2, md.address
     -- Primero los que te deben, y dentro de esos los que más deben.
     order by (coalesce(sum(case when d.status <> 'paid'
                                 then d.amount - coalesce(ab.pagado, 0) else 0 end), 0) = 0),
              coalesce(sum(case when d.status <> 'paid'
                                then d.amount - coalesce(ab.pagado, 0) else 0 end), 0) desc,
              md.full_name;
end;
$$;


-- ---- update_client ----------------------------------------------------------
-- Corregir la ficha. Solo la propia: la del vecino no se toca ni se ve.
create or replace function public.update_client(
  p_debtor_id uuid,
  p_full_name text,
  p_phone     text default null,
  p_phone2    text default null,
  p_address   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'INVALID_NAME';
  end if;

  update merchant_debtors
     set full_name  = btrim(p_full_name),
         phone      = nullif(btrim(p_phone), ''),
         phone2     = nullif(btrim(p_phone2), ''),
         address    = nullif(btrim(p_address), ''),
         updated_at = now()
   where merchant_id = auth.uid()
     and debtor_id = p_debtor_id;

  if not found then
    raise exception 'NOT_YOUR_CLIENT';
  end if;
end;
$$;


-- ---- set_debtor_phone -------------------------------------------------------
-- Se mantiene por compatibilidad, pero ahora escribe en la ficha privada en
-- vez de en la tabla global.
create or replace function public.set_debtor_phone(p_debtor_id uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  update merchant_debtors
     set phone = nullif(btrim(p_phone), ''), updated_at = now()
   where merchant_id = auth.uid()
     and debtor_id = p_debtor_id;

  if not found then
    raise exception 'NOT_YOUR_CLIENT';
  end if;
end;
$$;


-- ---- Privilegios ------------------------------------------------------------
revoke execute on function public.create_debt(text, text, numeric, date, text, text, text, text) from public, anon;
revoke execute on function public.list_debts()                                  from public, anon;
revoke execute on function public.list_clients()                                from public, anon;
revoke execute on function public.update_client(uuid, text, text, text, text)   from public, anon;
revoke execute on function public.set_debtor_phone(uuid, text)                  from public, anon;

grant execute on function public.create_debt(text, text, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.list_debts()                                   to authenticated;
grant execute on function public.list_clients()                                 to authenticated;
grant execute on function public.update_client(uuid, text, text, text, text)    to authenticated;
grant execute on function public.set_debtor_phone(uuid, text)                   to authenticated;

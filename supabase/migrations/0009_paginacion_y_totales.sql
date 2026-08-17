-- ============================================================================
-- Pagao — 0009 — Totales en el servidor y listas paginadas
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- EL BUG QUE ARREGLA
--
-- PostgREST corta las respuestas en 1000 filas y no avisa. La app sumaba
-- "Te deben" en el teléfono, con las filas que le llegaban, así que a partir
-- de 1000 fiados el resumen mostraba menos de la mitad de lo real. Medido:
-- un comercio con 2000 fiados veía $53.655 cuando debía ver el doble.
--
-- Un número equivocado en la pantalla principal es peor que no mostrarlo: el
-- comerciante toma decisiones con él.
--
-- LA SOLUCIÓN
--
-- Los totales se calculan aquí, con SQL, sobre TODAS las filas. Y las listas
-- pasan a pedirse por páginas, filtradas y buscadas también aquí, en vez de
-- traerse enteras para filtrarlas en el navegador.
-- ============================================================================


-- ---- Clasificación, en un solo sitio ---------------------------------------
-- Es la misma regla que usa la interfaz. Importante: "vencida" NO es
-- status='overdue' (eso solo lo pone el cron a los 30 días), sino que la
-- fecha ya pasó. Para el comerciante está vencida al día siguiente.
create or replace function public.clase_deuda(p_status text, p_due_date date, p_hoy date)
returns text
language sql
immutable
as $$
  select case
           when p_status = 'paid'     then 'pagada'
           when p_status = 'disputed' then 'reclamo'
           when p_due_date < p_hoy    then 'vencida'
           else                            'por_vencer'
         end
$$;


-- ---- get_dashboard ----------------------------------------------------------
-- Todo lo que muestra la pantalla principal, calculado sobre la totalidad de
-- los datos. Devuelve una sola fila, así que nunca lo corta el límite.
create or replace function public.get_dashboard()
returns table (
  por_cobrar    numeric,
  vencido       numeric,
  cobrado_mes   numeric,
  clientes      int,
  n_todas       int,
  n_por_vencer  int,
  n_vencida     int,
  n_reclamo     int,
  n_pagada      int
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
  with mias as (
    select d.id, d.debtor_id, d.amount, d.due_date, d.status,
           d.amount - coalesce((select sum(p.amount) from payments p where p.debt_id = d.id), 0) as saldo,
           clase_deuda(d.status, d.due_date, v_hoy) as clase
      from debts d
     where d.merchant_id = auth.uid()
  )
  select
    coalesce(sum(saldo) filter (where status <> 'paid'), 0),
    coalesce(sum(saldo) filter (where clase = 'vencida'), 0),
    coalesce((
      select sum(p.amount) from payments p
       where p.merchant_id = auth.uid()
         and p.paid_at >= date_trunc('month', now() at time zone 'America/Caracas')
    ), 0),
    count(distinct debtor_id) filter (where status <> 'paid')::int,
    count(*)::int,
    count(*) filter (where clase = 'por_vencer')::int,
    count(*) filter (where clase = 'vencida')::int,
    count(*) filter (where clase = 'reclamo')::int,
    count(*) filter (where clase = 'pagada')::int
  from mias;
end;
$$;


-- ---- list_debts, ahora paginada y con filtro ---------------------------------
drop function if exists public.list_debts();

create or replace function public.list_debts(
  p_clase  text default null,   -- por_vencer | vencida | reclamo | pagada | null
  p_buscar text default null,   -- nombre o cédula
  p_limite int  default 100,
  p_desde  int  default 0
)
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
declare
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_buscar text := nullif(btrim(coalesce(p_buscar, '')), '');
  v_cedula text := normalize_cedula(coalesce(p_buscar, ''));
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
       and (p_clase is null or clase_deuda(d.status, d.due_date, v_hoy) = p_clase)
       and (
         v_buscar is null
         or coalesce(md.full_name, dt.full_name) ilike '%' || v_buscar || '%'
         or (length(v_cedula) >= 2 and dt.cedula like '%' || v_cedula || '%')
       )
     order by (d.status = 'paid'), d.due_date, d.created_at
     limit greatest(least(p_limite, 500), 1)
    offset greatest(p_desde, 0);
end;
$$;


-- ---- list_clients, paginada y con búsqueda ----------------------------------
drop function if exists public.list_clients();

create or replace function public.list_clients(
  p_filtro text default null,   -- mora | deben | al_dia | null
  p_buscar text default null,
  p_limite int  default 100,
  p_desde  int  default 0
)
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
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_buscar text := nullif(btrim(coalesce(p_buscar, '')), '');
  v_cedula text := normalize_cedula(coalesce(p_buscar, ''));
  v_solo   text := replace(replace(coalesce(p_buscar, ''), '-', ''), ' ', '');
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  return query
  with resumen as (
    select md.debtor_id, dt.cedula, md.full_name, md.phone, md.phone2, md.address,
           coalesce(sum(case when d.status <> 'paid'
                             then d.amount - coalesce(ab.pagado, 0) else 0 end), 0) as debe,
           count(*) filter (where d.status <> 'paid')::int as pendientes,
           count(*) filter (where d.status in ('active','overdue') and d.due_date < v_hoy)::int as vencidas,
           coalesce(sum(d.amount), 0) as total_fiado,
           max(d.due_date) as ultima_fecha
      from merchant_debtors md
      join debtors dt on dt.id = md.debtor_id
      left join debts d
             on d.debtor_id = md.debtor_id and d.merchant_id = md.merchant_id
      left join lateral (
             select sum(p.amount) as pagado from payments p where p.debt_id = d.id
           ) ab on true
     where md.merchant_id = auth.uid()
       and (
         v_buscar is null
         or md.full_name ilike '%' || v_buscar || '%'
         or (length(v_cedula) >= 2 and dt.cedula like '%' || v_cedula || '%')
         or (length(v_solo) >= 4 and coalesce(md.phone, '') like '%' || v_solo || '%')
       )
     group by md.debtor_id, dt.cedula, md.full_name, md.phone, md.phone2, md.address
  )
  select * from resumen r
   where p_filtro is null
      or (p_filtro = 'mora'   and r.vencidas > 0)
      or (p_filtro = 'deben'  and r.pendientes > 0 and r.vencidas = 0)
      or (p_filtro = 'al_dia' and r.pendientes = 0)
   order by (r.debe = 0), r.debe desc, r.full_name
   limit greatest(least(p_limite, 500), 1)
  offset greatest(p_desde, 0);
end;
$$;


-- ---- get_clients_summary ----------------------------------------------------
-- Los contadores de la pestaña Clientes, también sobre el total.
create or replace function public.get_clients_summary()
returns table (
  total      int,
  en_mora    int,
  con_deuda  int,
  al_dia     int,
  debido     numeric
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
  with resumen as (
    select md.debtor_id,
           coalesce(sum(case when d.status <> 'paid'
                             then d.amount - coalesce(ab.pagado, 0) else 0 end), 0) as debe,
           count(*) filter (where d.status <> 'paid')::int as pendientes,
           count(*) filter (where d.status in ('active','overdue') and d.due_date < v_hoy)::int as vencidas
      from merchant_debtors md
      left join debts d
             on d.debtor_id = md.debtor_id and d.merchant_id = md.merchant_id
      left join lateral (
             select sum(p.amount) as pagado from payments p where p.debt_id = d.id
           ) ab on true
     where md.merchant_id = auth.uid()
     group by md.debtor_id
  )
  select count(*)::int,
         count(*) filter (where vencidas > 0)::int,
         count(*) filter (where pendientes > 0 and vencidas = 0)::int,
         count(*) filter (where pendientes = 0)::int,
         coalesce(sum(debe), 0)
    from resumen;
end;
$$;


-- ---- list_payments, acotada a una deuda -------------------------------------
-- Ya no hace falta traerlos todos: el total del mes lo da get_dashboard.
drop function if exists public.list_payments();

create or replace function public.list_payments(p_debt_id uuid default null)
returns table (id uuid, debt_id uuid, amount numeric, paid_at timestamptz)
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
    select p.id, p.debt_id, p.amount, p.paid_at
      from payments p
     where p.merchant_id = auth.uid()
       and (p_debt_id is null or p.debt_id = p_debt_id)
     order by p.paid_at desc
     limit 500;
end;
$$;


-- ---- Privilegios ------------------------------------------------------------
revoke execute on function public.clase_deuda(text, date, date)                from public, anon;
revoke execute on function public.get_dashboard()                              from public, anon;
revoke execute on function public.get_clients_summary()                        from public, anon;
revoke execute on function public.list_debts(text, text, int, int)             from public, anon;
revoke execute on function public.list_clients(text, text, int, int)           from public, anon;
revoke execute on function public.list_payments(uuid)                          from public, anon;

grant execute on function public.get_dashboard()                               to authenticated;
grant execute on function public.get_clients_summary()                         to authenticated;
grant execute on function public.list_debts(text, text, int, int)              to authenticated;
grant execute on function public.list_clients(text, text, int, int)            to authenticated;
grant execute on function public.list_payments(uuid)                           to authenticated;

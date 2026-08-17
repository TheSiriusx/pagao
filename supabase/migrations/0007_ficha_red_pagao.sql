-- ============================================================================
-- Pagao — 0007 — Ficha de la Red Pagao: nombre y total adeudado
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- get_debtor_score pasa a devolver dos datos más: el nombre y el total que la
-- persona debe en la red. Las dos decisiones tienen su razón.
--
-- NOMBRE: el comerciante tiene al cliente enfrente con la cédula en la mano,
-- así que el nombre no le revela nada que no pueda leer del carnet, y le
-- confirma que no se equivocó tecleando. Se prefiere el nombre de SU propia
-- ficha si ya es cliente suyo; si no, el primero con que se registró en la red.
--
-- TOTAL: solo se muestra a partir de 3 deudas activas. Con una sola, el
-- "total de la red" ES el monto exacto que otro comerciante le fió: se estaría
-- publicando el negocio del vecino. Con 3 o más es un agregado del que no se
-- deduce ninguna cifra concreta.
-- ============================================================================

drop function if exists public.get_debtor_score(text);

create or replace function public.get_debtor_score(p_cedula text)
returns table (
  score        int,
  band         text,
  active_debts int,
  full_name    text,
  total_debt   numeric
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cedula text;
  v_plan   text;
  v_exp    timestamptz;
  v_used   int;
  v_id     uuid;
  v_score  int;
  v_active int;
  v_nombre text;
  v_total  numeric;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  select m.plan, m.plan_expires_at, m.free_queries_used
    into v_plan, v_exp, v_used
    from merchants m
   where m.id = auth.uid();

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
    return query select null::int, 'gris'::text, 0, null::text, null::numeric;
    return;
  end if;

  select count(*)::int into v_active
    from debts
   where debtor_id = v_id
     and status in ('active', 'overdue');

  -- Si ya es cliente de quien pregunta, se usa el nombre que él mismo puso.
  select coalesce(
           (select md.full_name from merchant_debtors md
             where md.debtor_id = v_id and md.merchant_id = auth.uid()),
           (select dt.full_name from debtors dt where dt.id = v_id)
         )
    into v_nombre;

  -- El corte de las 3 deudas: por debajo, el total delataría a un comercio.
  if v_active >= 3 then
    select coalesce(sum(dd.amount - coalesce(ab.pagado, 0)), 0)
      into v_total
      from debts dd
      left join lateral (
            select sum(p.amount) as pagado from payments p where p.debt_id = dd.id
           ) ab on true
     where dd.debtor_id = v_id
       and dd.status in ('active', 'overdue');
  else
    v_total := null;
  end if;

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
         v_active,
         v_nombre,
         v_total;
end;
$$;

revoke execute on function public.get_debtor_score(text) from public, anon;
grant  execute on function public.get_debtor_score(text) to authenticated;

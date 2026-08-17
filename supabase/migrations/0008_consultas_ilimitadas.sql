-- ============================================================================
-- Pagao — 0008 — Consultas ilimitadas
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- Cambia el modelo de negocio: se acabó el cobro por consulta. El comerciante
-- paga una mensualidad y consulta la Red Pagao las veces que quiera.
--
-- get_debtor_score deja de lanzar FREE_LIMIT y deja de tocar el contador
-- free_queries_used. La columna se conserva porque guarda el histórico de lo
-- que se consultó bajo el modelo viejo, pero ya no la escribe nadie.
--
-- OJO PARA MÁS ADELANTE: ahora mismo NADA comprueba que la mensualidad esté
-- al día. Cualquier comerciante registrado consulta sin límite, pague o no.
-- Cuando se conecten los pagos de verdad, aquí es donde hay que volver a
-- mirar el plan y su vencimiento antes de responder.
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
  v_id     uuid;
  v_score  int;
  v_active int;
  v_nombre text;
  v_total  numeric;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  -- Sigue haciendo falta ser comerciante: la Red Pagao no se consulta desde
  -- una cuenta suelta sin negocio registrado.
  if not exists (select 1 from merchants where id = auth.uid()) then
    raise exception 'NOT_A_MERCHANT';
  end if;

  v_cedula := normalize_cedula(p_cedula);
  if v_cedula !~ '^[VE][0-9]{6,9}$' then
    raise exception 'INVALID_CEDULA';
  end if;

  select d.id, d.score into v_id, v_score
    from debtors d
   where d.cedula = v_cedula;

  -- Desconocido en la red: gris.
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

  -- El total solo a partir de 3 tiendas: por debajo delataría a un comercio.
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

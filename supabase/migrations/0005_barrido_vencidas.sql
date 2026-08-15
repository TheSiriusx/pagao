-- ============================================================================
-- Pagao — 0005 — Barrido de vencidas comprobable
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- Problema que resuelve: la regla de "a los 30 días pasa a vencida" vivía
-- suelta dentro del job de pg_cron, escrita a mano en el SQL del schedule.
-- Eso la hacía imposible de probar sin esperar 30 días, y además la ponía
-- en riesgo de quedar desincronizada si alguien la cambiaba en un sitio y
-- no en el otro.
--
-- Ahora la regla vive en UNA función. El cron la llama para todos los
-- comercios; el comerciante puede llamarla para el suyo desde la app, y las
-- pruebas la llaman para verificar el comportamiento en segundos.
-- ============================================================================


-- ---- La regla, en un solo sitio --------------------------------------------
-- p_merchant null = todos los comercios (lo que hace el cron de madrugada).
-- No se le da permiso de ejecución a nadie: solo se llega por el envoltorio
-- de abajo, que fuerza auth.uid(), o desde el propio cron como postgres.
create or replace function public.barrer_vencidas(p_merchant uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuantas int;
begin
  update debts
     set status = 'overdue'
   where status = 'active'
     and due_date < ((now() at time zone 'America/Caracas')::date - 30)
     and (p_merchant is null or merchant_id = p_merchant);

  get diagnostics v_cuantas = row_count;
  return v_cuantas;
end;
$$;


-- ---- Envoltorio para la app y las pruebas ----------------------------------
-- Solo puede barrer lo propio: el uid no viaja como parámetro, se toma de la
-- sesión. Devuelve cuántas deudas pasaron a vencida.
create or replace function public.sweep_my_overdue()
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;
  return barrer_vencidas(auth.uid());
end;
$$;


-- ---- Saber si el cron quedó programado -------------------------------------
-- Para que las pruebas puedan confirmar que el barrido automático existe sin
-- necesitar acceso al esquema cron.
create or replace function public.cron_vencidas_activo()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_activo boolean;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  select coalesce(bool_or(active), false) into v_activo
    from cron.job where jobname = 'pagao_mark_overdue';

  return coalesce(v_activo, false);
exception
  when undefined_table or invalid_schema_name or insufficient_privilege then
    -- pg_cron no está habilitado en este proyecto.
    return false;
end;
$$;


-- ---- Privilegios -----------------------------------------------------------
-- barrer_vencidas NO se concede: dejaría barrer los comercios ajenos.
revoke execute on function public.barrer_vencidas(uuid)     from public, anon, authenticated;
revoke execute on function public.sweep_my_overdue()        from public, anon;
revoke execute on function public.cron_vencidas_activo()    from public, anon;

grant execute on function public.sweep_my_overdue()         to authenticated;
grant execute on function public.cron_vencidas_activo()     to authenticated;


-- ---- El cron pasa a usar la misma función ----------------------------------
select cron.unschedule('pagao_mark_overdue')
 where exists (select 1 from cron.job where jobname = 'pagao_mark_overdue');

-- 08:10 UTC = 04:10 en Venezuela.
select cron.schedule(
  'pagao_mark_overdue',
  '10 8 * * *',
  $job$ select public.barrer_vencidas(null) $job$
);

-- ============================================================================
-- Pagao — 0002 — Listado de deudas y teléfono del deudor
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- Por qué hace falta: debtors está cerrada por RLS, así que el comerciante no
-- puede leer ni el nombre de SUS propios clientes con un select directo. En
-- vez de abrir la tabla (que expondría a toda la red), se abre una sola
-- puerta que devuelve exclusivamente los deudores con los que quien llama
-- tiene una deuda registrada.
-- ============================================================================


-- ---- list_debts ------------------------------------------------------------
-- Deudas del comerciante autenticado, con el nombre y la cédula del deudor.
--
-- Declarada STABLE a propósito: así PostgREST la acepta por GET, y el service
-- worker puede cachear la respuesta para que la lista se vea sin señal. Las
-- funciones que cambian datos (create_debt, mark_debt_paid) y la que cobra
-- consultas (get_debtor_score) siguen siendo VOLATILE y viajan por POST, que
-- el service worker nunca cachea.
create or replace function public.list_debts()
returns table (
  id           uuid,
  debtor_id    uuid,
  cedula       text,
  full_name    text,
  phone        text,
  amount       numeric,
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
    select d.id, d.debtor_id, dt.cedula, dt.full_name, dt.phone,
           d.amount, d.due_date, d.status, d.notes,
           d.payment_date, d.days_late, d.created_at
      from debts d
      join debtors dt on dt.id = d.debtor_id
     where d.merchant_id = auth.uid()      -- <- el aislamiento vive aquí
     order by (d.status = 'paid'), d.due_date, d.created_at;
end;
$$;


-- ---- set_debtor_phone ------------------------------------------------------
-- Para poder mandar el recordatorio por WhatsApp hace falta el teléfono del
-- cliente, y a veces la deuda se registró sin él. Solo puede tocarlo un
-- comerciante que YA tenga una deuda con ese deudor: si no, cualquiera podría
-- reescribir el teléfono de un desconocido de la red.
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

  if not exists (
    select 1 from debts
     where debtor_id = p_debtor_id
       and merchant_id = auth.uid()
  ) then
    raise exception 'NOT_YOUR_CLIENT';
  end if;

  update debtors
     set phone = nullif(btrim(p_phone), '')
   where id = p_debtor_id;
end;
$$;


-- ---- Privilegios de ejecución ---------------------------------------------
revoke execute on function public.list_debts()                        from public, anon;
revoke execute on function public.set_debtor_phone(uuid, text)        from public, anon;

grant execute on function public.list_debts()                         to authenticated;
grant execute on function public.set_debtor_phone(uuid, text)         to authenticated;

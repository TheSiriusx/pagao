-- ============================================================================
-- Pagao — 0004 — Editar, borrar y reclamos
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- Hasta ahora un error de tecleo quedaba grabado para siempre: si escribías
-- $500 en vez de $50, no había forma de arreglarlo desde la app.
--
-- Regla que atraviesa todo el archivo: una deuda PAGADA ya movió el score del
-- deudor a través del trigger. Editarla o borrarla dejaría el puntaje colgado
-- de un hecho que ya no existe, así que las cuatro funciones se niegan a
-- tocar deudas cerradas. Para eso está el reclamo (disputed).
-- ============================================================================


-- ---- update_debt -----------------------------------------------------------
create or replace function public.update_debt(
  p_debt_id  uuid,
  p_amount   numeric,
  p_due_date date,
  p_notes    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_pagado numeric;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_due_date is null then
    raise exception 'INVALID_DUE_DATE';
  end if;

  select d.status into v_status
    from debts d
   where d.id = p_debt_id and d.merchant_id = auth.uid()
   for update;

  if not found then
    raise exception 'NOT_YOUR_DEBT';
  end if;
  if v_status = 'paid' then
    raise exception 'ALREADY_PAID';
  end if;

  select coalesce(sum(p.amount), 0) into v_pagado
    from payments p where p.debt_id = p_debt_id;

  -- No se puede bajar el monto por debajo de lo que el cliente ya abonó:
  -- quedaría debiendo menos que cero.
  if p_amount < v_pagado - 0.005 then
    raise exception 'AMOUNT_BELOW_PAID';
  end if;

  update debts
     set amount   = p_amount,
         due_date = p_due_date,
         notes    = nullif(btrim(p_notes), '')
   where id = p_debt_id;

  -- Si al corregir el monto resulta que ya estaba cubierto por los abonos,
  -- la deuda se cierra. Este update sí dispara trg_apply_score.
  if v_pagado >= p_amount - 0.005 then
    update debts set status = 'paid', payment_date = now() where id = p_debt_id;
  end if;
end;
$$;


-- ---- delete_debt -----------------------------------------------------------
-- Los abonos asociados caen solos por el on delete cascade de payments.
create or replace function public.delete_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  select d.status into v_status
    from debts d
   where d.id = p_debt_id and d.merchant_id = auth.uid()
   for update;

  if not found then
    raise exception 'NOT_YOUR_DEBT';
  end if;

  -- Una deuda pagada ya sumó o restó puntos en el historial del deudor.
  -- Borrarla dejaría ese movimiento sin respaldo.
  if v_status = 'paid' then
    raise exception 'CANNOT_DELETE_PAID';
  end if;

  delete from debts where id = p_debt_id;
end;
$$;


-- ---- delete_payment --------------------------------------------------------
create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt   uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  select p.debt_id into v_debt
    from payments p
   where p.id = p_payment_id and p.merchant_id = auth.uid();

  if not found then
    raise exception 'NOT_YOUR_PAYMENT';
  end if;

  select d.status into v_status from debts d where d.id = v_debt for update;

  -- Quitar un abono de una deuda ya cerrada obligaría a reabrirla y a
  -- deshacer el cambio de score. Se prohíbe en vez de adivinar.
  if v_status = 'paid' then
    raise exception 'DEBT_ALREADY_PAID';
  end if;

  delete from payments where id = p_payment_id;
end;
$$;


-- ---- set_debt_disputed -----------------------------------------------------
-- El cliente dice que ya pagó y hay que revisarlo. Marcarla en reclamo la
-- saca de la cuenta de "te deben" sin borrarla ni tocar el score: el trigger
-- solo reacciona a 'paid' y a 'overdue', así que este cambio pasa de largo.
create or replace function public.set_debt_disputed(p_debt_id uuid, p_disputed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  select d.status into v_status
    from debts d
   where d.id = p_debt_id and d.merchant_id = auth.uid()
   for update;

  if not found then
    raise exception 'NOT_YOUR_DEBT';
  end if;
  if v_status = 'paid' then
    raise exception 'ALREADY_PAID';
  end if;

  update debts
     set status = case when p_disputed then 'disputed' else 'active' end
   where id = p_debt_id;
end;
$$;


-- ---- Privilegios de ejecución ---------------------------------------------
revoke execute on function public.update_debt(uuid, numeric, date, text) from public, anon;
revoke execute on function public.delete_debt(uuid)                      from public, anon;
revoke execute on function public.delete_payment(uuid)                   from public, anon;
revoke execute on function public.set_debt_disputed(uuid, boolean)       from public, anon;

grant execute on function public.update_debt(uuid, numeric, date, text)  to authenticated;
grant execute on function public.delete_debt(uuid)                       to authenticated;
grant execute on function public.delete_payment(uuid)                    to authenticated;
grant execute on function public.set_debt_disputed(uuid, boolean)        to authenticated;

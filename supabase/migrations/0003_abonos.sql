-- ============================================================================
-- Pagao — 0003 — Abonos parciales
-- ============================================================================
-- Pegar completo en Supabase Studio → SQL Editor → Run. Idempotente.
--
-- En el fiado real el cliente abona $10 de $50 el viernes y el resto el
-- martes. Hasta ahora una deuda solo podía estar pagada o no pagada.
--
-- Decisión de diseño: el score NO se toca. El abono que completa la deuda es
-- el que hace el update de status a 'paid', y ese update dispara el trigger
-- trg_apply_score que ya existe. Los días de atraso se cuentan desde el
-- último abono, que es cuando la deuda quedó saldada de verdad.
-- ============================================================================


-- ---- Tabla de abonos -------------------------------------------------------
-- Una fila por abono, no un contador: el comerciante necesita poder mirar
-- cuándo y cuánto le fue abonando cada cliente.
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  debt_id     uuid not null references debts(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  paid_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists payments_debt_idx     on payments (debt_id);
create index if not exists payments_merchant_idx on payments (merchant_id, paid_at desc);

alter table payments enable row level security;
drop policy if exists payments_own on payments;
create policy payments_own on payments
  for all using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());

-- Lectura directa sí (la filtra RLS); escritura solo por RPC, como en debts.
revoke all on table payments from anon, authenticated;
grant select on table payments to authenticated;


-- ---- add_payment -----------------------------------------------------------
create or replace function public.add_payment(p_debt_id uuid, p_amount numeric)
returns table (abonado numeric, saldo numeric, quedo_pagada boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total  numeric;
  v_status text;
  v_pagado numeric;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- for update: si el comerciante toca "abonar" dos veces seguidas, el
  -- segundo se espera al primero en vez de sumar sobre un saldo viejo.
  select d.amount, d.status into v_total, v_status
    from debts d
   where d.id = p_debt_id
     and d.merchant_id = auth.uid()
   for update;

  if not found then
    raise exception 'NOT_YOUR_DEBT';
  end if;
  if v_status = 'paid' then
    raise exception 'ALREADY_PAID';
  end if;

  select coalesce(sum(p.amount), 0) into v_pagado
    from payments p where p.debt_id = p_debt_id;

  -- La tolerancia de un céntimo evita que un redondeo bloquee el último abono.
  if p_amount > (v_total - v_pagado) + 0.005 then
    raise exception 'AMOUNT_TOO_BIG';
  end if;

  insert into payments (debt_id, merchant_id, amount)
  values (p_debt_id, auth.uid(), p_amount);

  v_pagado := v_pagado + p_amount;

  if v_pagado >= v_total - 0.005 then
    -- Este UPDATE es el que dispara trg_apply_score. El score se recalcula
    -- ahí, igual que antes: aquí no se toca ni un punto.
    update debts set status = 'paid', payment_date = now() where id = p_debt_id;
  end if;

  return query select v_pagado,
                      greatest(v_total - v_pagado, 0),
                      (v_pagado >= v_total - 0.005);
end;
$$;


-- ---- mark_debt_paid (actualizada) ------------------------------------------
-- Ahora deja registrado el saldo restante como un abono final, para que la
-- suma de abonos siempre cuadre con el monto de la deuda. Sin esto, "cobrado
-- este mes" mentiría en cuanto alguien usara el botón de pago completo.
create or replace function public.mark_debt_paid(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total  numeric;
  v_status text;
  v_pagado numeric;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTH';
  end if;

  select d.amount, d.status into v_total, v_status
    from debts d
   where d.id = p_debt_id
     and d.merchant_id = auth.uid()
   for update;

  if not found or v_status = 'paid' then
    raise exception 'NOT_YOUR_DEBT_OR_ALREADY_PAID';
  end if;

  select coalesce(sum(p.amount), 0) into v_pagado
    from payments p where p.debt_id = p_debt_id;

  if v_total - v_pagado > 0 then
    insert into payments (debt_id, merchant_id, amount)
    values (p_debt_id, auth.uid(), v_total - v_pagado);
  end if;

  update debts set status = 'paid', payment_date = now() where id = p_debt_id;
end;
$$;


-- ---- list_debts (actualizada) ----------------------------------------------
-- Se agrega abonado: lo que el cliente lleva pagado de esa deuda.
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
    select d.id, d.debtor_id, dt.cedula, dt.full_name, dt.phone,
           d.amount,
           coalesce((select sum(p.amount) from payments p where p.debt_id = d.id), 0),
           d.due_date, d.status, d.notes,
           d.payment_date, d.days_late, d.created_at
      from debts d
      join debtors dt on dt.id = d.debtor_id
     where d.merchant_id = auth.uid()      -- <- el aislamiento vive aquí
     order by (d.status = 'paid'), d.due_date, d.created_at;
end;
$$;


-- ---- list_payments ---------------------------------------------------------
-- Para el resumen de "cobrado este mes" y el historial de abonos por deuda.
create or replace function public.list_payments()
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
     order by p.paid_at desc;
end;
$$;


-- ---- Privilegios de ejecución ---------------------------------------------
revoke execute on function public.add_payment(uuid, numeric) from public, anon;
revoke execute on function public.list_debts()                from public, anon;
revoke execute on function public.list_payments()             from public, anon;
revoke execute on function public.mark_debt_paid(uuid)        from public, anon;

grant execute on function public.add_payment(uuid, numeric)   to authenticated;
grant execute on function public.list_debts()                 to authenticated;
grant execute on function public.list_payments()              to authenticated;
grant execute on function public.mark_debt_paid(uuid)         to authenticated;

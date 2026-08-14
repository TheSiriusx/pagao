# Pagao

PWA para comerciantes: lleva el fiado, calcula un score de crédito colaborativo
por cédula y manda el recordatorio de cobro por WhatsApp.

React 19 + Vite + Tailwind · Supabase (Postgres, Auth por teléfono, RLS, RPC) · Vercel.

## Arrancar

```bash
npm install
cp .env.example .env      # y llena los dos valores
npm run dev
```

`.env` lleva **solo** estas dos variables:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci…
```

Todo lo que empieza con `VITE_` se empaqueta en el bundle que descarga el
navegador. La anon key está diseñada para ser pública porque la autorización
real la hace RLS en la base de datos. Nunca metas aquí una `service_role` key
ni tokens de terceros.

## Base de datos

Pega `supabase/migrations/0001_pagao_mvp_v1.sql` completo en Supabase Studio →
SQL Editor. Es idempotente.

Reglas que sostienen todo:

- `merchants.id` **es** el uid de Auth. Toda política compara contra `auth.uid()`.
- `debtors` y `score_history` están cerradas por RLS, sin una sola política. Al
  score solo se llega por `get_debtor_score()`, que devuelve puntaje, color y
  número de deudas activas — nunca nombres, montos ni comercios ajenos.
- Las escrituras de `debts` van por RPC (`create_debt`, `mark_debt_paid`). El
  cliente solo tiene `SELECT`.
- En `merchants`, `plan` / `plan_expires_at` / `free_queries_used` no están en
  los GRANT del rol `authenticated`: el paywall no se puede editar desde el
  navegador.
- El score lo recalcula el trigger `trg_apply_score`, nunca el cliente.

## Auth

Por ahora se entra con **correo y contraseña**. En Supabase:

**Authentication → Sign In / Providers → Email** → activado, y **Confirm email**
apagado. Así el registro entra de una vez y no hace falta ningún servicio
externo.

El OTP por teléfono queda pendiente: Supabase exige un proveedor de SMS
(Twilio) hasta para los códigos de prueba. Cuando se retome, el cambio es solo
`src/pages/Login.jsx` — sigue habiendo sesión de Auth, así que `auth.uid()`
existe y ni las políticas RLS ni las RPC se tocan.

Nota: entrando por correo, `merchants.phone` ya no sale de la sesión, así que
el registro del negocio lo pide como campo obligatorio.

## Estructura

```
src/
  components/UI.jsx        Botón, Campo, Alerta, Cargando, Logo
  context/AuthContext.jsx  Sesión + ficha del comerciante
  lib/supabase.js          Cliente (solo URL + anon key)
  lib/formato.js           Cédulas, teléfonos y montos venezolanos
  lib/errores.js           Errores de Supabase → español
  lib/bancos.js            Bancos con código de Pago Móvil
  pages/                   Login, RegistroComercio, Inicio
supabase/migrations/       SQL para pegar en Supabase Studio
```
# pagoo
# pagoo
# pagao

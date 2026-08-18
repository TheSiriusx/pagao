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

Se entra con **correo y contraseña**. En Supabase:

**Authentication → Sign In / Providers → Email** → activado, y **Confirm email**
apagado. Así el registro entra de una vez y no hace falta ningún servicio
externo.

El OTP por SMS quedó descartado: Supabase exige un proveedor (Twilio) hasta
para los códigos de prueba, y cada mensaje a Venezuela cuesta más que la
consulta de score que se cobra. El teléfono del comerciante se sigue pidiendo
en el registro del negocio — es contacto, no credencial — y `merchants.phone`
es obligatorio.

**Recuperar la contraseña** está implementado: *Olvidé mi contraseña* manda un
enlace, y al volver con él la app detecta el evento `PASSWORD_RECOVERY` y pide
la clave nueva antes de dejar entrar.

Para que funcione hacen falta dos cosas en Supabase:

1. **Authentication → URL Configuration**: la URL del sitio en *Site URL* y en
   *Redirect URLs* (`http://localhost:5173` para desarrollo, el dominio de
   Vercel para producción). Sin esto el enlace del correo no vuelve a la app.
2. **Un SMTP propio** en *Project Settings → Auth → SMTP Settings*. El
   integrado de Supabase manda unos pocos correos por hora y está pensado solo
   para pruebas: con él, en producción, la mayoría de la gente no recibiría
   nada. Resend da 3.000 correos gratis al mes.

## Pruebas

```bash
npm run test:todo
```

Dos capas:

- **`npm test`** — las reglas, contra la base de datos real y usando solo la
  anon key: las mismas credenciales que lleva el navegador de un comerciante.
  Si una prueba consigue hacer algo, un usuario también puede.
- **`npm run test:ui`** — la interfaz, con un Chromium real a 320px y Supabase
  simulado en memoria. Incluye el service worker y la lectura sin señal.

Detalle y limpieza de los datos de prueba en [tests/README.md](tests/README.md).

## Despliegue

Vercel detecta Vite solo. Solo hay que darle las dos variables de entorno
(`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) y, después del primer deploy,
añadir el dominio en Supabase → Authentication → URL Configuration, tanto en
*Site URL* como en *Redirect URLs*. Sin eso el enlace de recuperar contraseña
no vuelve a la app.

`vercel.json` fija las cabeceras de caché. La regla que importa es la del
service worker: si el navegador se queda con uno viejo, el comerciante sigue
viendo una versión anterior de la app aunque publiques cien veces. Los assets
llevan hash en el nombre, así que esos sí se cachean para siempre.

Ojo al editarlo: **el esquema de Vercel rechaza cualquier propiedad que no
conozca**, incluidas las que se añadan a modo de comentario. JSON no admite
comentarios y Vercel no perdona el intento.

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

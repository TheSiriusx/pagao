# Pruebas del sistema

```bash
npm test          # base de datos y reglas, contra Supabase real
npm run test:ui   # interfaz y PWA, con un navegador real
npm run test:todo # las dos cosas
```

Ambas salen con código 1 si algo falla.

## Pruebas de datos — `npm test`

| Suite | Qué verifica |
|---|---|
| `00-esquema` | Que las 13 funciones RPC existan y que ninguna tabla ni función se pueda tocar sin sesión |
| `01-aislamiento` | Que un comerciante no vea ni escriba nada de otro, que el paywall no se pueda editar desde el navegador y que la cédula se normalice |
| `02-abonos` | Que los abonos cuadren, que no se pueda abonar de más y que el último abono dispare el trigger del score |
| `03-edicion` | Editar, borrar, reclamos y teléfono del cliente. Que una deuda pagada quede congelada |
| `04-vencidas` | El barrido de los 30 días: dónde cae el corte, que solo barra lo propio y que caer en vencida reste 30 puntos |
| `05-clientes` | Que la dirección y los teléfonos NO se filtren entre comercios, aunque el score sí sea compartido |
| `06-ficha-red` | El corte de las 3 tiendas para mostrar el total adeudado |
| `07-seguridad` | Intenta romper la app: incrustación de tablas, inyección, suplantación, escalada de privilegios, borrado ajeno |
| `08-paginacion` | Crea 1100 fiados, por encima del corte de PostgREST, y comprueba que los totales sigan siendo exactos |

## Pruebas de interfaz — `npm run test:ui`

Manejan un Chromium real a **320px de ancho**, que es la pantalla más angosta
que la app promete soportar.

| Suite | Qué verifica |
|---|---|
| `ui/01-flujo` | Recorrido completo: entrar, registrar el negocio, crear un fiado, abonar, corregir, reclamar, consultar la Red Pagao, toparse con el paywall y revisar ajustes |
| `ui/02-pwa` | Manifest, iconos, registro del service worker, que la app se dibuje sin conexión y que las consultas de score **nunca** queden en caché |

Aquí Supabase está **simulado en memoria** (`ui/simulador.mjs`). Las pruebas de
interfaz no deben tocar la base real: serían lentas, dejarían basura en la Red
Pagao y fallarían por cosas ajenas al frontend. Lo que se comprueba es que las
pantallas dibujen, que los formularios validen y que los errores del servidor
se muestren en español; que las reglas del servidor funcionen de verdad ya lo
cubren las suites de datos.

Cada pantalla se guarda en `tests/ui/capturas/` — útil para mirar un cambio de
diseño antes y después. No se versionan.

## Por qué solo usan la anon key

Las pruebas hablan con Supabase con exactamente las mismas credenciales que
lleva el navegador de un comerciante: la URL del proyecto y la anon key del
`.env`. No hay ninguna llave de servicio ni atajo.

Eso significa que **si una prueba consigue hacer algo, un usuario también
puede**. Y al revés: cuando una prueba recibe `permission denied`, ese candado
es real, no una simulación.

## Requisitos

- El `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- Las cuatro migraciones de `supabase/migrations` aplicadas
- En Supabase: proveedor **Email** activo y **Confirm email** apagado

Si falla la suite `00`, casi siempre es una migración sin aplicar. El runner
se detiene ahí a propósito, para no llenar la pantalla de errores derivados.

## Datos de prueba

Cada corrida crea unos 6 usuarios de Auth con sus negocios, sus fiados y sus
abonos. Los correos llevan el prefijo `pagao.test.` y un sello de tiempo, así
que nunca chocan entre corridas.

**No se limpian solos.** Una deuda pagada no se puede borrar por diseño — su
pago ya movió el score del deudor — así que las pruebas no pueden deshacer su
propio rastro. Para limpiarlo, pega esto en el SQL Editor:

```sql
-- Borra todos los comerciantes de prueba. Sus deudas, abonos e historial
-- caen en cascada.
delete from auth.users where email like 'pagao.test.%@pagaotest.com';

-- Los deudores inventados por las pruebas no cuelgan de ningún usuario,
-- así que hay que barrerlos aparte.
delete from debtors
 where id not in (select debtor_id from debts)
   and cedula ~ '^V[0-9]{9}$';
```

Conviene hacerlo de vez en cuando: los deudores de prueba se quedan en la Red
Pagao con su score, y ensucian las consultas reales.

## Límite de Supabase

El registro de usuarios está limitado por hora en el plan gratuito. Unas
cinco corridas seguidas y empezarás a ver errores al crear los comerciantes de
prueba. Espera un rato y vuelve.

## Lo que NO cubren

- **Un teléfono de verdad.** Chromium a 320px se acerca, pero no reemplaza
  probar en el aparato: el teclado que tapa medio formulario, el pulgar que no
  alcanza, la pantalla al sol.
- **Que el cron dispare a las 4am.** Se comprueba que el job esté programado y
  que la regla del barrido funcione, pero no que el planificador de Supabase
  lo ejecute puntualmente.
- **WhatsApp.** Se verifica que se arme el mensaje, no que `wa.me` abra la app
  en el teléfono.
- **Supabase real desde la interfaz.** Las pruebas de UI usan el simulador. Un
  cambio en las RPC que rompa el frontend lo cazan las suites de datos, no
  estas.

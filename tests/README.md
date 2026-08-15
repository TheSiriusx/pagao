# Pruebas del sistema

```bash
npm test
```

Corre las cuatro suites contra la base de datos real y sale con código 1 si
algo falla.

## Qué comprueban

| Suite | Qué verifica |
|---|---|
| `00-esquema` | Que las 11 funciones RPC existan y que ninguna tabla ni función se pueda tocar sin sesión |
| `01-aislamiento` | Que un comerciante no vea ni escriba nada de otro, que el paywall no se pueda editar desde el navegador y que la cédula se normalice |
| `02-abonos` | Que los abonos cuadren, que no se pueda abonar de más y que el último abono dispare el trigger del score |
| `03-edicion` | Editar, borrar, reclamos y teléfono del cliente. Que una deuda pagada quede congelada |

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

- **La interfaz.** No se renderiza ninguna pantalla: esto prueba la base de
  datos y las reglas, no los botones.
- **El job de pg_cron** que marca vencidas las deudas de más de 30 días. Solo
  se puede comprobar dejando pasar el tiempo o llamando al `update` a mano.
- **El service worker** y el modo sin señal.

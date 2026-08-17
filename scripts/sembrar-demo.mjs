#!/usr/bin/env node
/**
 * Crea un comercio de demostración con datos realistas.
 *
 *   npm run demo
 *
 * Sirve para enseñar la app llena sin tocar tu cuenta ni inventar capturas.
 * Usa solo la anon key, así que todo lo que hace lo podría hacer cualquier
 * comerciante desde el navegador.
 *
 * Los correos terminan en @pagaotest.com, así que el script de limpieza
 * (supabase/limpiar-datos-de-prueba.sql) se los lleva junto con los datos de
 * las pruebas. No dejes esto vivo cuando abras la app a gente real.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL_BASE = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SELLO = Date.now().toString().slice(-6)

const CORREO = `demo.${SELLO}@pagaotest.com`
const CLAVE = 'PagaoDemo2026'

async function api(ruta, { token, metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const t = await r.text()
  let datos = null
  try {
    datos = t ? JSON.parse(t) : null
  } catch {
    datos = t
  }
  if (r.status >= 400) throw new Error(`${ruta} → ${r.status} ${JSON.stringify(datos)}`)
  return datos
}

const rpc = (n, tok, args = {}) => api(`/rest/v1/rpc/${n}`, { token: tok, metodo: 'POST', cuerpo: args })

const fecha = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)

async function crearComercio(correo, clave, negocio, dueno, telefono) {
  const alta = await api('/auth/v1/signup', { metodo: 'POST', cuerpo: { email: correo, password: clave } })
  if (!alta?.access_token) throw new Error(`No se pudo crear ${correo}: ${JSON.stringify(alta)}`)
  await api('/rest/v1/merchants', {
    token: alta.access_token,
    metodo: 'POST',
    cuerpo: {
      id: alta.user.id,
      phone: telefono,
      business_name: negocio,
      owner_name: dueno,
      bank_name: '0134 - Banesco',
      bank_phone: telefono,
    },
  })
  return alta.access_token
}

// ---------------------------------------------------------------------------

console.log('\nSembrando el comercio de demostración…\n')

const tok = await crearComercio(
  CORREO, CLAVE, 'Bodega La Esquina', 'María Pérez', `+58412${SELLO}0`,
)
console.log('  Comercio creado: Bodega La Esquina')

// Cédula que va a tener historial en varias tiendas, para lucir la Red Pagao.
const CED_ESTRELLA = `V${SELLO}101`

const CLIENTES = [
  {
    cedula: CED_ESTRELLA, nombre: 'Juan Pérez', tel: '+584141234567', tel2: '+582125551234',
    dir: 'Calle Sucre, casa 24, al lado de la panadería',
    fiados: [
      { monto: 45.5, vence: -12, nota: '2 bultos de harina' },
      { monto: 30, vence: 5, nota: 'Aceite y azúcar', abono: 10 },
    ],
  },
  {
    cedula: `V${SELLO}102`, nombre: 'Carmen Rodríguez', tel: '+584241119988',
    dir: 'Av. Bolívar, edificio Los Pinos, apto 3-B',
    fiados: [
      { monto: 120, vence: -45, nota: 'Compra del mes' },
      { monto: 25, vence: -3, nota: 'Pan y leche' },
    ],
  },
  {
    cedula: `V${SELLO}103`, nombre: 'José Gregorio Martínez', tel: '+584167778899',
    dir: 'Sector La Vega, calle 5',
    fiados: [{ monto: 18, vence: 10, nota: 'Refrescos' }],
  },
  {
    cedula: `V${SELLO}104`, nombre: 'Yolanda Fernández', tel: '+584262223344',
    dir: 'Frente al liceo, casa verde',
    fiados: [
      { monto: 60, vence: -20, nota: 'Pañales y fórmula', abono: 35 },
      { monto: 15, vence: 20, nota: 'Café' },
    ],
  },
  {
    cedula: `V${SELLO}105`, nombre: 'Pedro Ramírez', tel: '+584125556677',
    dir: 'Calle Miranda, quinta Santa Rosa',
    fiados: [{ monto: 200, vence: 25, nota: 'Mercado completo', abono: 80 }],
  },
  {
    cedula: `V${SELLO}106`, nombre: 'Ana Teresa Gómez', tel: null,
    dir: 'No me dio la dirección',
    fiados: [{ monto: 12.5, vence: -1, nota: 'Fiado del viernes' }],
  },
  {
    cedula: `V${SELLO}107`, nombre: 'Luis Alberto Silva', tel: '+584149998877',
    dir: 'Bloque 3, apto 12',
    fiados: [{ monto: 80, vence: 15, nota: 'Cerveza para la fiesta', reclamo: true }],
  },
  {
    cedula: `V${SELLO}108`, nombre: 'Rosa Elena Blanco', tel: '+584241112233',
    dir: 'Calle Comercio, al lado de la farmacia',
    fiados: [
      { monto: 40, vence: -8, nota: 'Compra semanal', pagado: true },
      { monto: 22, vence: 12, nota: 'Detergente y jabón' },
    ],
  },
]

let fiados = 0
for (const c of CLIENTES) {
  for (const f of c.fiados) {
    const id = await rpc('create_debt', tok, {
      p_cedula: c.cedula,
      p_full_name: c.nombre,
      p_amount: f.monto,
      p_due_date: fecha(f.vence),
      p_notes: f.nota,
      p_phone: c.tel,
      p_phone2: c.tel2 ?? null,
      p_address: c.dir,
    })
    fiados += 1

    if (f.abono) await rpc('add_payment', tok, { p_debt_id: id, p_amount: f.abono })
    if (f.pagado) await rpc('mark_debt_paid', tok, { p_debt_id: id })
    if (f.reclamo) await rpc('set_debt_disputed', tok, { p_debt_id: id, p_disputed: true })
  }
}
console.log(`  ${CLIENTES.length} clientes y ${fiados} fiados`)

// --- Historial en otras tiendas, para que la Red Pagao tenga qué mostrar ----
// El total adeudado solo aparece con 3 o más tiendas, así que hacen falta
// vecinos que también le hayan fiado a la misma persona.
const VECINOS = [
  ['Abasto Don Pedro', 'Pedro Suárez', 35],
  ['Charcutería El Buen Sabor', 'Luisa Mendoza', 28],
  ['Licorería La Placita', 'Ramón Díaz', 40],
]

for (const [i, [negocio, dueno, monto]] of VECINOS.entries()) {
  const t = await crearComercio(
    `demo.vecino${i}.${SELLO}@pagaotest.com`, CLAVE, negocio, dueno, `+58414${SELLO}${i}`,
  )
  await rpc('create_debt', t, {
    p_cedula: CED_ESTRELLA,
    p_full_name: 'Juan Pérez',
    p_amount: monto,
    p_due_date: fecha(10),
    p_notes: null,
  })

  // Cada vecino le paga a tiempo un fiado viejo, para subirle el score.
  const previo = await rpc('create_debt', t, {
    p_cedula: CED_ESTRELLA, p_full_name: 'Juan Pérez', p_amount: 20, p_due_date: fecha(3),
  })
  await rpc('mark_debt_paid', t, { p_debt_id: previo })
}
console.log(`  ${VECINOS.length} tiendas vecinas con historial de ${CED_ESTRELLA}`)

// La consulta se hace con un comercio desechable, no con el de demostración:
// si no, se le gastaría la consulta gratis y al entrar a la app verías el
// modal de pago en vez de la ficha.
const tokMiron = await crearComercio(
  `demo.miron.${SELLO}@pagaotest.com`, CLAVE, 'Mirón', 'Nadie', `+58426${SELLO}9`,
)
const ficha = (await rpc('get_debtor_score', tokMiron, { p_cedula: CED_ESTRELLA }))?.[0]

console.log('\n' + '='.repeat(58))
console.log('  ENTRA CON ESTO')
console.log('='.repeat(58))
console.log(`  Correo      ${CORREO}`)
console.log(`  Contraseña  ${CLAVE}`)
console.log()
console.log('  Para probar la Red Pagao, busca esta cédula:')
console.log(`     ${CED_ESTRELLA}`)
if (ficha) {
  console.log(`     score ${ficha.score} · ${ficha.band} · ${ficha.active_debts} tiendas · total $${ficha.total_debt}`)
}
console.log()
console.log('  El comercio conserva su consulta gratis, así que la primera')
console.log('  búsqueda te muestra la ficha completa. La segunda dispara el')
console.log('  paywall, que también vale la pena ver.')
console.log('='.repeat(58) + '\n')

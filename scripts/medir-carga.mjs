#!/usr/bin/env node
/**
 * Mide cuánto aguanta la app antes de ponerse lenta.
 *
 *   npm run carga
 *
 * No adivina: crea un comerciante, le va metiendo fiados y cronometra las
 * tres consultas que hace la app al abrirse, en varios tamaños. Con eso se ve
 * la curva real en vez de una estimación de servilleta.
 *
 * Deja bastantes datos de prueba. Correr limpiar-datos-de-prueba.sql después.
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

async function api(ruta, { token, metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const t = await r.text()
  let datos = null
  try { datos = t ? JSON.parse(t) : null } catch { datos = t }
  if (r.status >= 400) throw new Error(`${ruta} → ${r.status} ${JSON.stringify(datos).slice(0, 120)}`)
  return { datos, bytes: t.length }
}
const rpc = (n, tok, args = {}, get = false) =>
  get
    ? api(`/rest/v1/rpc/${n}`, { token: tok })
    : api(`/rest/v1/rpc/${n}`, { token: tok, metodo: 'POST', cuerpo: args })

const fecha = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)

/** Mediana de varias corridas: una sola medición miente por el ruido de red. */
async function cronometrar(fn, veces = 5) {
  const tiempos = []
  let bytes = 0
  for (let i = 0; i < veces; i++) {
    const t0 = performance.now()
    const r = await fn()
    tiempos.push(performance.now() - t0)
    bytes = r?.bytes ?? bytes
  }
  tiempos.sort((a, b) => a - b)
  return { ms: Math.round(tiempos[Math.floor(veces / 2)]), bytes }
}

console.log('\nPagao — medición de carga')
console.log('='.repeat(64))

const correo = `carga.${SELLO}@pagaotest.com`
const alta = await api('/auth/v1/signup', {
  metodo: 'POST', cuerpo: { email: correo, password: `Carga-${SELLO}!` },
})
const TOK = alta.datos.access_token
await api('/rest/v1/merchants', {
  token: TOK, metodo: 'POST',
  cuerpo: { id: alta.datos.user.id, phone: `+58412${SELLO}`, business_name: 'Bodega Carga' },
})

const HITOS = [50, 200, 500, 1000, 2000]
const CLIENTES_DISTINTOS = 300 // un cliente puede tener varios fiados

let creados = 0
console.log(`\n  ${'fiados'.padStart(7)}  ${'list_debts'.padStart(11)}  ${'list_payments'.padStart(14)}  ${'list_clients'.padStart(13)}  ${'peso'.padStart(9)}`)
console.log('  ' + '-'.repeat(60))

for (const hito of HITOS) {
  // Se crean en tandas paralelas: en serie tardaría una eternidad.
  while (creados < hito) {
    const tanda = Math.min(25, hito - creados)
    await Promise.all(
      Array.from({ length: tanda }, (_, i) => {
        const n = creados + i
        return rpc('create_debt', TOK, {
          p_cedula: `V${SELLO}${String(n % CLIENTES_DISTINTOS).padStart(3, '0')}`,
          p_full_name: `Cliente ${n % CLIENTES_DISTINTOS}`,
          p_amount: 10 + (n % 90),
          p_due_date: fecha((n % 60) - 30),
          p_notes: 'Compra de prueba',
          p_phone: '+584141234567',
          p_address: 'Calle de prueba, casa 1',
        })
      }),
    )
    creados += tanda
  }

  const deudas = await cronometrar(() => rpc('list_debts', TOK, {}, true))
  const abonos = await cronometrar(() => rpc('list_payments', TOK, {}, true))
  const clientes = await cronometrar(() => rpc('list_clients', TOK, {}, true))

  const peso = deudas.bytes + abonos.bytes + clientes.bytes
  console.log(
    `  ${String(hito).padStart(7)}  ${(deudas.ms + ' ms').padStart(11)}  ${(abonos.ms + ' ms').padStart(14)}` +
    `  ${(clientes.ms + ' ms').padStart(13)}  ${((peso / 1024).toFixed(0) + ' KB').padStart(9)}`,
  )
}

// La consulta a la red no depende del tamaño del comercio, pero sí importa.
const red = await cronometrar(() => rpc('get_debtor_score', TOK, { p_cedula: `V${SELLO}000` }))
console.log(`\n  Consulta a la Red Pagao: ${red.ms} ms`)

console.log('\n' + '='.repeat(64))
console.log('  El peso es lo que descarga el teléfono cada vez que abre la app.')
console.log(`  Datos de prueba bajo el correo ${correo}`)
console.log('='.repeat(64) + '\n')

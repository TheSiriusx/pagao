#!/usr/bin/env node
/**
 * Corre todas las suites contra la base de datos real.
 *
 *   npm test
 *
 * Solo usa la anon key, así que comprueba exactamente lo que puede hacer el
 * navegador de un comerciante. Sale con código 1 si algo falla, para que
 * sirva en un pipeline.
 */
import { SELLO, URL_BASE } from './ayudas.mjs'

import esquema from './00-esquema.mjs'
import aislamiento from './01-aislamiento.mjs'
import abonos from './02-abonos.mjs'
import edicion from './03-edicion.mjs'
import vencidas from './04-vencidas.mjs'
import clientes from './05-clientes.mjs'
import fichaRed from './06-ficha-red.mjs'

const SUITES = [
  ['00', esquema],
  ['01', aislamiento],
  ['02', abonos],
  ['03', edicion],
  ['04', vencidas],
  ['05', clientes],
  ['06', fichaRed],
]

const proyecto = URL_BASE.replace('https://', '').split('.')[0]
console.log(`\nPagao — pruebas del sistema`)
console.log(`Proyecto: ${proyecto}   ·   corrida ${SELLO}`)
console.log('='.repeat(60))

const resultados = []
let reventó = null

for (const [numero, suite] of SUITES) {
  try {
    const r = await suite()
    console.log(`\n[${numero}] ${r.titulo}`)
    resultados.push(r)

    // Si el esquema no está completo, lo demás falla en cascada y el ruido
    // esconde la causa real. Mejor parar y decirlo claro.
    if (numero === '00' && r.fallos.length > 0) {
      console.log('\n  El esquema está incompleto. Se detiene aquí para no llenar')
      console.log('  la pantalla de errores derivados.')
      break
    }
  } catch (e) {
    reventó = e
    console.log(`\n  La suite ${numero} se cayó: ${e.message}`)
    break
  }
}

const pasadas = resultados.reduce((t, r) => t + r.pasadas, 0)
const fallos = resultados.flatMap((r) => r.fallos.map((f) => ({ ...r, ...f })))

console.log('\n' + '='.repeat(60))
for (const r of resultados) {
  const marca = r.fallos.length === 0 ? 'ok  ' : 'FALLA'
  console.log(`  ${marca}  ${r.titulo.padEnd(38)} ${r.pasadas} pasaron`)
}
console.log('='.repeat(60))

if (fallos.length === 0 && !reventó) {
  console.log(`\n  ${pasadas} comprobaciones, todas en verde.\n`)
} else {
  console.log(`\n  ${pasadas} pasaron · ${fallos.length} fallaron\n`)
  for (const f of fallos) {
    console.log(`  · [${f.titulo}] ${f.seccion}`)
    console.log(`      ${f.descripcion}${f.detalle ? `  → ${f.detalle}` : ''}`)
  }
  console.log()
}

if (resultados.length > 0) {
  console.log(`  Los datos de esta corrida llevan el sello ${SELLO}.`)
  console.log('  Para limpiarlos, mira tests/README.md\n')
}

process.exit(fallos.length > 0 || reventó ? 1 : 0)

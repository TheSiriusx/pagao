#!/usr/bin/env node
/**
 * Pruebas de interfaz.
 *
 *   npm run test:ui
 *
 * Levanta la app y la maneja con un navegador real a 320px de ancho. Las
 * llamadas a Supabase se interceptan y responde un backend en memoria, así
 * que estas pruebas son rápidas, deterministas y no dejan ni una fila en la
 * base de datos real.
 *
 * El recorrido corre en el servidor de desarrollo y la suite de PWA contra el
 * build de producción, porque el service worker solo existe en el build.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import flujo from './01-flujo.mjs'
import pwa from './02-pwa.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const CAPTURAS = join(AQUI, 'capturas')

const PUERTO_DEV = 5399
const PUERTO_PREVIEW = 4399

// El host de Supabase se saca del .env para interceptar exactamente ese
// dominio y nada más.
const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const HOST_SUPABASE = new URL(env.VITE_SUPABASE_URL).host

// Si una suite revienta a mitad de camino, sin esto se perderían todas las
// comprobaciones que ya habían pasado y el resumen saldría en cero.
const abiertas = []

function crearSuite(titulo) {
  const fallos = []
  let pasadas = 0
  let seccionActual = null
  const suite = {
    titulo,
    seccion(n) {
      seccionActual = n
      console.log(`\n  ${n}`)
    },
    check(d, cond, det = '') {
      if (cond) {
        pasadas += 1
        console.log(`    ok    ${d}`)
      } else {
        fallos.push({ seccion: seccionActual, descripcion: d, detalle: det })
        console.log(`    FALLA ${d}${det ? `  → ${det}` : ''}`)
      }
    },
    resultado: () => ({ titulo, pasadas, fallos }),
  }
  abiertas.push(suite)
  return suite
}

function lanzar(args, puerto) {
  // detached crea un grupo de procesos propio. Sin esto, matar el proceso de
  // npx deja vivo al vite que hay debajo, y la siguiente corrida se encuentra
  // el puerto ocupado.
  const proc = spawn('npx', args, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => reject(new Error(`El servidor en ${puerto} no arrancó`)), 90000)
    const mirar = (b) => {
      if (b.toString().includes(`:${puerto}`)) {
        clearTimeout(limite)
        setTimeout(() => resolve(proc), 700)
      }
    }
    proc.stdout.on('data', mirar)
    proc.stderr.on('data', mirar)
    proc.on('error', reject)
  })
}

const capturar = (p, nombre) => p.screenshot({ path: join(CAPTURAS, `${nombre}.png`), fullPage: true })

// ---------------------------------------------------------------------------

rmSync(CAPTURAS, { recursive: true, force: true })
mkdirSync(CAPTURAS, { recursive: true })

console.log('\nPagao — pruebas de interfaz')
console.log('Navegador real a 320px · Supabase simulado en memoria')
console.log('='.repeat(60))

const servidores = []
const resultados = []
let reventó = null

try {
  console.log('\nCompilando el build de producción…')
  await new Promise((res, rej) => {
    const b = spawn('npm', ['run', 'build'], { cwd: RAIZ, stdio: 'ignore' })
    b.on('exit', (c) => (c === 0 ? res() : rej(new Error('el build falló'))))
    b.on('error', rej)
  })

  console.log('Levantando servidores…')
  servidores.push(await lanzar(['vite', '--port', String(PUERTO_DEV), '--strictPort'], PUERTO_DEV))
  servidores.push(
    await lanzar(['vite', 'preview', '--port', String(PUERTO_PREVIEW), '--strictPort'], PUERTO_PREVIEW),
  )

  const navegador = await chromium.launch()

  const comun = { navegador, host: HOST_SUPABASE, suite: crearSuite, capturar }

  const r1 = await flujo({ ...comun, base: `http://localhost:${PUERTO_DEV}/` })
  console.log(`\n[UI-01] ${r1.titulo}`)
  resultados.push(r1)

  const r2 = await pwa({ ...comun, base: `http://localhost:${PUERTO_PREVIEW}/` })
  console.log(`\n[UI-02] ${r2.titulo}`)
  resultados.push(r2)

  await navegador.close()
} catch (e) {
  reventó = e
  console.log(`\n  Las pruebas de interfaz se cayeron: ${e.message}`)
  // Rescata lo que sí había pasado antes del golpe.
  for (const s of abiertas) {
    if (!resultados.some((r) => r.titulo === s.titulo)) resultados.push(s.resultado())
  }
} finally {
  // El signo menos mata el grupo entero, no solo al envoltorio de npx.
  for (const p of servidores) {
    try {
      process.kill(-p.pid, 'SIGTERM')
    } catch {
      p.kill('SIGTERM')
    }
  }
}

const pasadas = resultados.reduce((t, r) => t + r.pasadas, 0)
const fallos = resultados.flatMap((r) => r.fallos.map((f) => ({ ...f, titulo: r.titulo })))

console.log('\n' + '='.repeat(60))
for (const r of resultados) {
  console.log(`  ${r.fallos.length === 0 ? 'ok  ' : 'FALLA'}  ${r.titulo.padEnd(38)} ${r.pasadas} pasaron`)
}
console.log('='.repeat(60))

if (fallos.length === 0 && !reventó) {
  console.log(`\n  ${pasadas} comprobaciones, todas en verde.`)
} else {
  console.log(`\n  ${pasadas} pasaron · ${fallos.length} fallaron\n`)
  for (const f of fallos) {
    console.log(`  · [${f.titulo}] ${f.seccion}`)
    console.log(`      ${f.descripcion}${f.detalle ? `  → ${f.detalle}` : ''}`)
  }
}
console.log(`\n  Capturas en tests/ui/capturas/\n`)

process.exit(fallos.length > 0 || reventó ? 1 : 0)

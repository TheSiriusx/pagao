import { crearSimulador } from './simulador.mjs'

/**
 * PWA: manifest, service worker y lectura sin señal.
 *
 * Esta suite corre contra el build de producción servido en localhost, no
 * contra el servidor de desarrollo: los navegadores solo registran service
 * workers en localhost o en HTTPS, y en modo dev no se genera ninguno.
 */
export default async function ({ navegador, base, host, suite, capturar }) {
  const s = suite('PWA e instalación')

  const sim = crearSimulador()
  sim.sembrarDeuda({ cedula: 'V12345678', full_name: 'José Rodríguez', amount: 50, due_date: '2026-12-01' })
  sim.sembrarDeuda({ cedula: 'V87654321', full_name: 'Ana Gómez', amount: 120, due_date: '2026-11-10' })

  const ctx = await navegador.newContext({ viewport: { width: 320, height: 720 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await sim.instalar(p, host)

  await p.goto(base, { waitUntil: 'load' })
  await p.waitForTimeout(3500)

  s.seccion('El manifest está bien formado')
  const mf = await p.evaluate(async () => {
    const r = await fetch('/manifest.webmanifest')
    return r.ok ? r.json() : null
  })
  s.check('se sirve el manifest', Boolean(mf))
  s.check('tiene nombre', Boolean(mf?.name))
  s.check('display standalone', mf?.display === 'standalone', mf?.display)
  s.check('start_url definida', Boolean(mf?.start_url))
  s.check('trae los 3 iconos', mf?.icons?.length === 3, `${mf?.icons?.length} iconos`)
  s.check(
    'incluye un icono maskable de 512',
    mf?.icons?.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'),
  )
  s.check('color de tema definido', Boolean(mf?.theme_color))

  s.seccion('El service worker se registra')
  const registros = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
  s.check('hay un service worker activo', registros > 0, `${registros} registros`)

  const controlado = await p.evaluate(async () => {
    await navigator.serviceWorker.ready
    return true
  })
  s.check('el service worker llega a estado listo', controlado)

  s.seccion('Los iconos existen de verdad')
  for (const ruta of ['/pwa-192.png', '/pwa-512.png', '/pwa-maskable-512.png', '/favicon.svg']) {
    const ok = await p.evaluate(async (r) => (await fetch(r)).ok, ruta)
    s.check(`${ruta} responde`, ok)
  }

  s.seccion('Lectura sin señal')
  // Primera visita con red: la app carga y el service worker precachea.
  await p.goto(base, { waitUntil: 'load' })
  await p.waitForTimeout(2500)

  await ctx.setOffline(true)
  await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await p.waitForTimeout(2500)

  const cascaronVivo = await p.evaluate(() => document.querySelector('#root')?.children.length > 0)
  s.check('la app sigue dibujándose sin conexión', cascaronVivo)
  await capturar(p, '20-sin-senal')

  const textoOffline = await p.evaluate(() => document.body.innerText)
  s.check(
    'no aparece la pantalla de error del navegador',
    !/ERR_INTERNET_DISCONNECTED|no está disponible|site can.t be reached/i.test(textoOffline),
    textoOffline.slice(0, 60),
  )

  await ctx.setOffline(false)

  s.seccion('Las consultas de score nunca se cachean')
  // El service worker solo guarda respuestas GET de /rest/v1. get_debtor_score
  // viaja por POST justamente para que una consulta pagada no se pueda repetir
  // desde la caché.
  const claves = await p.evaluate(async () => {
    const nombres = await caches.keys()
    const salida = []
    for (const n of nombres) {
      const c = await caches.open(n)
      for (const req of await c.keys()) salida.push(`${req.method} ${new URL(req.url).pathname}`)
    }
    return salida
  })
  s.check(
    'no hay ninguna respuesta de get_debtor_score en caché',
    !claves.some((k) => k.includes('get_debtor_score')),
    claves.filter((k) => k.includes('rpc')).slice(0, 3).join(' | '),
  )
  s.check('todo lo cacheado son peticiones GET', claves.every((k) => k.startsWith('GET')))

  await ctx.close()
  return s.resultado()
}

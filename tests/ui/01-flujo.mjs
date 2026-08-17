import { crearSimulador } from './simulador.mjs'

/**
 * Recorrido completo de la interfaz en una pantalla de 320px, que es el
 * ancho más angosto que la app promete soportar.
 *
 * Cada pantalla se captura en tests/ui/capturas/ para poder mirarlas.
 */
export default async function ({ navegador, base, host, suite, capturar }) {
  const s = suite('Interfaz — recorrido completo')

  const sim = crearSimulador({ conComercio: false })
  const ctx = await navegador.newContext({ viewport: { width: 320, height: 720 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()

  const erroresJs = []
  p.on('pageerror', (e) => erroresJs.push(e.message))
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
      erroresJs.push(m.text())
    }
  })

  await sim.instalar(p, host)
  await p.goto(base, { waitUntil: 'load' })
  await p.waitForTimeout(800)

  const sinDesborde = async () =>
    !(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth))

  // ---------------------------------------------------------------- login --
  s.seccion('Entrar')
  await capturar(p, '01-login')
  s.check('muestra la pantalla de entrar', await p.locator('h1', { hasText: 'Entra a Pagao' }).isVisible())
  s.check('no hay scroll horizontal a 320px', await sinDesborde())

  await p.fill('#correo', 'maria@ejemplo.com')
  await p.fill('#clave', 'malamala')
  await p.click('button[type=submit]')
  await p.waitForTimeout(600)
  s.check(
    'una contraseña mala muestra el error en español',
    await p.getByText('Correo o contraseña incorrectos.').isVisible(),
  )
  await capturar(p, '02-clave-mala')

  s.seccion('Recuperar la contraseña')
  await p.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
  await p.waitForSelector('#correoOlvide')
  s.check('la hoja arrastra el correo ya escrito', (await p.inputValue('#correoOlvide')).includes('@'))
  await capturar(p, '02b-olvide')

  await p.fill('#correoOlvide', 'noesuncorreo')
  await p.getByRole('button', { name: /Mandar el enlace/ }).click()
  await p.waitForTimeout(300)
  s.check('valida el correo antes de mandar nada', await p.getByText('Escribe un correo válido.').isVisible())

  await p.fill('#correoOlvide', 'maria@ejemplo.com')
  await p.getByRole('button', { name: /Mandar el enlace/ }).click()
  await p.waitForTimeout(800)
  s.check(
    'confirma el envío sin decir si la cuenta existe',
    await p.getByText(/Si ese correo tiene cuenta/).isVisible(),
  )
  const pedido = sim.estado.llamadas.find((l) => l.ruta.includes('/auth/v1/recover'))
  s.check('llamó al endpoint de recuperación', Boolean(pedido), JSON.stringify(pedido ?? null))
  await p.getByRole('button', { name: 'Entendido' }).click()
  await p.waitForTimeout(400)

  s.seccion('Entrar')
  await p.fill('#clave', 'clavebuena')
  await p.click('button[type=submit]')
  await p.waitForSelector('#negocio', { timeout: 8000 })

  // ------------------------------------------------------------- registro --
  s.seccion('Registrar el negocio')
  await capturar(p, '03-registro')
  s.check('pide registrar el negocio si no hay ficha', await p.locator('#negocio').isVisible())

  await p.click('button[type=submit]')
  await p.waitForTimeout(400)
  s.check('exige el nombre del negocio', await p.getByText('Escribe el nombre de tu negocio.').isVisible())
  s.check('exige el celular', await p.getByText(/Escribe tu celular/).isVisible())

  await p.fill('#negocio', 'Bodega La Esquina')
  await p.fill('#dueno', 'María Pérez')
  await p.fill('#telefono', '0412-1234567')
  await p.selectOption('#banco', { index: 8 })
  await p.click('button[type=submit]')
  await p.waitForTimeout(1200)

  const alta = sim.estado.llamadas.find((l) => l.ruta.includes('merchants') && l.metodo === 'POST')
  s.check(
    'el alta solo manda las columnas permitidas',
    alta && Object.keys(alta.cuerpo).sort().join(',') ===
      'bank_name,bank_phone,business_name,id,owner_name,phone',
    Object.keys(alta?.cuerpo ?? {}).join(','),
  )
  s.check('el teléfono se normaliza a E.164', alta?.cuerpo?.phone === '+584121234567', alta?.cuerpo?.phone)
  s.check(
    'el Pago Móvil hereda el celular si se deja vacío',
    alta?.cuerpo?.bank_phone === '+584121234567',
  )

  // ---------------------------------------------------------------- vacío --
  s.seccion('Sin fiados todavía')
  await p.waitForTimeout(500)
  await capturar(p, '04-sin-fiados')
  s.check('muestra el estado vacío', await p.getByText('Todavía no tienes fiados').isVisible())
  s.check('el resumen arranca en cero', await p.getByText('$0,00').first().isVisible())
  s.check('la barra de pestañas está visible', await p.getByRole('navigation').isVisible())

  // ------------------------------------------------------------ nuevo fiado --
  s.seccion('Registrar un fiado')
  await p.getByRole('button', { name: /Nuevo fiado/ }).click()
  await p.waitForSelector('#cedula')
  await capturar(p, '05-nuevo-fiado')

  await p.fill('#cedula', 'ABC')
  await p.fill('#monto', '50')
  await p.click('button[type=submit]')
  await p.waitForTimeout(300)
  s.check(
    'valida la cédula antes de llamar al servidor',
    await p.getByText(/Escríbela como V12345678/).isVisible(),
  )

  await p.fill('#cedula', 'V-12.345.678')
  await p.fill('#nombre', 'José Rodríguez')
  await p.fill('#monto', '50')
  await p.fill('#telefonoCliente', '0414-9998877')
  await p.fill('#notas', '2 bultos de harina')
  await p.click('button[type=submit]')
  await p.waitForTimeout(1200)

  const creada = sim.estado.llamadas.find((l) => l.ruta.includes('create_debt'))
  s.check('manda la cédula ya normalizada', creada?.cuerpo?.p_cedula === 'V12345678', creada?.cuerpo?.p_cedula)
  s.check('aparece en la lista', await p.getByText('José Rodríguez').isVisible())
  s.check('el resumen suma el fiado', await p.getByText('$50,00').first().isVisible())
  await capturar(p, '06-con-fiado')

  // ---------------------------------------------------------------- abonos --
  s.seccion('Abonar')
  await p.getByRole('button', { name: /Abonar/ }).first().click()
  await p.waitForSelector('#montoAbono')
  await capturar(p, '07-abonar')
  s.check('la hoja muestra el saldo', await p.getByText('Le falta').isVisible())

  await p.fill('#montoAbono', '80')
  await p.click('button[type=submit]')
  await p.waitForTimeout(300)
  s.check(
    'no deja abonar más que el saldo',
    await p.getByText(/No puede ser más de/).isVisible(),
  )

  await p.fill('#montoAbono', '20')
  await p.click('button[type=submit]')
  await p.waitForTimeout(1200)
  s.check('la tarjeta muestra el saldo, no el monto', await p.getByText('$30,00').first().isVisible())
  s.check('muestra cuánto lleva abonado', await p.getByText(/Abonó \$20,00 de \$50,00/).isVisible())
  await capturar(p, '08-con-abono')

  // ------------------------------------------------------------- correcciones --
  s.seccion('Corregir y reclamar')
  await p.getByRole('button', { name: 'Más acciones' }).first().click()
  await p.waitForTimeout(300)
  await capturar(p, '09-menu')
  s.check('el menú ofrece corregir', await p.getByText('Corregir monto o fecha').isVisible())
  s.check('ofrece cambiar el teléfono', await p.getByText('Cambiar teléfono').isVisible())

  await p.getByText('Corregir monto o fecha').click()
  await p.waitForSelector('#monto')
  s.check('en edición no deja tocar la cédula', (await p.locator('#cedula').count()) === 0)
  await p.fill('#monto', '10')
  await p.click('button[type=submit]')
  await p.waitForTimeout(400)
  s.check(
    'no deja bajar el monto por debajo de lo abonado',
    await p.getByText(/No puede ser menor que los \$20/).isVisible(),
  )
  await p.fill('#monto', '40')
  await p.click('button[type=submit]')
  await p.waitForTimeout(1000)
  s.check('el saldo se recalcula tras corregir', await p.getByText('$20,00').first().isVisible())

  await p.getByRole('button', { name: 'Más acciones' }).first().click()
  await p.getByText('El cliente reclama').click()
  await p.waitForTimeout(1000)
  s.check('la deuda pasa a reclamo', await p.getByText('El cliente reclama').first().isVisible())
  s.check('aparece el filtro En reclamo con su contador', await p.getByRole('button', { name: /En reclamo/ }).isVisible())
  await capturar(p, '10-reclamo')

  // ------------------------------------------------------------- Red Pagao --
  s.seccion('Red Pagao')
  sim.sembrarScore('V99887766', {
    score: 85, band: 'verde', active_debts: 3,
    full_name: 'Juan Perez', total_debt: 80,
  })
  await p.getByRole('button', { name: 'Red Pagao' }).click()
  await p.waitForSelector('#buscarCedula')
  await capturar(p, '11-red-vacia')

  await p.fill('#buscarCedula', 'V99887766')
  await p.getByRole('button', { name: /Consultar/ }).click()
  await p.waitForTimeout(1000)
  s.check('muestra el puntaje', await p.getByText('85').first().isVisible())
  s.check('muestra la banda en verde', await p.getByText('Buen pagador').isVisible())
  s.check('dice en cuántas tiendas debe', await p.getByText('3 tiendas').isVisible())
  s.check('muestra el nombre del cliente', await p.getByText('Juan Perez').isVisible())
  s.check('con 3 tiendas sí muestra el total', await p.getByText('$80,00').isVisible())
  await capturar(p, '12-score-verde')

  await p.fill('#buscarCedula', 'V11223344')
  await p.getByRole('button', { name: /Consultar/ }).click()
  await p.waitForTimeout(1000)
  s.check(
    'la segunda consulta no cobra ni bloquea',
    (await p.getByText(/consulta gratis/).count()) === 0,
  )
  s.check(
    'una cédula desconocida sale en gris',
    await p.getByText('Sin historial').isVisible(),
  )
  await capturar(p, '13-desconocido')

  // --------------------------------------------------------------- ajustes --
  s.seccion('Ajustes')
  await p.getByRole('button', { name: 'Ajustes' }).click()
  await p.waitForSelector('#ajNegocio')
  await capturar(p, '14-ajustes')
  s.check('trae los datos del negocio cargados', (await p.inputValue('#ajNegocio')) === 'Bodega La Esquina')
  s.check('trae el Pago Móvil cargado', (await p.inputValue('#ajTelefonoPago')).length > 0)
  s.check('muestra con qué correo entraste', await p.getByText('maria@ejemplo.com').isVisible())
  s.check(
    'ya no hay sección de suscripción',
    (await p.getByText('Tu plan').count()) === 0,
  )

  // ------------------------------------------------------------- cierre ----
  s.seccion('Salud general')
  s.check('sin errores de JavaScript en todo el recorrido', erroresJs.length === 0, erroresJs.slice(0, 2).join(' | '))
  s.check('ninguna pantalla desborda a lo ancho', await sinDesborde())

  await ctx.close()
  return s.resultado()
}

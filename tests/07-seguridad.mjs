import {
  SELLO,
  api,
  crearComerciante,
  crearFiado,
  crearSuite,
  fecha,
  rpc,
} from './ayudas.mjs'

/**
 * Auditoría de seguridad.
 *
 * Las otras suites comprueban que la app haga lo que debe. Esta intenta
 * romperla: busca fugas por caminos que la interfaz nunca usa, que es por
 * donde entra quien va con mala intención.
 *
 * El atacante que se simula aquí es un comerciante registrado —el peor caso
 * realista— con su token válido y curl en la mano.
 */
export default async function () {
  const s = crearSuite('Seguridad: intentos de fuga')

  const VICTIMA = await crearComerciante('victima')
  const ATACANTE = await crearComerciante('atacante')
  const CED = `V${SELLO}33`

  await crearFiado(VICTIMA.token, {
    cedula: CED,
    nombre: 'Cliente Privado',
    monto: 999,
    vence: fecha(10),
    telefono: '+584141112222',
  })
  // El atacante necesita al menos un fiado para tener ficha propia.
  await crearFiado(ATACANTE.token, {
    cedula: `V${SELLO}34`, nombre: 'Su propio cliente', monto: 5, vence: fecha(5),
  })

  const T = ATACANTE.token
  const textoDe = (r) => JSON.stringify(r.datos ?? '')

  // ---------------------------------------------------------------------
  s.seccion('Incrustar tablas relacionadas (PostgREST embedding)')
  // PostgREST deja pedir tablas relacionadas dentro de una consulta. Es la
  // fuga clásica: la tabla está cerrada de frente, pero se cuela de lado.
  const incrustaciones = [
    ['debts?select=*,debtors(*)', 'debtors dentro de debts'],
    ['debts?select=*,payments(*)', 'payments dentro de debts'],
    ['debts?select=*,merchant_debtors(*)', 'merchant_debtors dentro de debts'],
    ['payments?select=*,debts(*,debtors(*))', 'debtors anidada dos niveles'],
    ['merchants?select=*,debts(*)', 'debts dentro de merchants'],
  ]
  for (const [ruta, nombre] of incrustaciones) {
    const r = await api(`/rest/v1/${ruta}`, { token: T })
    const texto = textoDe(r)
    const fuga =
      texto.includes('Cliente Privado') ||
      texto.includes('584141112222') ||
      texto.includes(CED) ||
      texto.includes('999')
    s.check(`no se filtra nada por ${nombre}`, !fuga, `HTTP ${r.estado} ${texto.slice(0, 80)}`)
  }

  // ---------------------------------------------------------------------
  s.seccion('Filtrar por columnas ajenas')
  // Aunque RLS filtre las filas, dejar filtrar por una columna convierte la
  // consulta en un oráculo: se adivina el valor preguntando de a poco.
  // Ojo al comprobar: el atacante SÍ tiene datos propios, así que exigir cero
  // filas sería una prueba mal escrita. Lo que se verifica es que ninguna de
  // las filas devueltas sea de la víctima.
  const sondas = [
    ['debts?select=id,merchant_id&amount=eq.999', 'merchant_id', 'buscar por el monto exacto de la víctima'],
    [`debts?select=id,merchant_id&merchant_id=eq.${VICTIMA.uid}`, 'merchant_id', 'filtrar por el id de la víctima'],
    ['payments?select=id,merchant_id&amount=gt.0', 'merchant_id', 'listar todos los abonos'],
    ['merchant_debtors?select=merchant_id,address,phone', 'merchant_id', 'leer direcciones y teléfonos'],
    ['merchants?select=id,phone,bank_phone', 'id', 'leer teléfonos de otros negocios'],
  ]
  for (const [ruta, campo, nombre] of sondas) {
    const r = await api(`/rest/v1/${ruta}`, { token: T })
    const filas = Array.isArray(r.datos) ? r.datos : []
    const ajenas = filas.filter((f) => f[campo] !== ATACANTE.uid)
    s.check(
      `${nombre} no devuelve nada ajeno`,
      r.estado >= 400 || ajenas.length === 0,
      `HTTP ${r.estado}, ${ajenas.length} filas ajenas de ${filas.length}`,
    )
  }

  // ---------------------------------------------------------------------
  s.seccion('Inyección en los parámetros de texto')
  const venenos = [
    "V12345678'; drop table debts; --",
    "' or '1'='1",
    'V12345678 union select * from debtors',
    "%' --",
  ]
  for (const veneno of venenos) {
    const r = await rpc('get_debtor_score', T, { p_cedula: veneno })
    // Debe rebotar por cédula inválida, nunca ejecutar nada ni reventar.
    s.check(
      `rechaza limpio: ${veneno.slice(0, 28)}…`,
      textoDe(r).includes('INVALID_CEDULA'),
      `HTTP ${r.estado} ${textoDe(r).slice(0, 70)}`,
    )
  }
  const sigueViva = await rpc('list_debts', T)
  s.check('las tablas siguen en pie después de la inyección', sigueViva.estado < 300)

  // ---------------------------------------------------------------------
  s.seccion('Suplantar a otro comerciante en las RPC')
  const suplantaciones = [
    ['update_client', { p_debtor_id: '00000000-0000-0000-0000-000000000000', p_full_name: 'X' }, 'NOT_YOUR_CLIENT'],
    ['set_debtor_phone', { p_debtor_id: '00000000-0000-0000-0000-000000000000', p_phone: '+584140000000' }, 'NOT_YOUR_CLIENT'],
    ['barrer_vencidas', { p_merchant: VICTIMA.uid }, '42501'],
  ]
  for (const [fn, args, esperado] of suplantaciones) {
    const r = await rpc(fn, T, args)
    s.check(`${fn} rechaza el intento`, textoDe(r).includes(esperado), `${textoDe(r).slice(0, 70)}`)
  }

  // Forzar merchant_id en un insert directo, por si RLS se despistara.
  const forzar = await api('/rest/v1/debts', {
    token: T,
    metodo: 'POST',
    cuerpo: { merchant_id: VICTIMA.uid, debtor_id: '00000000-0000-0000-0000-000000000000', amount: 1, due_date: fecha(5) },
  })
  s.check('no se puede insertar una deuda a nombre de otro', forzar.estado >= 400, `HTTP ${forzar.estado}`)

  // ---------------------------------------------------------------------
  s.seccion('Escalada de privilegios sobre la propia fila')
  const escaladas = [
    [{ plan: 'pro' }, 'plan'],
    [{ plan_expires_at: '2099-01-01' }, 'plan_expires_at'],
    [{ free_queries_used: 0 }, 'free_queries_used'],
    [{ id: VICTIMA.uid }, 'id'],
  ]
  for (const [cuerpo, campo] of escaladas) {
    const r = await api(`/rest/v1/merchants?id=eq.${ATACANTE.uid}`, { token: T, metodo: 'PATCH', cuerpo })
    s.check(`no puede modificarse ${campo}`, r.estado >= 400, `HTTP ${r.estado}`)
  }

  // ---------------------------------------------------------------------
  s.seccion('Escribir directamente en las tablas')
  const escrituras = [
    ['debtors', { cedula: `V${SELLO}99`, full_name: 'Colado', score: 100 }],
    ['score_history', { debtor_id: null, old_score: 0, new_score: 100 }],
    ['payments', { debt_id: '00000000-0000-0000-0000-000000000000', merchant_id: ATACANTE.uid, amount: 1 }],
    ['merchant_debtors', { merchant_id: ATACANTE.uid, debtor_id: '00000000-0000-0000-0000-000000000000', full_name: 'X' }],
  ]
  for (const [tabla, cuerpo] of escrituras) {
    const r = await api(`/rest/v1/${tabla}`, { token: T, metodo: 'POST', cuerpo })
    s.check(`no se puede insertar en ${tabla}`, r.estado >= 400, `HTTP ${r.estado}`)
  }

  const subirScore = await api('/rest/v1/debtors?cedula=eq.' + CED, {
    token: T, metodo: 'PATCH', cuerpo: { score: 100 },
  })
  s.check('no se puede regalar puntaje a mano', subirScore.estado >= 400, `HTTP ${subirScore.estado}`)

  // ---------------------------------------------------------------------
  s.seccion('Borrado ajeno')
  const borrados = [
    ['debts', `merchant_id=eq.${VICTIMA.uid}`],
    ['debtors', `cedula=eq.${CED}`],
    ['merchants', `id=eq.${VICTIMA.uid}`],
  ]
  for (const [tabla, filtro] of borrados) {
    await api(`/rest/v1/${tabla}?${filtro}`, { token: T, metodo: 'DELETE' })
    // Da igual el código: lo que importa es que la víctima siga entera.
    const quedan = (await rpc('list_debts', VICTIMA.token)).datos ?? []
    s.check(`la víctima conserva sus datos tras borrar ${tabla}`, quedan.length === 1, `le quedan ${quedan.length}`)
  }

  // ---------------------------------------------------------------------
  s.seccion('Los errores no cuentan de más')
  const errorRaro = await rpc('get_debtor_score', T, { p_cedula: 'ZZZZ' })
  const texto = textoDe(errorRaro)
  s.check(
    'el error no expone rutas, tablas ni SQL',
    !/pg_|information_schema|\/usr\/|postgres@|line \d+ at/i.test(texto),
    texto.slice(0, 90),
  )

  // ---------------------------------------------------------------------
  s.seccion('Sin sesión no se llega a nada')
  const sinSesion = [
    ['/rest/v1/debtors?select=*', 'debtors'],
    ['/rest/v1/merchant_debtors?select=*', 'merchant_debtors'],
    ['/rest/v1/score_history?select=*', 'score_history'],
    ['/rest/v1/merchants?select=*', 'merchants'],
    ['/rest/v1/debts?select=*', 'debts'],
    ['/rest/v1/payments?select=*', 'payments'],
  ]
  for (const [ruta, nombre] of sinSesion) {
    const r = await api(ruta)
    s.check(`${nombre} rechaza al anónimo`, r.estado === 401 || r.estado === 403, `HTTP ${r.estado}`)
  }

  // ---------------------------------------------------------------------
  s.seccion('Tokens inválidos')
  const basura = await api('/rest/v1/rpc/list_debts', {
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWxzbyIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.falsa',
    metodo: 'POST',
    cuerpo: {},
  })
  s.check(
    'un JWT inventado que se declara service_role es rechazado',
    basura.estado === 401,
    `HTTP ${basura.estado}`,
  )

  return s.resultado()
}

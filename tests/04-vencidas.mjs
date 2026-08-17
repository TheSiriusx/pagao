import {
  SELLO,
  crearComerciante,
  crearFiado,
  crearSuite,
  fallaCon,
  fecha,
  rpc,
  traerFiado,
} from './ayudas.mjs'

/**
 * El barrido de vencidas: la regla de "a los 30 días pasa a overdue".
 *
 * Antes esta regla vivía suelta dentro del SQL del job de pg_cron y no había
 * forma de comprobarla sin esperar un mes. Ahora vive en barrer_vencidas(),
 * que es lo que llama el cron de madrugada, y sweep_my_overdue() deja
 * ejecutarla acotada al comercio de quien llama.
 */
export default async function () {
  const s = crearSuite('Barrido de vencidas')

  const A = await crearComerciante('barre')
  const B = await crearComerciante('vecino')
  const CED = `V${SELLO}88`

  // Tres fiados con vencimientos distintos, para verificar dónde cae el corte.
  const vieja = await crearFiado(A.token, { cedula: CED, monto: 40, vence: fecha(-45) })
  const justo = await crearFiado(A.token, { cedula: `V${SELLO}89`, monto: 20, vence: fecha(-20) })
  const alDia = await crearFiado(A.token, { cedula: `V${SELLO}90`, monto: 10, vence: fecha(10) })
  const ajena = await crearFiado(B.token, { cedula: `V${SELLO}91`, monto: 15, vence: fecha(-60) })

  s.seccion('El cron automático está programado')
  const cron = await rpc('cron_vencidas_activo', A.token)
  s.check(
    'el job pagao_mark_overdue existe y está activo',
    cron.datos === true,
    cron.datos === false ? 'pg_cron no habilitado o job sin programar' : JSON.stringify(cron.datos),
  )

  s.seccion('Antes del barrido')
  s.check('la de 45 días sigue en active', (await traerFiado(A.token, vieja))?.status === 'active')

  s.seccion('El corte está en 30 días')
  const scoreAntes = (await rpc('get_debtor_score', A.token, { p_cedula: CED })).datos?.[0]?.score
  const barrido = await rpc('sweep_my_overdue', A.token)
  s.check('sweep_my_overdue responde bien', barrido.estado < 300, `HTTP ${barrido.estado}`)
  s.check('barrió exactamente 1 deuda', barrido.datos === 1, `barrió ${barrido.datos}`)
  s.check('la de 45 días pasó a overdue', (await traerFiado(A.token, vieja))?.status === 'overdue')
  s.check('la de 20 días NO se tocó', (await traerFiado(A.token, justo))?.status === 'active')
  s.check('la que aún no vence NO se tocó', (await traerFiado(A.token, alDia))?.status === 'active')

  s.seccion('Solo barre lo propio')
  s.check(
    'la deuda de B de 60 días sigue intacta',
    (await traerFiado(B.token, ajena))?.status === 'active',
    'A no debe poder mover el estado de otro comercio',
  )
  s.check(
    'barrer_vencidas no es ejecutable directamente',
    fallaCon(await rpc('barrer_vencidas', A.token, { p_merchant: B.uid }), '42501'),
    'si esto falla, un comerciante puede barrer los comercios ajenos',
  )

  s.seccion('Pasar a vencida castiga el score')
  const scoreDespues = (await rpc('get_debtor_score', B.token, { p_cedula: CED })).datos?.[0]?.score
  s.check(
    `caer en vencida resta 30 puntos (${scoreAntes} → ${scoreDespues})`,
    scoreDespues === Math.max(scoreAntes - 30, 0),
    `esperaba ${Math.max(scoreAntes - 30, 0)}`,
  )

  s.seccion('El barrido es idempotente')
  const segunda = await rpc('sweep_my_overdue', A.token)
  s.check('correrlo otra vez no barre nada', segunda.datos === 0, `barrió ${segunda.datos}`)
  // A y B ya gastaron su consulta gratis, así que para volver a leer el score
  // hace falta un tercer par de ojos.
  const C = await crearComerciante('testigo')
  const scoreFinal = (await rpc('get_debtor_score', C.token, { p_cedula: CED })).datos?.[0]?.score
  s.check(
    'y no vuelve a castigar el score',
    scoreFinal === scoreDespues,
    `esperaba ${scoreDespues}, dio ${scoreFinal}`,
  )

  s.seccion('Una vencida todavía se puede cobrar')
  const pago = await rpc('mark_debt_paid', A.token, { p_debt_id: vieja })
  s.check('se puede marcar pagada una deuda vencida', pago.estado < 300, `HTTP ${pago.estado}`)
  s.check('queda como pagada', (await traerFiado(A.token, vieja))?.status === 'paid')

  return s.resultado()
}

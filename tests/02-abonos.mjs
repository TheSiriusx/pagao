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
 * Abonos parciales: que las cuentas cuadren y que el cierre de la deuda
 * dispare el trigger del score.
 */
export default async function () {
  const s = crearSuite('Abonos parciales')

  const dueno = await crearComerciante('abonos')
  const mirador = await crearComerciante('mirador') // solo para leer el score al final
  const CED = `V${SELLO}77`

  // Vencida hace 3 días: al saldarla, el score debe BAJAR 5 puntos.
  const deuda = await crearFiado(dueno.token, { cedula: CED, monto: 100, vence: fecha(-3) })

  s.seccion('Estado inicial')
  const inicial = await traerFiado(dueno.token, deuda)
  s.check('list_debts trae el campo abonado', inicial?.abonado !== undefined)
  s.check('arranca con 0 abonado', Number(inicial?.abonado) === 0, `abonado = ${inicial?.abonado}`)

  s.seccion('Primer abono de $30')
  const a1 = (await rpc('add_payment', dueno.token, { p_debt_id: deuda, p_amount: 30 })).datos?.[0]
  s.check('abonado = 30', Number(a1?.abonado) === 30, JSON.stringify(a1))
  s.check('saldo = 70', Number(a1?.saldo) === 70)
  s.check('la deuda sigue abierta', a1?.quedo_pagada === false)
  s.check('el status sigue en active', (await traerFiado(dueno.token, deuda))?.status === 'active')

  s.seccion('No se puede abonar de más')
  s.check(
    'un abono de $80 sobre un saldo de $70 rebota',
    fallaCon(await rpc('add_payment', dueno.token, { p_debt_id: deuda, p_amount: 80 }), 'AMOUNT_TOO_BIG'),
  )
  s.check(
    'un abono negativo rebota',
    fallaCon(await rpc('add_payment', dueno.token, { p_debt_id: deuda, p_amount: -10 }), 'INVALID_AMOUNT'),
  )

  s.seccion('El último abono cierra la deuda')
  const scoreAntes = (await rpc('get_debtor_score', dueno.token, { p_cedula: CED })).datos?.[0]?.score
  const a2 = (await rpc('add_payment', dueno.token, { p_debt_id: deuda, p_amount: 40 })).datos?.[0]
  s.check('abonado acumulado = 70', Number(a2?.abonado) === 70)
  s.check('todavía no está pagada', a2?.quedo_pagada === false)

  const a3 = (await rpc('add_payment', dueno.token, { p_debt_id: deuda, p_amount: 30 })).datos?.[0]
  s.check('abonado = 100', Number(a3?.abonado) === 100)
  s.check('saldo = 0', Number(a3?.saldo) === 0)
  s.check('quedó pagada', a3?.quedo_pagada === true)

  const cerrada = await traerFiado(dueno.token, deuda)
  s.check('el status pasó a paid', cerrada?.status === 'paid', cerrada?.status)
  s.check('days_late se calculó solo', Number(cerrada?.days_late) === 3, `days_late = ${cerrada?.days_late}`)

  s.seccion('El trigger castiga el atraso')
  const scoreDespues = (await rpc('get_debtor_score', mirador.token, { p_cedula: CED })).datos?.[0]?.score
  s.check(
    `pagar 3 días tarde baja 5 puntos (${scoreAntes} → ${scoreDespues})`,
    scoreDespues === scoreAntes - 5,
    `esperaba ${scoreAntes - 5}`,
  )

  s.seccion('Una deuda cerrada no admite más abonos')
  s.check(
    'rebota con ALREADY_PAID',
    fallaCon(await rpc('add_payment', dueno.token, { p_debt_id: deuda, p_amount: 5 }), 'ALREADY_PAID'),
  )

  s.seccion('Los abonos también están aislados')
  const mios = (await rpc('list_payments', dueno.token)).datos ?? []
  const ajenos = (await rpc('list_payments', mirador.token)).datos ?? []
  s.check('el dueño ve sus 3 abonos', mios.length === 3, `vio ${mios.length}`)
  s.check('el otro comerciante no ve ninguno', ajenos.length === 0, `vio ${ajenos.length}`)
  s.check(
    'la suma de abonos cuadra con el monto',
    mios.reduce((t, p) => t + Number(p.amount), 0) === 100,
  )

  s.seccion('mark_debt_paid deja registrado el saldo restante')
  const otra = await crearFiado(dueno.token, { cedula: CED, monto: 50, vence: fecha(20) })
  await rpc('add_payment', dueno.token, { p_debt_id: otra, p_amount: 20 })
  await rpc('mark_debt_paid', dueno.token, { p_debt_id: otra })
  const deEsa = ((await rpc('list_payments', dueno.token)).datos ?? []).filter((p) => p.debt_id === otra)
  s.check('quedaron 2 abonos: los $20 y el cierre de $30', deEsa.length === 2, `hubo ${deEsa.length}`)
  s.check(
    'suman los $50 completos',
    deEsa.reduce((t, p) => t + Number(p.amount), 0) === 50,
  )

  return s.resultado()
}

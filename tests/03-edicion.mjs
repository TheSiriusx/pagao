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
 * Editar, borrar, reclamos y teléfono del cliente.
 *
 * La regla que se comprueba una y otra vez: una deuda PAGADA está congelada,
 * porque su pago ya movió el score del deudor a través del trigger.
 */
export default async function () {
  const s = crearSuite('Editar, borrar y reclamos')

  const A = await crearComerciante('edita')
  const B = await crearComerciante('mira')
  const CED = `V${SELLO}55`

  s.seccion('Corregir un fiado')
  const d1 = await crearFiado(A.token, { cedula: CED, monto: 500, vence: fecha(30) })
  const up = await rpc('update_debt', A.token, {
    p_debt_id: d1, p_amount: 50, p_due_date: fecha(15), p_notes: 'corregido',
  })
  s.check('update_debt responde sin error', up.estado < 300, `HTTP ${up.estado}`)
  const t1 = await traerFiado(A.token, d1)
  s.check('el monto quedó en 50', Number(t1?.amount) === 50, `amount = ${t1?.amount}`)
  s.check('la fecha cambió', String(t1?.due_date).startsWith(fecha(15)), t1?.due_date)
  s.check('la nota se guardó', t1?.notes === 'corregido', t1?.notes)

  s.seccion('No se toca lo del otro')
  s.check(
    'B no puede editar la deuda de A',
    fallaCon(await rpc('update_debt', B.token, { p_debt_id: d1, p_amount: 1, p_due_date: fecha(30) }), 'NOT_YOUR_DEBT'),
  )
  s.check(
    'B no puede borrar la deuda de A',
    fallaCon(await rpc('delete_debt', B.token, { p_debt_id: d1 }), 'NOT_YOUR_DEBT'),
  )
  s.check(
    'B no puede marcar reclamo en la deuda de A',
    fallaCon(await rpc('set_debt_disputed', B.token, { p_debt_id: d1, p_disputed: true }), 'NOT_YOUR_DEBT'),
  )

  s.seccion('El monto no puede bajar de lo ya abonado')
  const d2 = await crearFiado(A.token, { cedula: CED, monto: 100, vence: fecha(30) })
  await rpc('add_payment', A.token, { p_debt_id: d2, p_amount: 60 })
  s.check(
    'bajar a $40 con $60 abonados rebota',
    fallaCon(await rpc('update_debt', A.token, { p_debt_id: d2, p_amount: 40, p_due_date: fecha(30) }), 'AMOUNT_BELOW_PAID'),
  )

  s.seccion('Corregir al monto ya cubierto cierra la deuda')
  const cierra = await rpc('update_debt', A.token, { p_debt_id: d2, p_amount: 60, p_due_date: fecha(30) })
  s.check('update_debt a $60 responde bien', cierra.estado < 300, `HTTP ${cierra.estado}`)
  s.check('la deuda quedó pagada', (await traerFiado(A.token, d2))?.status === 'paid')

  s.seccion('Una deuda pagada está congelada')
  s.check(
    'no se puede editar',
    fallaCon(await rpc('update_debt', A.token, { p_debt_id: d2, p_amount: 90, p_due_date: fecha(30) }), 'ALREADY_PAID'),
  )
  s.check(
    'no se puede borrar',
    fallaCon(await rpc('delete_debt', A.token, { p_debt_id: d2 }), 'CANNOT_DELETE_PAID'),
  )
  s.check(
    'no se le puede marcar reclamo',
    fallaCon(await rpc('set_debt_disputed', A.token, { p_debt_id: d2, p_disputed: true }), 'ALREADY_PAID'),
  )
  const abonoDeCerrada = ((await rpc('list_payments', A.token, {})).datos ?? []).find((p) => p.debt_id === d2)
  s.check(
    'no se le pueden quitar abonos',
    fallaCon(await rpc('delete_payment', A.token, { p_payment_id: abonoDeCerrada.id }), 'DEBT_ALREADY_PAID'),
  )

  s.seccion('Borrar un fiado se lleva sus abonos')
  const d3 = await crearFiado(A.token, { cedula: CED, monto: 200, vence: fecha(30) })
  await rpc('add_payment', A.token, { p_debt_id: d3, p_amount: 25 })
  const del = await rpc('delete_debt', A.token, { p_debt_id: d3 })
  s.check('delete_debt responde bien', del.estado < 300, `HTTP ${del.estado}`)
  s.check('la deuda desapareció de la lista', !(await traerFiado(A.token, d3)))
  const huerfanos = ((await rpc('list_payments', A.token, {})).datos ?? []).filter((p) => p.debt_id === d3)
  s.check('sus abonos cayeron en cascada', huerfanos.length === 0, `quedaron ${huerfanos.length}`)

  s.seccion('Borrar un abono suelto')
  const d4 = await crearFiado(A.token, { cedula: CED, monto: 90, vence: fecha(30) })
  await rpc('add_payment', A.token, { p_debt_id: d4, p_amount: 30 })
  const abono = ((await rpc('list_payments', A.token, {})).datos ?? []).find((p) => p.debt_id === d4)
  s.check(
    'B no puede borrar el abono de A',
    fallaCon(await rpc('delete_payment', B.token, { p_payment_id: abono.id }), 'NOT_YOUR_PAYMENT'),
  )
  const delAb = await rpc('delete_payment', A.token, { p_payment_id: abono.id })
  s.check('A sí puede borrarlo', delAb.estado < 300, `HTTP ${delAb.estado}`)
  s.check('el abonado volvió a 0', Number((await traerFiado(A.token, d4))?.abonado) === 0)

  s.seccion('Reclamo del cliente')
  const scoreAntes = (await rpc('get_debtor_score', A.token, { p_cedula: CED })).datos?.[0]?.score
  const rec = await rpc('set_debt_disputed', A.token, { p_debt_id: d4, p_disputed: true })
  s.check('set_debt_disputed responde bien', rec.estado < 300, `HTTP ${rec.estado}`)
  s.check('el status quedó en disputed', (await traerFiado(A.token, d4))?.status === 'disputed')
  const scoreDespues = (await rpc('get_debtor_score', B.token, { p_cedula: CED })).datos?.[0]?.score
  s.check(
    'marcar reclamo NO mueve el score',
    scoreDespues === scoreAntes,
    `antes ${scoreAntes}, después ${scoreDespues}`,
  )
  await rpc('set_debt_disputed', A.token, { p_debt_id: d4, p_disputed: false })
  s.check('se puede quitar el reclamo', (await traerFiado(A.token, d4))?.status === 'active')

  s.seccion('Teléfono del cliente')
  const sinTel = await traerFiado(A.token, d4)
  s.check('la deuda nació sin teléfono', !sinTel?.phone, `phone = ${sinTel?.phone}`)
  s.check(
    'un comerciante sin fiados con ese cliente no puede tocarlo',
    fallaCon(await rpc('set_debtor_phone', B.token, { p_debtor_id: sinTel.debtor_id, p_phone: '+584149999999' }), 'NOT_YOUR_CLIENT'),
  )
  const pon = await rpc('set_debtor_phone', A.token, { p_debtor_id: sinTel.debtor_id, p_phone: '+584141234567' })
  s.check('A sí puede agregárselo', pon.estado < 300, `HTTP ${pon.estado}`)
  s.check('el teléfono aparece en la lista', (await traerFiado(A.token, d4))?.phone === '+584141234567')

  return s.resultado()
}

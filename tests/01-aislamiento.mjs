import {
  SELLO,
  api,
  crearComerciante,
  crearFiado,
  crearSuite,
  fallaCon,
  fecha,
  rpc,
} from './ayudas.mjs'

/**
 * Lo más importante de todo el sistema: que un comerciante no pueda ver ni
 * tocar nada de otro.
 *
 * Se montan dos negocios con un cliente en común, que es el caso donde el
 * aislamiento se pone difícil: comparten la fila de debtors y el score, pero
 * no deben compartir absolutamente nada más.
 */
export default async function () {
  const s = crearSuite('Aislamiento entre comerciantes')

  const A = await crearComerciante('a')
  const B = await crearComerciante('b')

  const CED_COMUN = `V${SELLO}01`
  const CED_SOLO_A = `V${SELLO}02`

  const deudaA1 = await crearFiado(A.token, {
    cedula: CED_COMUN, nombre: 'Jose Rodriguez', monto: 50, vence: fecha(7), telefono: '+584141112233',
  })
  const deudaA2 = await crearFiado(A.token, {
    cedula: CED_SOLO_A, nombre: 'Ana Gomez', monto: 30, vence: fecha(-40),
  })
  const deudaB1 = await crearFiado(B.token, {
    cedula: CED_COMUN, nombre: 'Jose R.', monto: 80, vence: fecha(12),
  })

  s.seccion('Cada uno ve solo sus fiados')
  const listaA = (await rpc('list_debts', A.token)).datos ?? []
  const listaB = (await rpc('list_debts', B.token)).datos ?? []
  s.check('A ve sus 2 deudas', listaA.length === 2, `vio ${listaA.length}`)
  s.check('B ve su única deuda', listaB.length === 1, `vio ${listaB.length}`)
  s.check('A no ve la deuda de B', !listaA.some((d) => d.id === deudaB1))
  s.check('B no ve las deudas de A', !listaB.some((d) => [deudaA1, deudaA2].includes(d.id)))

  s.seccion('Saltarse las RPC no sirve de nada')
  const debtsA = await api('/rest/v1/debts?select=id,merchant_id', { token: A.token })
  s.check(
    'el select directo a debts solo devuelve las de A',
    Array.isArray(debtsA.datos) && debtsA.datos.length === 2 && debtsA.datos.every((d) => d.merchant_id === A.uid),
    JSON.stringify(debtsA.datos)?.slice(0, 90),
  )
  const debtors = await api('/rest/v1/debtors?select=cedula,full_name', { token: A.token })
  s.check('debtors sigue cerrada con sesión activa', debtors.estado >= 400, `HTTP ${debtors.estado}`)
  const historial = await api('/rest/v1/score_history?select=*', { token: A.token })
  s.check('score_history sigue cerrada con sesión activa', historial.estado >= 400, `HTTP ${historial.estado}`)
  const fichaB = await api(`/rest/v1/merchants?select=business_name&id=eq.${B.uid}`, { token: A.token })
  s.check(
    'A no puede leer la ficha de negocio de B',
    Array.isArray(fichaB.datos) && fichaB.datos.length === 0,
    JSON.stringify(fichaB.datos)?.slice(0, 90),
  )

  s.seccion('El paywall no se edita desde el navegador')
  const aPro = await api(`/rest/v1/merchants?id=eq.${A.uid}`, {
    token: A.token, metodo: 'PATCH', cuerpo: { plan: 'pro' },
  })
  s.check('A no puede ponerse plan=pro', aPro.estado >= 400, `HTTP ${aPro.estado}`)
  const aReset = await api(`/rest/v1/merchants?id=eq.${A.uid}`, {
    token: A.token, metodo: 'PATCH', cuerpo: { free_queries_used: 0 },
  })
  s.check('A no puede reiniciar su contador de consultas', aReset.estado >= 400, `HTTP ${aReset.estado}`)

  s.seccion('Nadie escribe sobre lo del otro')
  s.check(
    'B no puede marcar pagada una deuda de A',
    fallaCon(await rpc('mark_debt_paid', B.token, { p_debt_id: deudaA1 }), 'NOT_YOUR_DEBT'),
  )
  const insertAjeno = await api('/rest/v1/debts', {
    token: A.token, metodo: 'POST',
    cuerpo: { merchant_id: B.uid, debtor_id: listaA[0].debtor_id, amount: 1, due_date: fecha(30) },
  })
  s.check('A no puede insertar una deuda a nombre de B', insertAjeno.estado >= 400, `HTTP ${insertAjeno.estado}`)

  s.seccion('La Red Pagao comparte el score y nada más')
  const consultaA = await rpc('get_debtor_score', A.token, { p_cedula: CED_COMUN })
  const filaA = consultaA.datos?.[0]
  s.check('la consulta gratis de A funciona', typeof filaA?.score === 'number', JSON.stringify(consultaA.datos)?.slice(0, 90))
  s.check('el cliente común aparece en 2 comercios', filaA?.active_debts === 2, `active_debts = ${filaA?.active_debts}`)
  s.check(
    'la respuesta no trae nada más que lo acordado',
    filaA && Object.keys(filaA).sort().join(',') === 'active_debts,band,full_name,score,total_debt',
    Object.keys(filaA ?? {}).join(','),
  )
  s.check('trae el nombre para confirmar la identidad', typeof filaA?.full_name === 'string', filaA?.full_name)
  s.check(
    'con menos de 3 deudas NO revela el total adeudado',
    filaA?.total_debt === null,
    `active_debts=${filaA?.active_debts}, total_debt=${filaA?.total_debt}`,
  )

  s.seccion('El límite del plan gratis lo aplica el servidor')
  s.check(
    'la segunda consulta de A rebota',
    fallaCon(await rpc('get_debtor_score', A.token, { p_cedula: CED_SOLO_A }), 'FREE_LIMIT'),
  )

  s.seccion('El score lo mueve el trigger, no el cliente')
  const pago = await rpc('mark_debt_paid', A.token, { p_debt_id: deudaA1 })
  s.check('A marca pagada su propia deuda', pago.estado < 300, `HTTP ${pago.estado}`)
  const consultaB = await rpc('get_debtor_score', B.token, { p_cedula: CED_COMUN })
  const filaB = consultaB.datos?.[0]
  s.check('B tiene su consulta gratis, aparte de la de A', typeof filaB?.score === 'number')
  s.check(
    `pagar antes de vencer sube el score (${filaA?.score} → ${filaB?.score})`,
    filaB?.score === filaA?.score + 15,
    `esperaba ${filaA?.score + 15}`,
  )
  s.check('tras pagar, ya solo debe en 1 comercio', filaB?.active_debts === 1, `active_debts = ${filaB?.active_debts}`)

  s.seccion('Validaciones del servidor')
  s.check(
    'create_debt rechaza una cédula inválida',
    fallaCon(await rpc('create_debt', B.token, { p_cedula: 'ABC', p_full_name: 'X', p_amount: 10, p_due_date: fecha(5) }), 'INVALID_CEDULA'),
  )
  s.check(
    'create_debt rechaza un monto negativo',
    fallaCon(await rpc('create_debt', B.token, { p_cedula: CED_SOLO_A, p_full_name: 'X', p_amount: -5, p_due_date: fecha(5) }), 'INVALID_AMOUNT'),
  )
  const conGuion = await rpc('create_debt', B.token, {
    p_cedula: `v-${SELLO}-01`, p_full_name: 'Jose Rodriguez', p_amount: 5, p_due_date: fecha(5),
  })
  const listaB2 = (await rpc('list_debts', B.token)).datos ?? []
  const nueva = listaB2.find((d) => d.id === conGuion.datos)
  s.check(
    'la cédula se normaliza: "v-XXXX-01" cae en el mismo cliente',
    nueva?.cedula === CED_COMUN,
    `guardó ${nueva?.cedula}`,
  )

  return s.resultado()
}

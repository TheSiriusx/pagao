import { SELLO, crearComerciante, crearFiado, crearSuite, fecha, rpc } from './ayudas.mjs'

/**
 * La ficha que devuelve la Red Pagao.
 *
 * Lo que se vigila aquí es el corte de las 3 deudas. Con menos, el "total
 * adeudado" sería el monto exacto que le fió otro comerciante: publicar eso
 * es publicar el negocio del vecino. A partir de 3 es un agregado del que no
 * se deduce ninguna cifra concreta.
 */
export default async function () {
  const s = crearSuite('Ficha de la Red Pagao')

  const CED = `V${SELLO}44`
  const A = await crearComerciante('fichaA')
  const B = await crearComerciante('fichaB')
  const C = await crearComerciante('fichaC')
  const D = await crearComerciante('fichaD')

  s.seccion('Con 1 deuda: sin total')
  await crearFiado(A.token, { cedula: CED, nombre: 'Juan Perez', monto: 50, vence: fecha(20) })
  const con1 = (await rpc('get_debtor_score', A.token, { p_cedula: CED })).datos?.[0]
  s.check('devuelve el nombre', con1?.full_name === 'Juan Perez', con1?.full_name)
  s.check('1 deuda activa', con1?.active_debts === 1, `${con1?.active_debts}`)
  s.check(
    'el total viene vacío, porque delataría a ese comerciante',
    con1?.total_debt === null,
    `total_debt = ${con1?.total_debt}`,
  )

  s.seccion('Con 2 deudas: sigue sin total')
  await crearFiado(B.token, { cedula: CED, nombre: 'J. Perez', monto: 30, vence: fecha(25) })
  const con2 = (await rpc('get_debtor_score', B.token, { p_cedula: CED })).datos?.[0]
  s.check('2 deudas activas', con2?.active_debts === 2, `${con2?.active_debts}`)
  s.check(
    'todavía sin total: restando se sacaría el monto del otro',
    con2?.total_debt === null,
    `total_debt = ${con2?.total_debt}`,
  )

  s.seccion('Con 3 deudas: ya aparece el total')
  await crearFiado(C.token, { cedula: CED, nombre: 'Juan P.', monto: 20, vence: fecha(30) })
  const con3 = (await rpc('get_debtor_score', C.token, { p_cedula: CED })).datos?.[0]
  s.check('3 deudas activas', con3?.active_debts === 3, `${con3?.active_debts}`)
  s.check('el total suma las tres', Number(con3?.total_debt) === 100, `total_debt = ${con3?.total_debt}`)

  s.seccion('El total descuenta los abonos')
  const deudaD = await crearFiado(D.token, { cedula: CED, monto: 100, vence: fecha(30) })
  await rpc('add_payment', D.token, { p_debt_id: deudaD, p_amount: 60 })
  const E = await crearComerciante('fichaE')
  const con4 = (await rpc('get_debtor_score', E.token, { p_cedula: CED })).datos?.[0]
  s.check('4 deudas activas', con4?.active_debts === 4, `${con4?.active_debts}`)
  s.check(
    'el total cuenta el saldo, no el monto original',
    Number(con4?.total_debt) === 140,
    `esperaba 140, dio ${con4?.total_debt}`,
  )

  s.seccion('El nombre es el de tu propia ficha si ya es tu cliente')
  await rpc('update_client', B.token, {
    p_debtor_id: (await rpc('list_clients', B.token)).datos?.[0]?.debtor_id,
    p_full_name: 'Juancho el de la bomba',
  })
  const F = await crearComerciante('fichaF')
  const ajeno = (await rpc('get_debtor_score', F.token, { p_cedula: CED })).datos?.[0]
  s.check(
    'un desconocido ve el nombre original de la red',
    ajeno?.full_name === 'Juan Perez',
    ajeno?.full_name,
  )

  s.seccion('Un desconocido en la red no filtra nada')
  const G = await crearComerciante('fichaG')
  const nadie = (await rpc('get_debtor_score', G.token, { p_cedula: `V${SELLO}45` })).datos?.[0]
  s.check('banda gris', nadie?.band === 'gris', nadie?.band)
  s.check('sin score', nadie?.score === null)
  s.check('sin nombre', nadie?.full_name === null, `${nadie?.full_name}`)
  s.check('sin total', nadie?.total_debt === null, `${nadie?.total_debt}`)

  return s.resultado()
}

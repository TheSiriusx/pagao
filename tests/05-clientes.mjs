import {
  SELLO,
  api,
  crearComerciante,
  crearSuite,
  fallaCon,
  fecha,
  rpc,
} from './ayudas.mjs'

/**
 * Ficha de cliente por comerciante.
 *
 * Lo que más importa aquí: que la dirección y los teléfonos NO se filtren
 * entre comercios. Dos bodegas pueden tener al mismo deudor con datos
 * distintos y ninguna debe ver los del otro. El score sí es compartido —
 * para eso existe la red — pero los datos de contacto son privados.
 */
export default async function () {
  const s = crearSuite('Clientes: ficha privada por comerciante')

  const A = await crearComerciante('cliA')
  const B = await crearComerciante('cliB')
  const CED = `V${SELLO}66`

  // Los dos le fían a la MISMA persona, con datos distintos.
  await rpc('create_debt', A.token, {
    p_cedula: CED,
    p_full_name: 'José Antonio Rodríguez',
    p_amount: 100,
    p_due_date: fecha(-10),
    p_phone: '+584141110001',
    p_phone2: '+584241110002',
    p_address: 'Calle Sucre, casa 24, al lado de la panaderia',
  })
  await rpc('create_debt', B.token, {
    p_cedula: CED,
    p_full_name: 'Jose R.',
    p_amount: 40,
    p_due_date: fecha(15),
    p_phone: '+584169990000',
    p_address: 'No se donde vive',
  })

  s.seccion('Cada comerciante ve SU ficha del mismo cliente')
  const clientesA = (await rpc('list_clients', A.token)).datos ?? []
  const clientesB = (await rpc('list_clients', B.token)).datos ?? []
  const cA = clientesA.find((c) => c.cedula === CED)
  const cB = clientesB.find((c) => c.cedula === CED)

  s.check('A tiene su ficha', Boolean(cA))
  s.check('B tiene su ficha', Boolean(cB))
  s.check('A ve el nombre que él escribió', cA?.full_name === 'José Antonio Rodríguez', cA?.full_name)
  s.check('B ve el nombre que él escribió', cB?.full_name === 'Jose R.', cB?.full_name)
  s.check(
    'la dirección de A NO se le filtra a B',
    cB?.address === 'No se donde vive',
    `B ve: ${cB?.address}`,
  )
  s.check(
    'el teléfono de A NO se le filtra a B',
    cB?.phone === '+584169990000',
    `B ve: ${cB?.phone}`,
  )
  s.check('el teléfono secundario se guarda', cA?.phone2 === '+584241110002', cA?.phone2)
  s.check('B no heredó el teléfono secundario de A', !cB?.phone2, `B ve: ${cB?.phone2}`)

  s.seccion('Pero la cédula y el score sí son de la red')
  s.check('los dos apuntan al mismo deudor', cA?.debtor_id === cB?.debtor_id)
  const scoreA = (await rpc('get_debtor_score', A.token, { p_cedula: CED })).datos?.[0]
  const scoreB = (await rpc('get_debtor_score', B.token, { p_cedula: CED })).datos?.[0]
  s.check('los dos ven el mismo score', scoreA?.score === scoreB?.score)
  s.check('y que debe en 2 comercios', scoreA?.active_debts === 2, `${scoreA?.active_debts}`)

  s.seccion('list_clients cuenta bien')
  s.check('A: le debe 100', Number(cA?.debe) === 100, `debe = ${cA?.debe}`)
  s.check('A: 1 fiado pendiente', cA?.pendientes === 1, `${cA?.pendientes}`)
  s.check('A: 1 vencido, porque venció hace 10 días', cA?.vencidas === 1, `${cA?.vencidas}`)
  s.check('B: 0 vencidos, el suyo aún no vence', cB?.vencidas === 0, `${cB?.vencidas}`)
  s.check('A: total fiado histórico', Number(cA?.total_fiado) === 100)

  s.seccion('list_clients no regala el score')
  s.check(
    'la respuesta no trae ninguna columna de puntaje',
    cA && !('score' in cA) && !('band' in cA),
    Object.keys(cA ?? {}).join(','),
  )

  s.seccion('Corregir la ficha')
  const up = await rpc('update_client', A.token, {
    p_debtor_id: cA.debtor_id,
    p_full_name: 'José A. Rodríguez',
    p_phone: '+584141110001',
    p_phone2: null,
    p_address: 'Calle Sucre, casa 24',
  })
  s.check('update_client responde bien', up.estado < 300, `HTTP ${up.estado}`)
  const cA2 = ((await rpc('list_clients', A.token)).datos ?? []).find((c) => c.cedula === CED)
  s.check('el nombre cambió', cA2?.full_name === 'José A. Rodríguez', cA2?.full_name)
  s.check('la dirección cambió', cA2?.address === 'Calle Sucre, casa 24')
  s.check('el teléfono secundario se pudo borrar', !cA2?.phone2, `quedó ${cA2?.phone2}`)
  const cB2 = ((await rpc('list_clients', B.token)).datos ?? []).find((c) => c.cedula === CED)
  s.check('la ficha de B no se movió', cB2?.full_name === 'Jose R.', cB2?.full_name)

  s.seccion('No se toca la ficha ajena')
  const ajena = await rpc('update_client', B.token, {
    p_debtor_id: cA.debtor_id,
    p_full_name: 'Secuestrado',
    p_address: 'Robada',
  })
  // B sí tiene ficha propia de ese deudor, así que edita LA SUYA, no la de A.
  const cA3 = ((await rpc('list_clients', A.token)).datos ?? []).find((c) => c.cedula === CED)
  s.check('A conserva su nombre', cA3?.full_name === 'José A. Rodríguez', cA3?.full_name)
  s.check('A conserva su dirección', cA3?.address === 'Calle Sucre, casa 24', cA3?.address)

  const C = await crearComerciante('cliC')
  s.check(
    'un comerciante sin fiados con ese cliente no puede crear ficha',
    fallaCon(
      await rpc('update_client', C.token, { p_debtor_id: cA.debtor_id, p_full_name: 'X' }),
      'NOT_YOUR_CLIENT',
    ),
  )
  s.check('y no ve ningún cliente', ((await rpc('list_clients', C.token)).datos ?? []).length === 0)

  s.seccion('La tabla nueva está cerrada por RLS')
  const directo = await api('/rest/v1/merchant_debtors?select=*', { token: B.token })
  s.check(
    'B solo ve sus propias fichas leyendo la tabla directo',
    Array.isArray(directo.datos) && directo.datos.every((f) => f.merchant_id === B.uid),
    JSON.stringify(directo.datos)?.slice(0, 90),
  )
  const escritura = await api('/rest/v1/merchant_debtors', {
    token: B.token,
    metodo: 'POST',
    cuerpo: { merchant_id: A.uid, debtor_id: cA.debtor_id, full_name: 'Colado' },
  })
  s.check('nadie escribe la tabla directamente', escritura.estado >= 400, `HTTP ${escritura.estado}`)

  s.seccion('list_debts usa el nombre de la ficha privada')
  const deudasB = (await rpc('list_debts', B.token)).datos ?? []
  s.check(
    'B ve su deuda con el nombre que él puso',
    deudasB[0]?.full_name === 'Jose R.',
    deudasB[0]?.full_name,
  )

  return s.resultado()
}

import { SELLO, crearComerciante, crearSuite, fecha, rpc } from './ayudas.mjs'

/**
 * El bug de las 1000 filas.
 *
 * PostgREST corta las respuestas y no avisa. La app sumaba "Te deben" con las
 * filas que le llegaban, así que pasando de mil fiados el resumen mostraba
 * menos de la mitad. Un número equivocado en la pantalla principal es peor
 * que no mostrarlo: el comerciante decide con él.
 *
 * Esta suite crea justo por encima del corte y comprueba que los totales
 * sigan siendo correctos.
 */
const N = 1100 // por encima del límite de 1000 de PostgREST
const MONTO = 10
const CLIENTES = 200

// Las cédulas admiten 9 dígitos como mucho, así que el prefijo se recorta:
// SELLO trae 7 y con los 3 del cliente se pasaba, y create_debt las rechazaba
// todas en silencio.
const PREFIJO = SELLO.slice(-6)

export default async function () {
  const s = crearSuite('Paginación y totales por encima de 1000')

  const A = await crearComerciante('pagina')

  // Crear 1100 fiados en tandas paralelas; en serie tardaría demasiado.
  let hechos = 0
  let fallos = 0
  let primerFallo = null
  while (hechos < N) {
    const tanda = Math.min(50, N - hechos)
    const res = await Promise.all(
      Array.from({ length: tanda }, (_, i) => {
        const n = hechos + i
        return rpc('create_debt', A.token, {
          p_cedula: `V${PREFIJO}${String(n % CLIENTES).padStart(3, '0')}`,
          p_full_name: `Cliente ${n % CLIENTES}`,
          p_amount: MONTO,
          // La mitad vencidas, para poder comprobar ese total aparte.
          p_due_date: fecha(n % 2 === 0 ? -5 : 30),
        })
      }),
    )
    for (const r of res) {
      if (r.estado >= 300) {
        fallos += 1
        primerFallo ??= JSON.stringify(r.datos).slice(0, 90)
      }
    }
    hechos += tanda
  }

  // Sin esto, un fallo al sembrar dejaba la base vacía y las 13 comprobaciones
  // siguientes daban cero sin explicar por qué.
  s.seccion('El montaje')
  s.check(`se crearon los ${N} fiados`, fallos === 0, `${fallos} fallaron: ${primerFallo}`)
  if (fallos > 0) return s.resultado()

  s.seccion('La lista sigue viniendo cortada, como es de esperar')
  const pagina = (await rpc('list_debts', A.token)).datos ?? []
  s.check('una página trae 100 filas por defecto', pagina.length === 100, `trajo ${pagina.length}`)

  s.seccion('Pero los totales se calculan sobre TODO')
  const r = (await rpc('get_dashboard', A.token)).datos?.[0]
  s.check(
    `"Te deben" suma los ${N} fiados, no los que caben en una página`,
    Number(r?.por_cobrar) === N * MONTO,
    `esperaba ${N * MONTO}, dio ${r?.por_cobrar}`,
  )
  s.check(
    'el conteo total es correcto',
    r?.n_todas === N,
    `esperaba ${N}, dio ${r?.n_todas}`,
  )
  s.check(
    'el vencido suma solo la mitad correspondiente',
    Number(r?.vencido) === (N / 2) * MONTO,
    `esperaba ${(N / 2) * MONTO}, dio ${r?.vencido}`,
  )
  s.check('los conteos por filtro cuadran', r?.n_vencida + r?.n_por_vencer === N,
    `${r?.n_vencida} + ${r?.n_por_vencer}`)
  s.check('cuenta los clientes distintos, no los fiados', r?.clientes === CLIENTES, `${r?.clientes}`)

  s.seccion('Paginar recorre la lista completa')
  const p1 = (await rpc('list_debts', A.token, { p_limite: 500, p_desde: 0 })).datos ?? []
  const p2 = (await rpc('list_debts', A.token, { p_limite: 500, p_desde: 500 })).datos ?? []
  const p3 = (await rpc('list_debts', A.token, { p_limite: 500, p_desde: 1000 })).datos ?? []
  s.check('primera página completa', p1.length === 500, `${p1.length}`)
  s.check('segunda página completa', p2.length === 500, `${p2.length}`)
  s.check('tercera página con el resto', p3.length === N - 1000, `${p3.length}`)
  const ids = new Set([...p1, ...p2, ...p3].map((d) => d.id))
  s.check('las tres páginas no se repiten entre sí', ids.size === N, `${ids.size} únicos`)

  s.seccion('El límite por página está acotado')
  const abusivo = (await rpc('list_debts', A.token, { p_limite: 99999 })).datos ?? []
  s.check('pedir 99999 filas devuelve como mucho 500', abusivo.length <= 500, `${abusivo.length}`)

  s.seccion('El filtro lo aplica el servidor, no el navegador')
  const vencidas = (await rpc('list_debts', A.token, { p_clase: 'vencida', p_limite: 500 })).datos ?? []
  s.check('todas las devueltas están vencidas', vencidas.every((d) => new Date(d.due_date) < new Date()))
  s.check('y son 500, no lo que quepa en una página truncada', vencidas.length === 500, `${vencidas.length}`)

  s.seccion('La búsqueda también')
  const buscadas = (await rpc('list_debts', A.token, { p_buscar: 'Cliente 7', p_limite: 500 })).datos ?? []
  s.check('encuentra por nombre', buscadas.length > 0, `${buscadas.length}`)
  s.check('y solo devuelve coincidencias', buscadas.every((d) => d.full_name.includes('Cliente 7')))
  const porCedula = (await rpc('list_debts', A.token, { p_buscar: `V${PREFIJO}007` })).datos ?? []
  s.check('encuentra por cédula', porCedula.length > 0, `${porCedula.length}`)

  s.seccion('Los clientes también cuentan sobre el total')
  const rc = (await rpc('get_clients_summary', A.token)).datos?.[0]
  s.check(`cuenta los ${CLIENTES} clientes`, rc?.total === CLIENTES, `${rc?.total}`)
  s.check('suma lo que deben todos', Number(rc?.debido) === N * MONTO, `${rc?.debido}`)
  // Ojo con la aritmética del montaje: los fiados se reparten con n % 200 y se
  // marcan vencidos con n % 2. Como 200 es par, cada cliente hereda la paridad
  // de su índice: los pares tienen TODAS sus deudas vencidas y los impares
  // ninguna. Salen exactamente la mitad en mora, no todos.
  s.check(
    'la mitad de los clientes queda en mora',
    rc?.en_mora === CLIENTES / 2,
    `esperaba ${CLIENTES / 2}, dio ${rc?.en_mora}`,
  )
  s.check(
    'la otra mitad tiene deuda pero sin vencer',
    rc?.con_deuda === CLIENTES / 2,
    `${rc?.con_deuda}`,
  )
  s.check(
    'los tres grupos suman el total de clientes',
    rc?.en_mora + rc?.con_deuda + rc?.al_dia === rc?.total,
    `${rc?.en_mora} + ${rc?.con_deuda} + ${rc?.al_dia} ≠ ${rc?.total}`,
  )

  return s.resultado()
}

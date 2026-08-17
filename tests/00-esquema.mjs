import { api, crearSuite, fallaCon, rpc } from './ayudas.mjs'

/**
 * Comprobación de arranque: que las migraciones estén aplicadas y que nada
 * esté abierto al público.
 *
 * Si esta suite falla, las demás fallarían en cascada: casi siempre significa
 * que falta pegar alguna migración en el SQL Editor.
 *
 * Ojo con cómo se comprueba: PostgREST resuelve las funciones por nombre Y
 * por firma, así que llamarlas sin argumentos devuelve PGRST202 aunque
 * existan. Por eso cada una se llama con sus parámetros reales. Como el rol
 * anónimo no tiene permiso de ejecución, la respuesta correcta es 42501
 * (permiso denegado), que de un solo golpe demuestra dos cosas: que la
 * función existe y que está cerrada al público.
 */
const FIRMAS = {
  create_debt: { p_cedula: 'V12345678', p_full_name: 'X', p_amount: 1, p_due_date: '2026-01-01' },
  mark_debt_paid: { p_debt_id: '00000000-0000-0000-0000-000000000000' },
  get_debtor_score: { p_cedula: 'V12345678' },
  list_debts: {},
  list_payments: {},
  set_debtor_phone: { p_debtor_id: '00000000-0000-0000-0000-000000000000', p_phone: '+584121234567' },
  add_payment: { p_debt_id: '00000000-0000-0000-0000-000000000000', p_amount: 1 },
  update_debt: { p_debt_id: '00000000-0000-0000-0000-000000000000', p_amount: 1, p_due_date: '2026-01-01' },
  delete_debt: { p_debt_id: '00000000-0000-0000-0000-000000000000' },
  delete_payment: { p_payment_id: '00000000-0000-0000-0000-000000000000' },
  set_debt_disputed: { p_debt_id: '00000000-0000-0000-0000-000000000000', p_disputed: true },
  sweep_my_overdue: {},
  cron_vencidas_activo: {},
  list_clients: {},
  get_dashboard: {},
  get_clients_summary: {},
  update_client: { p_debtor_id: '00000000-0000-0000-0000-000000000000', p_full_name: 'X' },
}

export default async function () {
  const s = crearSuite('Esquema y candados públicos')

  s.seccion('Las funciones RPC existen y están cerradas al público')
  for (const [nombre, args] of Object.entries(FIRMAS)) {
    const r = await rpc(nombre, null, args)

    if (fallaCon(r, 'PGRST202')) {
      s.check(`${nombre}`, false, 'no existe: falta aplicar una migración')
    } else {
      s.check(`${nombre} existe y rechaza al rol anónimo`, fallaCon(r, '42501'), `HTTP ${r.estado}`)
    }
  }

  s.seccion('Las tablas no se leen sin sesión')
  for (const t of ['debtors', 'score_history', 'merchants', 'debts', 'payments', 'merchant_debtors']) {
    const r = await api(`/rest/v1/${t}?select=*&limit=1`)
    s.check(`${t} rechaza al rol anónimo`, r.estado === 401 || r.estado === 403, `HTTP ${r.estado}`)
  }

  return s.resultado()
}

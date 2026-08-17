import { supabase } from './supabase'
import { normalizarCedula, normalizarTelefono } from './formato'

/**
 * Todas las llamadas a la base de datos en un solo sitio.
 *
 * Ninguna escribe en las tablas directamente: pasan por las funciones RPC,
 * que son las que validan auth.uid(), el plan y los límites del lado del
 * servidor. El cliente solo tiene SELECT sobre debts.
 */

/**
 * Quita las claves vacías antes de mandar los argumentos.
 *
 * Estas RPC viajan por GET para que el service worker pueda cachearlas, y en
 * una query string un null se convierte en la cadena "null", que no es lo
 * mismo que no mandar el parámetro y quedarse con el valor por defecto.
 */
function args(objeto) {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  )
}

/**
 * Una página de deudas, ya filtrada y buscada en el servidor.
 *
 * El filtrado no puede hacerse en el navegador: PostgREST corta en 1000 filas
 * y filtrar sobre una lista truncada daría resultados incompletos sin avisar.
 */
export async function listarDeudas({ clase = null, buscar = null, limite = 100, desde = 0 } = {}) {
  const { data, error } = await supabase.rpc(
    'list_debts',
    args({ p_clase: clase, p_buscar: buscar, p_limite: limite, p_desde: desde }),
    { get: true },
  )
  if (error) throw error
  return data ?? []
}

/** Totales de la pantalla principal, calculados en SQL sobre TODAS las filas. */
export async function obtenerResumen() {
  const { data, error } = await supabase.rpc('get_dashboard', {}, { get: true })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) ?? null
}

export async function crearDeuda({ cedula, nombre, monto, vence, notas, telefono, telefono2, direccion }) {
  const { data, error } = await supabase.rpc('create_debt', {
    p_cedula: normalizarCedula(cedula),
    p_full_name: nombre.trim(),
    p_amount: Number(monto),
    p_due_date: vence,
    p_notes: notas?.trim() || null,
    p_phone: normalizarTelefono(telefono),
    p_phone2: normalizarTelefono(telefono2),
    p_address: direccion?.trim() || null,
  })
  if (error) throw error
  return data
}

/** Una página de clientes, filtrada y buscada en el servidor. */
export async function listarClientes({ filtro = null, buscar = null, limite = 100, desde = 0 } = {}) {
  const { data, error } = await supabase.rpc(
    'list_clients',
    args({ p_filtro: filtro, p_buscar: buscar, p_limite: limite, p_desde: desde }),
    { get: true },
  )
  if (error) throw error
  return data ?? []
}

/** Contadores de la pestaña Clientes, sobre el total. */
export async function obtenerResumenClientes() {
  const { data, error } = await supabase.rpc('get_clients_summary', {}, { get: true })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) ?? null
}

export async function actualizarCliente({ debtorId, nombre, telefono, telefono2, direccion }) {
  const { error } = await supabase.rpc('update_client', {
    p_debtor_id: debtorId,
    p_full_name: nombre.trim(),
    p_phone: normalizarTelefono(telefono),
    p_phone2: normalizarTelefono(telefono2),
    p_address: direccion?.trim() || null,
  })
  if (error) throw error
}

export async function actualizarDeuda({ id, monto, vence, notas }) {
  const { error } = await supabase.rpc('update_debt', {
    p_debt_id: id,
    p_amount: Number(monto),
    p_due_date: vence,
    p_notes: notas?.trim() || null,
  })
  if (error) throw error
}

export async function borrarDeuda(idDeuda) {
  const { error } = await supabase.rpc('delete_debt', { p_debt_id: idDeuda })
  if (error) throw error
}

export async function borrarAbono(idAbono) {
  const { error } = await supabase.rpc('delete_payment', { p_payment_id: idAbono })
  if (error) throw error
}

/** Marca o desmarca la deuda como "el cliente reclama que ya pagó". */
export async function marcarReclamo(idDeuda, enReclamo) {
  const { error } = await supabase.rpc('set_debt_disputed', {
    p_debt_id: idDeuda,
    p_disputed: enReclamo,
  })
  if (error) throw error
}

export async function marcarPagada(idDeuda) {
  const { error } = await supabase.rpc('mark_debt_paid', { p_debt_id: idDeuda })
  if (error) throw error
}

/** Abono parcial. Devuelve { abonado, saldo, quedo_pagada }. */
export async function abonar(idDeuda, monto) {
  const { data, error } = await supabase.rpc('add_payment', {
    p_debt_id: idDeuda,
    p_amount: Number(monto),
  })
  if (error) throw error
  return Array.isArray(data) ? (data[0] ?? null) : data
}

/** Abonos de una deuda concreta, para su historial. */
export async function listarAbonos(idDeuda) {
  const { data, error } = await supabase.rpc(
    'list_payments',
    args({ p_debt_id: idDeuda }),
    { get: true },
  )
  if (error) throw error
  return data ?? []
}

/** Devuelve { score, band, active_debts }. score null = desconocido en la red. */
export async function consultarScore(cedula) {
  const { data, error } = await supabase.rpc('get_debtor_score', {
    p_cedula: normalizarCedula(cedula),
  })
  if (error) throw error
  // La función devuelve TABLE, así que PostgREST responde con un arreglo.
  return Array.isArray(data) ? (data[0] ?? null) : data
}

export async function guardarTelefonoDeudor(idDeudor, telefono) {
  const { error } = await supabase.rpc('set_debtor_phone', {
    p_debtor_id: idDeudor,
    p_phone: normalizarTelefono(telefono),
  })
  if (error) throw error
}

export async function actualizarComercio(idComercio, campos) {
  // Solo columnas de perfil: plan, plan_expires_at y free_queries_used no
  // están en el GRANT del rol authenticated y el servidor los rechazaría.
  const { error } = await supabase.from('merchants').update(campos).eq('id', idComercio)
  if (error) throw error
}

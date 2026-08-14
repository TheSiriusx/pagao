import { supabase } from './supabase'
import { normalizarCedula, normalizarTelefono } from './formato'

/**
 * Todas las llamadas a la base de datos en un solo sitio.
 *
 * Ninguna escribe en las tablas directamente: pasan por las funciones RPC,
 * que son las que validan auth.uid(), el plan y los límites del lado del
 * servidor. El cliente solo tiene SELECT sobre debts.
 */

/** Lista de deudas del comerciante, con nombre y cédula del cliente. */
export async function listarDeudas() {
  // get: true hace que viaje por GET, y así el service worker la puede
  // cachear para que la lista se vea sin señal.
  const { data, error } = await supabase.rpc('list_debts', {}, { get: true })
  if (error) throw error
  return data ?? []
}

export async function crearDeuda({ cedula, nombre, monto, vence, notas, telefono }) {
  const { data, error } = await supabase.rpc('create_debt', {
    p_cedula: normalizarCedula(cedula),
    p_full_name: nombre.trim(),
    p_amount: Number(monto),
    p_due_date: vence,
    p_notes: notas?.trim() || null,
    p_phone: normalizarTelefono(telefono),
  })
  if (error) throw error
  return data
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

/** Abonos del comerciante, para el resumen del mes y el historial. */
export async function listarAbonos() {
  const { data, error } = await supabase.rpc('list_payments', {}, { get: true })
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

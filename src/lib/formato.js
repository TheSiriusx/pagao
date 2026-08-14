/**
 * Normalización y validación de cédulas y teléfonos venezolanos.
 *
 * La cédula se guarda SIEMPRE en forma canónica (V12345678) para que
 * "V-12.345.678" y "v12345678" sean la misma persona en la Red Pagao.
 * La misma normalización corre del lado del servidor en create_debt() y
 * get_debtor_score(): esto de aquí es solo para avisarle al usuario antes
 * de gastar el viaje a la red.
 */

const OPERADORAS = ['0412', '0414', '0416', '0424', '0426']

// ---------------------------------------------------------------- cédula ----

/** Quita guiones, puntos y espacios; pasa a mayúscula. "v-12.345.678" → "V12345678" */
export function normalizarCedula(valor) {
  return String(valor ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
}

/** Acepta lo que el usuario escriba con o sin guion: V-12345678 o V12345678. */
export function cedulaValida(valor) {
  return /^[VE][0-9]{6,9}$/.test(normalizarCedula(valor))
}

/** Para mostrar en pantalla: "V12345678" → "V-12.345.678" */
export function formatearCedula(valor) {
  const c = normalizarCedula(valor)
  if (!/^[VE][0-9]{6,9}$/.test(c)) return valor ?? ''
  const digitos = c.slice(1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${c[0]}-${digitos}`
}

// -------------------------------------------------------------- teléfono ----

/**
 * Devuelve el teléfono en E.164 (+584121234567) o null si no es un móvil
 * venezolano. Acepta 04121234567, 4121234567, 584121234567 y +58 412 123 4567.
 */
export function normalizarTelefono(valor) {
  let d = String(valor ?? '').replace(/\D/g, '')

  if (d.startsWith('58')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1)

  if (d.length !== 10) return null
  if (!OPERADORAS.includes(`0${d.slice(0, 3)}`)) return null

  return `+58${d}`
}

export function telefonoValido(valor) {
  return normalizarTelefono(valor) !== null
}

/** Para mostrar en pantalla: "+584121234567" → "0412-1234567" */
export function formatearTelefono(valor) {
  const e164 = normalizarTelefono(valor)
  if (!e164) return valor ?? ''
  const d = e164.slice(3)
  return `0${d.slice(0, 3)}-${d.slice(3)}`
}

/** El formato que pide wa.me: sin +, sin espacios. "+584121234567" → "584121234567" */
export function telefonoParaWhatsApp(valor) {
  const e164 = normalizarTelefono(valor)
  return e164 ? e164.slice(1) : null
}

// ----------------------------------------------------------------- montos ----

export function formatearMonto(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return '$0,00'
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

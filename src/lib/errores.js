/**
 * Traducción de errores de Supabase a español de comerciante.
 *
 * Las funciones RPC lanzan códigos secos (raise exception 'FREE_LIMIT') que
 * llegan dentro de error.message. Aquí se detectan y se convierten en algo
 * que una persona pueda leer.
 */

const POR_CODIGO = {
  NO_AUTH: 'Tu sesión se venció. Vuelve a entrar con tu teléfono.',
  NOT_A_MERCHANT: 'Todavía no registraste tu negocio.',
  NOT_YOUR_DEBT_OR_ALREADY_PAID: 'Esa deuda ya está pagada o no es tuya.',
  NOT_YOUR_CLIENT: 'Ese cliente no tiene fiados contigo.',
  NOT_YOUR_DEBT: 'Esa deuda no es tuya.',
  ALREADY_PAID: 'Esa deuda ya está pagada.',
  AMOUNT_TOO_BIG: 'El abono es mayor que lo que falta por pagar.',
  AMOUNT_BELOW_PAID: 'El monto no puede ser menor que lo que el cliente ya abonó.',
  CANNOT_DELETE_PAID: 'No se puede borrar una deuda ya pagada, porque su pago movió el score del cliente.',
  DEBT_ALREADY_PAID: 'Esa deuda ya está cerrada. No se le pueden quitar abonos.',
  NOT_YOUR_PAYMENT: 'Ese abono no es tuyo.',
  INVALID_CEDULA: 'La cédula no es válida. Escríbela como V12345678.',
  INVALID_NAME: 'Falta el nombre del cliente.',
  INVALID_AMOUNT: 'El monto debe ser mayor que cero.',
  INVALID_DUE_DATE: 'Falta la fecha de vencimiento.',
  FREE_LIMIT: 'Ya usaste tu consulta gratis.',
}

/** Códigos SQLSTATE de PostgreSQL que llegan como error.code. */
const POR_SQLSTATE = {
  '23505': 'Ese dato ya está registrado con otra cuenta.',
  '23503': 'Falta un dato relacionado. Refresca e intenta de nuevo.',
  '42501': 'No tienes permiso para hacer eso.',
  PGRST301: 'Tu sesión se venció. Vuelve a entrar con tu teléfono.',
}

/** Devuelve el código crudo ('FREE_LIMIT', etc.) para poder ramificar en la UI. */
export function codigoDeError(error) {
  const texto = error?.message ?? ''
  return Object.keys(POR_CODIGO).find((codigo) => texto.includes(codigo)) ?? null
}

export function esErrorDeRed(error) {
  if (!error) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const texto = `${error.message ?? ''}`.toLowerCase()
  return (
    texto.includes('failed to fetch') ||
    texto.includes('networkerror') ||
    texto.includes('load failed') ||
    texto.includes('network request failed')
  )
}

export function mensajeDeError(error, respaldo = 'Algo salió mal. Intenta otra vez.') {
  if (!error) return respaldo

  if (esErrorDeRed(error)) {
    return 'Sin conexión. Revisa tus datos o el wifi e intenta otra vez.'
  }

  const codigo = codigoDeError(error)
  if (codigo) return POR_CODIGO[codigo]

  if (error.code && POR_SQLSTATE[error.code]) return POR_SQLSTATE[error.code]

  // Errores de Auth que vale la pena traducir uno por uno.
  const texto = `${error.message ?? ''}`.toLowerCase()

  if (texto.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (texto.includes('already registered') || texto.includes('already exists')) {
    return 'Ese correo ya tiene cuenta. Entra en vez de crearla.'
  }
  if (texto.includes('email not confirmed')) {
    return 'Falta confirmar tu correo. Revisa la bandeja de entrada.'
  }
  if (texto.includes('password') && texto.includes('at least')) {
    return 'La contraseña necesita al menos 6 caracteres.'
  }
  if (texto.includes('invalid') && texto.includes('email')) {
    return 'Ese correo no es válido.'
  }
  if (texto.includes('signups not allowed') || texto.includes('signup is disabled')) {
    return 'El registro está desactivado en Supabase. Actívalo en Authentication → Sign In / Providers.'
  }
  if (texto.includes('rate limit') || texto.includes('too many')) {
    return 'Demasiados intentos. Espera un minuto e intenta otra vez.'
  }

  return error.message || respaldo
}

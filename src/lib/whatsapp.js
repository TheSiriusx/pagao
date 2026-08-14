import { telefonoParaWhatsApp } from './formato'
import { formatearFecha } from './fechas'

/**
 * Recordatorio de cobro por WhatsApp.
 *
 * v1 usa el enlace wa.me: abre WhatsApp con el mensaje escrito y el
 * comerciante le da enviar. Sin Business API, sin Twilio y sin aprobación de
 * Meta — y sin un solo token en el frontend.
 */

export function mensajeRecordatorio({ deuda, comercio }) {
  // Se cobra el SALDO, no el monto original: si ya abonó, recordarle el total
  // completo sería un error de cobro.
  const saldo = Math.max(Number(deuda.amount) - Number(deuda.abonado ?? 0), 0)
  const partes = [
    `Hola ${deuda.full_name}, te recuerda ${comercio.business_name}: `,
    `debes $${saldo.toFixed(2)}, vence el ${formatearFecha(deuda.due_date)}. `,
  ]

  if (comercio.bank_name && comercio.bank_phone) {
    const tel = telefonoParaWhatsApp(comercio.bank_phone) ?? comercio.bank_phone
    partes.push(`Paga por Pago Movil: ${comercio.bank_name} / ${tel}. `)
  }

  partes.push('Gracias!')
  return partes.join('')
}

/** true si se pudo abrir; false si al cliente le falta el teléfono. */
export function abrirWhatsApp({ deuda, comercio }) {
  const destino = telefonoParaWhatsApp(deuda.phone)
  if (!destino) return false

  const texto = encodeURIComponent(mensajeRecordatorio({ deuda, comercio }))
  window.open(`https://wa.me/${destino}?text=${texto}`, '_blank', 'noopener,noreferrer')
  return true
}

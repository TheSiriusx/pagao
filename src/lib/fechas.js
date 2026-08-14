/**
 * Fechas de vencimiento.
 *
 * Postgres devuelve due_date como 'YYYY-MM-DD'. Ojo con new Date('2026-08-10'):
 * JavaScript lo interpreta como medianoche UTC, que en Venezuela (UTC-4) es el
 * día ANTERIOR a las 8pm. Una deuda que vence hoy se vería como vencida ayer.
 * Por eso siempre se arma la fecha por partes, en hora local.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'YYYY-MM-DD' → Date local a medianoche. */
export function aFechaLocal(iso) {
  if (!iso) return null
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return null
  return new Date(a, m - 1, d)
}

/** Hoy a medianoche, para comparar contra due_date sin que estorbe la hora. */
export function hoy() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

/** Negativo = ya venció. 0 = vence hoy. Positivo = le quedan días. */
export function diasHasta(iso) {
  const f = aFechaLocal(iso)
  if (!f) return null
  return Math.round((f - hoy()) / 86400000)
}

/** '2026-08-10' → '10 ago' (o '10 ago 2025' si es de otro año). */
export function formatearFecha(iso) {
  const f = aFechaLocal(iso)
  if (!f) return ''
  const base = `${f.getDate()} ${MESES[f.getMonth()]}`
  return f.getFullYear() === hoy().getFullYear() ? base : `${base} ${f.getFullYear()}`
}

/** Para el input date: hoy en 'YYYY-MM-DD'. */
export function isoDeHoy(sumarDias = 0) {
  const f = hoy()
  f.setDate(f.getDate() + sumarDias)
  const mm = String(f.getMonth() + 1).padStart(2, '0')
  const dd = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${mm}-${dd}`
}

/**
 * Clasificación que usa la interfaz. No es el status de la base de datos:
 * el cron solo marca 'overdue' a los 30 días, pero para el comerciante una
 * deuda ya está vencida el día después de la fecha.
 */
export function claseDeuda(deuda) {
  if (deuda.status === 'paid') return 'pagada'
  return diasHasta(deuda.due_date) < 0 ? 'vencida' : 'por_vencer'
}

/** Texto humano del vencimiento. */
export function textoVencimiento(deuda) {
  if (deuda.status === 'paid') {
    return deuda.days_late > 0 ? `Pagó ${deuda.days_late} día${deuda.days_late === 1 ? '' : 's'} tarde` : 'Pagada a tiempo'
  }

  const d = diasHasta(deuda.due_date)
  if (d === null) return ''
  if (d < -1) return `Vencida hace ${Math.abs(d)} días`
  if (d === -1) return 'Vencida ayer'
  if (d === 0) return 'Vence hoy'
  if (d === 1) return 'Vence mañana'
  return `Vence en ${d} días`
}

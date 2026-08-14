/**
 * Semáforo del score. Las bandas las decide get_debtor_score en el servidor:
 * verde ≥80, amarillo ≥60, naranja ≥40, rojo <40, gris = desconocido.
 * Aquí solo se pinta lo que llegó.
 */

const BANDAS = {
  verde: {
    etiqueta: 'Buen pagador',
    consejo: 'Paga a tiempo. Fíale con tranquilidad.',
    anillo: 'ring-emerald-200',
    fondo: 'bg-emerald-50',
    texto: 'text-emerald-700',
    punto: 'bg-emerald-500',
  },
  amarillo: {
    etiqueta: 'Regular',
    consejo: 'A veces se atrasa. Ponle plazos cortos.',
    anillo: 'ring-amber-200',
    fondo: 'bg-amber-50',
    texto: 'text-amber-700',
    punto: 'bg-amber-500',
  },
  naranja: {
    etiqueta: 'Riesgoso',
    consejo: 'Se atrasa seguido. Pide algo por adelantado.',
    anillo: 'ring-orange-200',
    fondo: 'bg-orange-50',
    texto: 'text-orange-700',
    punto: 'bg-orange-500',
  },
  rojo: {
    etiqueta: 'Mal pagador',
    consejo: 'Historial malo en la red. Mejor no fiarle.',
    anillo: 'ring-red-200',
    fondo: 'bg-red-50',
    texto: 'text-red-700',
    punto: 'bg-red-500',
  },
  gris: {
    etiqueta: 'Sin historial',
    consejo: 'Nadie lo ha registrado todavía. Empieza con poco.',
    anillo: 'ring-slate-200',
    fondo: 'bg-slate-50',
    texto: 'text-slate-600',
    punto: 'bg-slate-400',
  },
}

export function estiloBanda(banda) {
  return BANDAS[banda] ?? BANDAS.gris
}

/** Pastilla compacta, para listas. */
export function PastillaScore({ banda, score }) {
  const e = estiloBanda(banda)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold
                  ring-1 ${e.fondo} ${e.texto} ${e.anillo}`}
    >
      <span className={`size-2 rounded-full ${e.punto}`} aria-hidden="true" />
      {score ?? '—'}
    </span>
  )
}

/** Tarjeta grande, para el resultado de la búsqueda en la Red Pagao. */
export function TarjetaScore({ banda, score, deudasActivas }) {
  const e = estiloBanda(banda)

  return (
    <div className={`rounded-2xl p-5 text-center ring-1 ${e.fondo} ${e.anillo}`}>
      <div className="flex items-center justify-center gap-2">
        <span className={`size-3 rounded-full ${e.punto}`} aria-hidden="true" />
        <span className={`text-sm font-semibold ${e.texto}`}>{e.etiqueta}</span>
      </div>

      <p className={`mt-2 text-5xl leading-none font-bold ${e.texto}`}>{score ?? '—'}</p>
      <p className="mt-1 text-xs text-slate-500">{score === null ? 'sin puntaje' : 'de 100 puntos'}</p>

      <p className={`mt-3 text-sm ${e.texto}`}>{e.consejo}</p>

      <div className="mt-4 border-t border-white/60 pt-3 text-sm text-slate-600">
        {deudasActivas > 0 ? (
          <>
            Debe en <strong>{deudasActivas}</strong>{' '}
            {deudasActivas === 1 ? 'comercio' : 'comercios'} ahora mismo
          </>
        ) : (
          'No tiene deudas pendientes en la red'
        )}
      </div>
    </div>
  )
}

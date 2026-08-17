import { formatearMonto } from '../lib/formato'

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
    disco: 'bg-emerald-500',
    textoDisco: 'text-white',
  },
  amarillo: {
    etiqueta: 'Regular',
    consejo: 'A veces se atrasa. Ponle plazos cortos.',
    anillo: 'ring-amber-200',
    fondo: 'bg-amber-50',
    texto: 'text-amber-700',
    punto: 'bg-amber-500',
    disco: 'bg-amber-400',
    textoDisco: 'text-amber-950',
  },
  naranja: {
    etiqueta: 'Riesgoso',
    consejo: 'Se atrasa seguido. Pide algo por adelantado.',
    anillo: 'ring-orange-200',
    fondo: 'bg-orange-50',
    texto: 'text-orange-700',
    punto: 'bg-orange-500',
    disco: 'bg-orange-500',
    textoDisco: 'text-white',
  },
  rojo: {
    etiqueta: 'Mal pagador',
    consejo: 'Historial malo en la red. Mejor no fiarle.',
    anillo: 'ring-red-200',
    fondo: 'bg-red-50',
    texto: 'text-red-700',
    punto: 'bg-red-500',
    disco: 'bg-red-500',
    textoDisco: 'text-white',
  },
  gris: {
    etiqueta: 'Sin historial',
    consejo: 'Nadie lo ha registrado todavía. Empieza con poco.',
    anillo: 'ring-slate-200',
    fondo: 'bg-slate-50',
    texto: 'text-slate-600',
    punto: 'bg-slate-400',
    disco: 'bg-slate-200',
    textoDisco: 'text-slate-500',
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

/** Ficha grande: el resultado de buscar una cédula en la Red Pagao. */
export function TarjetaScore({ banda, score, deudasActivas, nombre, cedula, totalDeuda }) {
  const e = estiloBanda(banda)

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="px-5 pt-6 pb-5 text-center">
        <div
          className={`mx-auto flex size-28 flex-col items-center justify-center rounded-full
                      ${e.disco} ${e.textoDisco}`}
        >
          <span className="text-4xl leading-none font-bold">{score ?? '—'}</span>
          <span className="mt-0.5 text-[10px] font-semibold tracking-widest uppercase opacity-75">
            Score
          </span>
        </div>

        {nombre && <p className="mt-4 text-xl font-bold break-words text-slate-900">{nombre}</p>}
        {cedula && <p className="text-sm text-slate-500">{cedula}</p>}
      </div>

      <dl className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
        <Fila termino="Nivel">
          <span className={`font-semibold ${e.texto}`}>{e.etiqueta}</span>
        </Fila>

        <Fila termino="Deudas activas">
          <span className={`font-semibold ${deudasActivas > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
            {deudasActivas > 0
              ? `${deudasActivas} ${deudasActivas === 1 ? 'tienda' : 'tiendas'}`
              : 'Ninguna'}
          </span>
        </Fila>

        {totalDeuda != null && (
          <Fila termino="Total adeudado">
            <span className="font-semibold text-slate-900">{formatearMonto(totalDeuda)}</span>
          </Fila>
        )}
      </dl>

      <p className={`px-5 py-4 text-center text-sm ${e.fondo} ${e.texto}`}>{e.consejo}</p>
    </div>
  )
}

function Fila({ termino, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-slate-500">{termino}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

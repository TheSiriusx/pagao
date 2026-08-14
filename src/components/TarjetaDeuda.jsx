import { HandCoins, MessageCircle, PhoneOff } from 'lucide-react'
import { claseDeuda, formatearFecha, textoVencimiento } from '../lib/fechas'
import { formatearCedula, formatearMonto } from '../lib/formato'

const ESTILOS = {
  pagada: 'bg-emerald-50 text-emerald-700',
  vencida: 'bg-red-50 text-red-700',
  por_vencer: 'bg-slate-100 text-slate-600',
}

export default function TarjetaDeuda({ deuda, alCobrar, alAbonar }) {
  const clase = claseDeuda(deuda)
  const pagada = deuda.status === 'paid'
  const sinTelefono = !deuda.phone

  const total = Number(deuda.amount)
  const abonado = Number(deuda.abonado ?? 0)
  const saldo = Math.max(total - abonado, 0)
  const hayAbonos = abonado > 0 && !pagada
  const avance = total > 0 ? Math.min((abonado / total) * 100, 100) : 0

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold break-words text-slate-900">{deuda.full_name}</p>
          <p className="text-xs text-slate-500">{formatearCedula(deuda.cedula)}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className={`font-bold ${pagada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
            {formatearMonto(pagada ? total : saldo)}
          </p>
          <p className="text-xs text-slate-400">{formatearFecha(deuda.due_date)}</p>
        </div>
      </div>

      {hayAbonos && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-marca-500" style={{ width: `${avance}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Abonó {formatearMonto(abonado)} de {formatearMonto(total)}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[clase]}`}>
          {textoVencimiento(deuda)}
        </span>
        {deuda.notes && (
          <span className="min-w-0 truncate text-xs text-slate-400">· {deuda.notes}</span>
        )}
      </div>

      {!pagada && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => alCobrar(deuda)}
            disabled={sinTelefono}
            title={sinTelefono ? 'Este cliente no tiene teléfono registrado' : undefined}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50
                       px-3 py-2.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200
                       hover:bg-emerald-100 disabled:opacity-50"
          >
            {sinTelefono ? (
              <PhoneOff className="size-4" aria-hidden="true" />
            ) : (
              <MessageCircle className="size-4" aria-hidden="true" />
            )}
            Cobrar
          </button>

          <button
            type="button"
            onClick={() => alAbonar(deuda)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100
                       px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            <HandCoins className="size-4" aria-hidden="true" />
            Abonar
          </button>
        </div>
      )}
    </li>
  )
}

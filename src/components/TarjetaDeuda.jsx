import { useEffect, useRef, useState } from 'react'
import {
  Flag,
  HandCoins,
  MessageCircle,
  MoreVertical,
  Pencil,
  PhoneOff,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { claseDeuda, formatearFecha, textoVencimiento } from '../lib/fechas'
import { formatearCedula, formatearMonto } from '../lib/formato'

const ESTILOS = {
  pagada: 'bg-emerald-50 text-emerald-700',
  vencida: 'bg-red-50 text-red-700',
  reclamo: 'bg-amber-50 text-amber-700',
  por_vencer: 'bg-slate-100 text-slate-600',
}

export default function TarjetaDeuda({
  deuda,
  alCobrar,
  alAbonar,
  alEditar,
  alBorrar,
  alReclamar,
  alPonerTelefono,
}) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const contenedor = useRef(null)

  useEffect(() => {
    if (!menuAbierto) return
    const alTocarFuera = (e) => {
      if (!contenedor.current?.contains(e.target)) setMenuAbierto(false)
    }
    document.addEventListener('mousedown', alTocarFuera)
    return () => document.removeEventListener('mousedown', alTocarFuera)
  }, [menuAbierto])

  const clase = claseDeuda(deuda)
  const pagada = deuda.status === 'paid'
  const enReclamo = deuda.status === 'disputed'
  const sinTelefono = !deuda.phone

  const total = Number(deuda.amount)
  const abonado = Number(deuda.abonado ?? 0)
  const saldo = Math.max(total - abonado, 0)
  const hayAbonos = abonado > 0 && !pagada
  const avance = total > 0 ? Math.min((abonado / total) * 100, 100) : 0

  function elegir(accion) {
    setMenuAbierto(false)
    accion()
  }

  return (
    <li className="relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words text-slate-900">{deuda.full_name}</p>
          <p className="text-xs text-slate-500">{formatearCedula(deuda.cedula)}</p>
        </div>

        <div className="flex shrink-0 items-start gap-1">
          <div className="text-right">
            <p className={`font-bold ${pagada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
              {formatearMonto(pagada ? total : saldo)}
            </p>
            <p className="text-xs text-slate-400">{formatearFecha(deuda.due_date)}</p>
          </div>

          {!pagada && (
            <div ref={contenedor} className="relative">
              <button
                type="button"
                onClick={() => setMenuAbierto((v) => !v)}
                aria-label="Más acciones"
                aria-expanded={menuAbierto}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <MoreVertical className="size-4" aria-hidden="true" />
              </button>

              {menuAbierto && (
                <div
                  className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl bg-white
                             py-1 shadow-lg ring-1 ring-slate-200"
                >
                  <BotonMenu Icono={Pencil} onClick={() => elegir(() => alEditar(deuda))}>
                    Corregir monto o fecha
                  </BotonMenu>

                  <BotonMenu
                    Icono={MessageCircle}
                    onClick={() => elegir(() => alPonerTelefono(deuda))}
                  >
                    {sinTelefono ? 'Agregar teléfono' : 'Cambiar teléfono'}
                  </BotonMenu>

                  <BotonMenu
                    Icono={enReclamo ? RotateCcw : Flag}
                    onClick={() => elegir(() => alReclamar(deuda, !enReclamo))}
                  >
                    {enReclamo ? 'Quitar el reclamo' : 'El cliente reclama'}
                  </BotonMenu>

                  <BotonMenu
                    Icono={Trash2}
                    peligro
                    onClick={() => {
                      setMenuAbierto(false)
                      setConfirmandoBorrado(true)
                    }}
                  >
                    Borrar fiado
                  </BotonMenu>
                </div>
              )}
            </div>
          )}
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

      {confirmandoBorrado ? (
        <div className="mt-4 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="text-sm text-red-800">
            ¿Borrar este fiado{abonado > 0 ? ' y sus abonos' : ''}? No se puede deshacer.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoBorrado(false)}
              className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700
                         ring-1 ring-slate-300"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmandoBorrado(false)
                alBorrar(deuda)
              }}
              className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white
                         hover:bg-red-700"
            >
              Sí, borrar
            </button>
          </div>
        </div>
      ) : (
        !pagada && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => alCobrar(deuda)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50
                         px-3 py-2.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200
                         hover:bg-emerald-100"
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
        )
      )}
    </li>
  )
}

function BotonMenu({ Icono, children, peligro = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm ${
        peligro ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icono className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  )
}

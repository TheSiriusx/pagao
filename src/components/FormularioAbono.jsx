import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { abonar, borrarAbono, listarAbonos, marcarPagada } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearMonto } from '../lib/formato'
import { Alerta, Boton, Campo, Hoja } from './UI'

/** Sugerencias rápidas: mitad y saldo completo, redondeadas a céntimo. */
function sugerencias(saldo) {
  const mitad = Math.round((saldo / 2) * 100) / 100
  return [...new Set([mitad, saldo])].filter((n) => n > 0)
}

function fechaCorta(iso) {
  const f = new Date(iso)
  return f.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
}

export default function FormularioAbono({ deuda, alCerrar, alGuardar }) {
  const [monto, setMonto] = useState('')
  const [error, setError] = useState(null)
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(null)
  const [abonos, setAbonos] = useState([])

  // Solo los de esta deuda: traer los del comercio entero era innecesario y
  // encima se quedaba corto en cuanto pasaban de mil.
  const cargarAbonos = useCallback(async () => {
    if (!deuda?.id) return
    try {
      setAbonos(await listarAbonos(deuda.id))
    } catch {
      setAbonos([])
    }
  }, [deuda?.id])

  useEffect(() => {
    setMonto('')
    setError(null)
    setErrorGeneral(null)
    cargarAbonos()
  }, [deuda?.id, cargarAbonos])

  if (!deuda) return null

  const total = Number(deuda.amount)
  const abonado = Number(deuda.abonado ?? 0)
  const saldo = Math.max(total - abonado, 0)
  const mios = abonos

  async function enviar(evento) {
    evento.preventDefault()
    setErrorGeneral(null)

    const n = Number(monto)
    if (!(n > 0)) {
      setError('Escribe cuánto abonó.')
      return
    }
    if (n > saldo + 0.005) {
      setError(`No puede ser más de ${formatearMonto(saldo)}.`)
      return
    }

    setGuardando(true)
    try {
      // Si abona justo el saldo completo, se usa mark_debt_paid: hace lo
      // mismo pero en una sola operación y deja el registro más limpio.
      if (n >= saldo - 0.005) {
        await marcarPagada(deuda.id)
      } else {
        await abonar(deuda.id, n)
      }
      await alGuardar()
      alCerrar()
    } catch (fallo) {
      setErrorGeneral(mensajeDeError(fallo))
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(idAbono) {
    setErrorGeneral(null)
    setBorrando(idAbono)
    try {
      await borrarAbono(idAbono)
      await cargarAbonos()
      await alGuardar()
    } catch (fallo) {
      setErrorGeneral(mensajeDeError(fallo))
    } finally {
      setBorrando(null)
    }
  }

  return (
    <Hoja abierta={Boolean(deuda)} alCerrar={alCerrar} titulo={`Abono de ${deuda.full_name}`}>
      <div className="mb-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-slate-500">Le falta</span>
          <span className="text-2xl font-bold text-slate-900">{formatearMonto(saldo)}</span>
        </div>
        {abonado > 0 && (
          <p className="mt-1 text-right text-xs text-slate-500">
            Lleva {formatearMonto(abonado)} de {formatearMonto(total)}
          </p>
        )}
      </div>

      {mios.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Abonos anteriores</p>
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {mios.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm text-slate-500">{fechaCorta(a.paid_at)}</span>
                <span className="ml-auto font-medium text-slate-900">
                  {formatearMonto(a.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => quitar(a.id)}
                  disabled={borrando === a.id}
                  aria-label={`Borrar abono de ${formatearMonto(a.amount)}`}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600
                             disabled:opacity-40"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={enviar} noValidate className="space-y-4">
        <Campo
          id="montoAbono"
          etiqueta="¿Cuánto abonó?"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          autoFocus
          placeholder="0,00"
          value={monto}
          onChange={(e) => {
            setMonto(e.target.value)
            setError(null)
          }}
          error={error}
        />

        <div className="flex flex-wrap gap-2">
          {sugerencias(saldo).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setMonto(String(n))
                setError(null)
              }}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700
                         hover:bg-slate-200"
            >
              {n >= saldo ? `Pagó todo · ${formatearMonto(n)}` : formatearMonto(n)}
            </button>
          ))}
        </div>

        {errorGeneral && <Alerta>{errorGeneral}</Alerta>}

        <Boton type="submit" cargando={guardando}>
          {guardando ? 'Guardando…' : 'Registrar abono'}
        </Boton>
      </form>
    </Hoja>
  )
}

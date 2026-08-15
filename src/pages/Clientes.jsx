import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, MapPin, Phone, Search, Users, X } from 'lucide-react'
import { listarClientes, listarDeudas } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearCedula, formatearMonto, formatearTelefono, normalizarCedula } from '../lib/formato'
import { Alerta, Cargando, Vacio } from '../components/UI'
import FichaCliente from '../components/FichaCliente'

const FILTROS = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'mora', etiqueta: 'En mora' },
  { id: 'deben', etiqueta: 'Con deuda' },
  { id: 'al_dia', etiqueta: 'Al día' },
]

function clase(c) {
  if (c.vencidas > 0) return 'mora'
  if (c.pendientes > 0) return 'deben'
  return 'al_dia'
}

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [deudas, setDeudas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null)

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true)
    setError(null)
    try {
      const [c, d] = await Promise.all([listarClientes(), listarDeudas()])
      setClientes(c)
      setDeudas(d)
      return c
    } catch (fallo) {
      setError(mensajeDeError(fallo))
      return null
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const resumen = useMemo(
    () => ({
      total: clientes.length,
      enMora: clientes.filter((c) => c.vencidas > 0).length,
      debido: clientes.reduce((t, c) => t + Number(c.debe), 0),
    }),
    [clientes],
  )

  const visibles = useMemo(() => {
    let lista = filtro === 'todos' ? clientes : clientes.filter((c) => clase(c) === filtro)

    const q = busqueda.trim()
    if (q) {
      const porNombre = q.toLowerCase()
      const porCedula = normalizarCedula(q)
      lista = lista.filter(
        (c) =>
          c.full_name.toLowerCase().includes(porNombre) ||
          (porCedula.length >= 2 && c.cedula.includes(porCedula)) ||
          (c.phone ?? '').includes(q.replace(/\D/g, '')),
      )
    }
    return lista
  }, [clientes, filtro, busqueda])

  const conteos = useMemo(() => {
    const c = { todos: clientes.length, mora: 0, deben: 0, al_dia: 0 }
    for (const x of clientes) c[clase(x)] += 1
    return c
  }, [clientes])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">Tus clientes</p>
            <p className="text-3xl font-bold text-slate-900">{resumen.total}</p>
          </div>
          {resumen.enMora > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1
                             text-xs font-semibold text-red-700 ring-1 ring-red-200">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {resumen.enMora} en mora
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Te deben {formatearMonto(resumen.debido)} entre todos
        </p>
      </section>

      {clientes.length > 4 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o teléfono"
            aria-label="Buscar clientes"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-10 pl-9 text-base
                       text-slate-900 placeholder:text-slate-400 focus:border-marca-500
                       focus:ring-2 focus:ring-marca-100 focus:outline-none"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400
                         hover:bg-slate-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTROS.map(({ id, etiqueta }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltro(id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filtro === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {etiqueta} {conteos[id] > 0 && <span className="opacity-60">{conteos[id]}</span>}
          </button>
        ))}
      </div>

      {error && (
        <Alerta>
          {error}
          <button type="button" onClick={() => cargar()} className="ml-2 font-semibold underline">
            Reintentar
          </button>
        </Alerta>
      )}

      {cargando ? (
        <Cargando texto="Cargando tus clientes…" />
      ) : visibles.length === 0 ? (
        <Vacio
          Icono={busqueda ? Search : Users}
          titulo={
            busqueda
              ? 'Ningún cliente con esos datos'
              : clientes.length === 0
                ? 'Todavía no tienes clientes'
                : 'Nadie en este filtro'
          }
          texto={
            busqueda
              ? 'Prueba con otra parte del nombre, la cédula o el teléfono.'
              : clientes.length === 0
                ? 'Cuando registres tu primer fiado, el cliente aparece aquí.'
                : 'Prueba con otro filtro.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {visibles.map((c) => {
            const enMora = c.vencidas > 0
            return (
              <li key={c.debtor_id}>
                <button
                  type="button"
                  onClick={() => setAbierto(c)}
                  className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200
                             hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-words text-slate-900">{c.full_name}</p>
                      <p className="text-xs text-slate-500">{formatearCedula(c.cedula)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-bold ${enMora ? 'text-red-600' : 'text-slate-900'}`}>
                        {formatearMonto(c.debe)}
                      </p>
                      {c.pendientes > 0 && (
                        <p className="text-xs text-slate-400">
                          {c.pendientes} {c.pendientes === 1 ? 'fiado' : 'fiados'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {enMora && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5
                                       font-medium text-red-700">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        {c.vencidas} vencido{c.vencidas === 1 ? '' : 's'}
                      </span>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" aria-hidden="true" />
                        {formatearTelefono(c.phone)}
                      </span>
                    )}
                    {c.address && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{c.address}</span>
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <FichaCliente
        cliente={abierto}
        deudas={deudas}
        alCerrar={() => setAbierto(null)}
        alGuardar={async () => {
          const lista = await cargar({ silencioso: true })
          setAbierto((a) => (a ? (lista?.find((c) => c.debtor_id === a.debtor_id) ?? null) : null))
        }}
      />
    </div>
  )
}

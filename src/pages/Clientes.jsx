import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, MapPin, Phone, Search, Users, X } from 'lucide-react'
import { useListaPaginada } from '../hooks/useListaPaginada'
import { listarClientes, listarDeudas, obtenerResumenClientes } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearCedula, formatearMonto, formatearTelefono } from '../lib/formato'
import { Alerta, Boton, Cargando, Vacio } from '../components/UI'
import FichaCliente from '../components/FichaCliente'

const FILTROS = [
  { id: null, etiqueta: 'Todos', conteo: 'total' },
  { id: 'mora', etiqueta: 'En mora', conteo: 'en_mora' },
  { id: 'deben', etiqueta: 'Con deuda', conteo: 'con_deuda' },
  { id: 'al_dia', etiqueta: 'Al día', conteo: 'al_dia' },
]

export default function Clientes() {
  const [filtro, setFiltro] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [resumen, setResumen] = useState(null)
  const [errorResumen, setErrorResumen] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [deudasDelAbierto, setDeudasDelAbierto] = useState([])

  const cargar = useCallback(
    ({ filtro: f, buscar, limite, desde }) => listarClientes({ filtro: f, buscar, limite, desde }),
    [],
  )
  const lista = useListaPaginada(cargar, { filtro, buscar: busqueda })

  const cargarResumen = useCallback(async () => {
    setErrorResumen(null)
    try {
      setResumen(await obtenerResumenClientes())
    } catch (fallo) {
      setErrorResumen(mensajeDeError(fallo))
    }
  }, [])

  useEffect(() => {
    cargarResumen()
  }, [cargarResumen])

  // Los fiados del cliente se piden al abrir su ficha, no antes: traer los de
  // todo el comercio para mostrar los de uno era desperdicio puro.
  const abrirFicha = useCallback(async (cliente) => {
    setAbierto(cliente)
    setDeudasDelAbierto([])
    try {
      setDeudasDelAbierto(await listarDeudas({ buscar: cliente.cedula, limite: 200 }))
    } catch {
      setDeudasDelAbierto([])
    }
  }, [])

  async function refrescar() {
    await Promise.all([lista.recargar(), cargarResumen()])
    if (abierto) {
      const frescos = await listarClientes({ buscar: abierto.cedula, limite: 5 })
      setAbierto(frescos.find((c) => c.debtor_id === abierto.debtor_id) ?? null)
    }
  }

  const sinNada = lista.items.length === 0 && !lista.cargando

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">Tus clientes</p>
            <p className="text-3xl font-bold text-slate-900">{resumen?.total ?? 0}</p>
          </div>
          {(resumen?.en_mora ?? 0) > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1
                             text-xs font-semibold text-red-700 ring-1 ring-red-200">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {resumen.en_mora} en mora
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Te deben {formatearMonto(resumen?.debido ?? 0)} entre todos
        </p>
      </section>

      {errorResumen && <Alerta>{errorResumen}</Alerta>}

      {(resumen?.total ?? 0) > 4 && (
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
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTROS.map(({ id, etiqueta, conteo }) => (
          <button
            key={etiqueta}
            type="button"
            onClick={() => setFiltro(id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filtro === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {etiqueta} {resumen?.[conteo] > 0 && <span className="opacity-60">{resumen[conteo]}</span>}
          </button>
        ))}
      </div>

      {lista.error && (
        <Alerta>
          {lista.error}
          <button type="button" onClick={refrescar} className="ml-2 font-semibold underline">
            Reintentar
          </button>
        </Alerta>
      )}

      {lista.cargando ? (
        <Cargando texto="Cargando tus clientes…" />
      ) : sinNada ? (
        <Vacio
          Icono={busqueda ? Search : Users}
          titulo={
            busqueda
              ? 'Ningún cliente con esos datos'
              : (resumen?.total ?? 0) === 0
                ? 'Todavía no tienes clientes'
                : 'Nadie en este filtro'
          }
          texto={
            busqueda
              ? 'Prueba con otra parte del nombre, la cédula o el teléfono.'
              : (resumen?.total ?? 0) === 0
                ? 'Cuando registres tu primer fiado, el cliente aparece aquí.'
                : 'Prueba con otro filtro.'
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {lista.items.map((c) => {
              const enMora = c.vencidas > 0
              return (
                <li key={c.debtor_id}>
                  <button
                    type="button"
                    onClick={() => abrirFicha(c)}
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

          {lista.hayMas && (
            <Boton variante="secundario" onClick={lista.cargarMas} cargando={lista.cargandoMas}>
              <ChevronDown className="size-5" aria-hidden="true" />
              {lista.cargandoMas ? 'Cargando…' : 'Ver más clientes'}
            </Boton>
          )}
        </>
      )}

      <FichaCliente
        cliente={abierto}
        deudas={deudasDelAbierto}
        alCerrar={() => setAbierto(null)}
        alGuardar={refrescar}
      />
    </div>
  )
}

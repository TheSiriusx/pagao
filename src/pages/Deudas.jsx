import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Plus, RefreshCw, Search, Wallet, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useListaPaginada } from '../hooks/useListaPaginada'
import { borrarDeuda, listarDeudas, marcarReclamo, obtenerResumen } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearMonto } from '../lib/formato'
import { abrirWhatsApp } from '../lib/whatsapp'
import { Alerta, Boton, Cargando, Vacio } from '../components/UI'
import TarjetaDeuda from '../components/TarjetaDeuda'
import FormularioDeuda from '../components/FormularioDeuda'
import FormularioAbono from '../components/FormularioAbono'
import FormularioTelefono from '../components/FormularioTelefono'

const FILTROS = [
  { id: null, etiqueta: 'Todas', conteo: 'n_todas' },
  { id: 'por_vencer', etiqueta: 'Por vencer', conteo: 'n_por_vencer' },
  { id: 'vencida', etiqueta: 'Vencidas', conteo: 'n_vencida' },
  { id: 'reclamo', etiqueta: 'En reclamo', conteo: 'n_reclamo' },
  { id: 'pagada', etiqueta: 'Pagadas', conteo: 'n_pagada' },
]

export default function Deudas() {
  const { comercio } = useAuth()

  const [filtro, setFiltro] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [resumen, setResumen] = useState(null)
  const [errorResumen, setErrorResumen] = useState(null)

  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [abonando, setAbonando] = useState(null)
  const [pidiendoTelefono, setPidiendoTelefono] = useState(null)
  const [aviso, setAviso] = useState(null)

  const cargar = useCallback(
    ({ filtro: clase, buscar, limite, desde }) => listarDeudas({ clase, buscar, limite, desde }),
    [],
  )
  const lista = useListaPaginada(cargar, { filtro, buscar: busqueda })

  // Los totales se piden aparte y siempre completos: sumarlos sobre la página
  // visible daría un número equivocado en cuanto haya más de una.
  const cargarResumen = useCallback(async () => {
    setErrorResumen(null)
    try {
      setResumen(await obtenerResumen())
    } catch (fallo) {
      setErrorResumen(mensajeDeError(fallo))
    }
  }, [])

  useEffect(() => {
    cargarResumen()
  }, [cargarResumen])

  async function refrescar() {
    await Promise.all([lista.recargar(), cargarResumen()])
  }

  function cobrar(deuda) {
    if (abrirWhatsApp({ deuda, comercio })) return
    setPidiendoTelefono({ ...deuda, cobrarDespues: true })
  }

  async function trasGuardarTelefono(deuda) {
    await refrescar()
    if (!deuda?.cobrarDespues) return
    const frescas = await listarDeudas({ buscar: deuda.cedula, limite: 5 })
    const fresca = frescas.find((d) => d.id === deuda.id)
    if (fresca) abrirWhatsApp({ deuda: fresca, comercio })
  }

  async function accion(fn) {
    try {
      await fn()
      await refrescar()
    } catch (fallo) {
      setAviso(mensajeDeError(fallo))
    }
  }

  const sinNada = lista.items.length === 0 && !lista.cargando

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-noche p-5 text-white">
        <p className="text-sm text-slate-300">Te deben</p>
        <p className="text-3xl font-bold">{formatearMonto(resumen?.por_cobrar ?? 0)}</p>
        <p className="mt-0.5 text-sm text-slate-400">
          {resumen?.clientes ?? 0} {resumen?.clientes === 1 ? 'cliente' : 'clientes'}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div>
            <p className="text-xs text-slate-400">Vencido</p>
            <p className={`font-semibold ${resumen?.vencido > 0 ? 'text-red-400' : 'text-slate-300'}`}>
              {formatearMonto(resumen?.vencido ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Cobrado este mes</p>
            <p className="font-semibold text-marca-500">{formatearMonto(resumen?.cobrado_mes ?? 0)}</p>
          </div>
        </div>
      </section>

      {errorResumen && <Alerta>{errorResumen}</Alerta>}

      <Boton onClick={() => setCreando(true)}>
        <Plus className="size-5" aria-hidden="true" />
        Nuevo fiado
      </Boton>

      {(resumen?.n_todas ?? 0) > 4 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o cédula"
            aria-label="Buscar fiados"
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

      {aviso && <Alerta tono="info">{aviso}</Alerta>}

      {lista.error && (
        <Alerta>
          {lista.error}
          <button type="button" onClick={refrescar} className="ml-2 font-semibold underline">
            Reintentar
          </button>
        </Alerta>
      )}

      {lista.cargando ? (
        <Cargando texto="Cargando tus fiados…" />
      ) : sinNada ? (
        <Vacio
          Icono={busqueda ? Search : Wallet}
          titulo={
            busqueda
              ? 'Ningún cliente con ese nombre'
              : (resumen?.n_todas ?? 0) === 0
                ? 'Todavía no tienes fiados'
                : 'Nada en este filtro'
          }
          texto={
            busqueda
              ? 'Prueba con otra parte del nombre o con la cédula.'
              : (resumen?.n_todas ?? 0) === 0
                ? 'Registra el primero y empieza a llevar la cuenta de quién te debe.'
                : 'Prueba con otro filtro.'
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {lista.items.map((deuda) => (
              <TarjetaDeuda
                key={deuda.id}
                deuda={deuda}
                alCobrar={cobrar}
                alAbonar={setAbonando}
                alEditar={setEditando}
                alPonerTelefono={setPidiendoTelefono}
                alBorrar={(d) => accion(() => borrarDeuda(d.id))}
                alReclamar={(d, activo) => accion(() => marcarReclamo(d.id, activo))}
              />
            ))}
          </ul>

          {lista.hayMas && (
            <Boton variante="secundario" onClick={lista.cargarMas} cargando={lista.cargandoMas}>
              <ChevronDown className="size-5" aria-hidden="true" />
              {lista.cargandoMas ? 'Cargando…' : 'Ver más fiados'}
            </Boton>
          )}

          <button
            type="button"
            onClick={refrescar}
            className="mx-auto flex items-center gap-1.5 py-2 text-sm text-slate-400 hover:text-slate-600"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Actualizar
          </button>
        </>
      )}

      <FormularioDeuda
        abierto={creando || Boolean(editando)}
        deuda={editando}
        alCerrar={() => {
          setCreando(false)
          setEditando(null)
        }}
        alGuardar={refrescar}
      />

      <FormularioAbono deuda={abonando} alCerrar={() => setAbonando(null)} alGuardar={refrescar} />

      <FormularioTelefono
        deuda={pidiendoTelefono}
        alCerrar={() => setPidiendoTelefono(null)}
        alGuardar={() => trasGuardarTelefono(pidiendoTelefono)}
      />
    </div>
  )
}

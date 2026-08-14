import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Search, Wallet, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { borrarDeuda, listarAbonos, listarDeudas, marcarReclamo } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearMonto, normalizarCedula } from '../lib/formato'
import { claseDeuda } from '../lib/fechas'
import { abrirWhatsApp } from '../lib/whatsapp'
import { Alerta, Boton, Cargando, Vacio } from '../components/UI'
import TarjetaDeuda from '../components/TarjetaDeuda'
import FormularioDeuda from '../components/FormularioDeuda'
import FormularioAbono from '../components/FormularioAbono'
import FormularioTelefono from '../components/FormularioTelefono'

const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'por_vencer', etiqueta: 'Por vencer' },
  { id: 'vencida', etiqueta: 'Vencidas' },
  { id: 'reclamo', etiqueta: 'En reclamo' },
  { id: 'pagada', etiqueta: 'Pagadas' },
]

const saldoDe = (d) => Math.max(Number(d.amount) - Number(d.abonado ?? 0), 0)

export default function Deudas() {
  const { comercio } = useAuth()

  const [deudas, setDeudas] = useState([])
  const [abonos, setAbonos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todas')
  const [busqueda, setBusqueda] = useState('')

  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [abonando, setAbonando] = useState(null)
  const [pidiendoTelefono, setPidiendoTelefono] = useState(null)
  const [aviso, setAviso] = useState(null)

  // Si el usuario llegó al teléfono desde el botón de cobro, al guardarlo se
  // abre WhatsApp solo: era lo que quería hacer desde el principio.
  const cobrarTrasGuardar = useRef(false)

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true)
    setError(null)
    try {
      const [d, a] = await Promise.all([listarDeudas(), listarAbonos()])
      setDeudas(d)
      setAbonos(a)
      return d
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

  // Se calcula sobre la lista completa, no sobre la filtrada: el resumen
  // siempre habla de todo el negocio.
  const resumen = useMemo(() => {
    const pendientes = deudas.filter((d) => d.status !== 'paid')
    const vencidas = pendientes.filter((d) => claseDeuda(d) === 'vencida')

    // "Cobrado este mes" sale de los abonos, no de las deudas saldadas: un
    // abono de $10 en una deuda a medias también es plata que entró.
    const ahora = new Date()
    const cobradoMes = abonos
      .filter((a) => {
        const p = new Date(a.paid_at)
        return p.getFullYear() === ahora.getFullYear() && p.getMonth() === ahora.getMonth()
      })
      .reduce((t, a) => t + Number(a.amount), 0)

    return {
      // Suma de SALDOS, no de montos: lo que abonaron ya no te lo deben.
      porCobrar: pendientes.reduce((t, d) => t + saldoDe(d), 0),
      vencido: vencidas.reduce((t, d) => t + saldoDe(d), 0),
      cobradoMes,
      clientes: new Set(pendientes.map((d) => d.debtor_id)).size,
    }
  }, [deudas, abonos])

  const visibles = useMemo(() => {
    let lista = filtro === 'todas' ? deudas : deudas.filter((d) => claseDeuda(d) === filtro)

    const q = busqueda.trim()
    if (q) {
      // Se busca por nombre y por cédula a la vez: el comerciante a veces
      // recuerda una y a veces la otra.
      const porNombre = q.toLowerCase()
      const porCedula = normalizarCedula(q)
      lista = lista.filter(
        (d) =>
          d.full_name.toLowerCase().includes(porNombre) ||
          (porCedula.length >= 2 && d.cedula.includes(porCedula)),
      )
    }
    return lista
  }, [deudas, filtro, busqueda])

  const conteos = useMemo(() => {
    const c = { todas: deudas.length, por_vencer: 0, vencida: 0, reclamo: 0, pagada: 0 }
    for (const d of deudas) c[claseDeuda(d)] += 1
    return c
  }, [deudas])

  function cobrar(deuda) {
    if (abrirWhatsApp({ deuda, comercio })) return
    // Sin teléfono no hay a quién escribirle: se pide y después se cobra.
    cobrarTrasGuardar.current = true
    setPidiendoTelefono(deuda)
  }

  async function trasGuardarTelefono(deuda) {
    const lista = await cargar({ silencioso: true })
    if (!cobrarTrasGuardar.current) return
    cobrarTrasGuardar.current = false
    const fresca = lista?.find((d) => d.id === deuda.id)
    if (fresca) abrirWhatsApp({ deuda: fresca, comercio })
  }

  async function accion(fn) {
    setError(null)
    try {
      await fn()
      await cargar({ silencioso: true })
    } catch (fallo) {
      setError(mensajeDeError(fallo))
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-noche p-5 text-white">
        <p className="text-sm text-slate-300">Te deben</p>
        <p className="text-3xl font-bold">{formatearMonto(resumen.porCobrar)}</p>
        <p className="mt-0.5 text-sm text-slate-400">
          {resumen.clientes} {resumen.clientes === 1 ? 'cliente' : 'clientes'}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div>
            <p className="text-xs text-slate-400">Vencido</p>
            <p className={`font-semibold ${resumen.vencido > 0 ? 'text-red-400' : 'text-slate-300'}`}>
              {formatearMonto(resumen.vencido)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Cobrado este mes</p>
            <p className="font-semibold text-marca-500">{formatearMonto(resumen.cobradoMes)}</p>
          </div>
        </div>
      </section>

      <Boton onClick={() => setCreando(true)}>
        <Plus className="size-5" aria-hidden="true" />
        Nuevo fiado
      </Boton>

      {deudas.length > 4 && (
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
              filtro === id
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {etiqueta} {conteos[id] > 0 && <span className="opacity-60">{conteos[id]}</span>}
          </button>
        ))}
      </div>

      {aviso && <Alerta tono="info">{aviso}</Alerta>}

      {error && (
        <Alerta>
          {error}
          <button type="button" onClick={() => cargar()} className="ml-2 font-semibold underline">
            Reintentar
          </button>
        </Alerta>
      )}

      {cargando ? (
        <Cargando texto="Cargando tus fiados…" />
      ) : visibles.length === 0 ? (
        <Vacio
          Icono={busqueda ? Search : Wallet}
          titulo={
            busqueda
              ? 'Ningún cliente con ese nombre'
              : deudas.length === 0
                ? 'Todavía no tienes fiados'
                : 'Nada en este filtro'
          }
          texto={
            busqueda
              ? 'Prueba con otra parte del nombre o con la cédula.'
              : deudas.length === 0
                ? 'Registra el primero y empieza a llevar la cuenta de quién te debe.'
                : 'Prueba con otro filtro.'
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {visibles.map((deuda) => (
              <TarjetaDeuda
                key={deuda.id}
                deuda={deuda}
                alCobrar={cobrar}
                alAbonar={setAbonando}
                alEditar={setEditando}
                alPonerTelefono={(d) => {
                  cobrarTrasGuardar.current = false
                  setPidiendoTelefono(d)
                }}
                alBorrar={(d) => accion(() => borrarDeuda(d.id))}
                alReclamar={(d, activo) => accion(() => marcarReclamo(d.id, activo))}
              />
            ))}
          </ul>

          <button
            type="button"
            onClick={() => cargar()}
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
        alGuardar={() => cargar({ silencioso: true })}
      />

      <FormularioAbono
        deuda={abonando}
        abonos={abonos}
        alCerrar={() => setAbonando(null)}
        alGuardar={async () => {
          const lista = await cargar({ silencioso: true })
          // La hoja sigue abierta tras borrar un abono: hay que refrescar la
          // deuda que muestra, o seguiría enseñando el saldo viejo.
          setAbonando((actual) => (actual ? (lista?.find((d) => d.id === actual.id) ?? null) : null))
        }}
      />

      <FormularioTelefono
        deuda={pidiendoTelefono}
        alCerrar={() => {
          cobrarTrasGuardar.current = false
          setPidiendoTelefono(null)
        }}
        alGuardar={() => trasGuardarTelefono(pidiendoTelefono)}
      />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Wallet } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { listarAbonos, listarDeudas } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearMonto } from '../lib/formato'
import { claseDeuda } from '../lib/fechas'
import { abrirWhatsApp } from '../lib/whatsapp'
import { Alerta, Boton, Cargando, Vacio } from '../components/UI'
import TarjetaDeuda from '../components/TarjetaDeuda'
import FormularioDeuda from '../components/FormularioDeuda'
import FormularioAbono from '../components/FormularioAbono'

const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'por_vencer', etiqueta: 'Por vencer' },
  { id: 'vencida', etiqueta: 'Vencidas' },
  { id: 'pagada', etiqueta: 'Pagadas' },
]

/** Lo que falta por cobrar de una deuda. */
const saldoDe = (d) => Math.max(Number(d.amount) - Number(d.abonado ?? 0), 0)

export default function Deudas() {
  const { comercio } = useAuth()

  const [deudas, setDeudas] = useState([])
  const [abonos, setAbonos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todas')
  const [formAbierto, setFormAbierto] = useState(false)
  const [abonando, setAbonando] = useState(null)
  const [aviso, setAviso] = useState(null)

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true)
    setError(null)
    try {
      const [d, a] = await Promise.all([listarDeudas(), listarAbonos()])
      setDeudas(d)
      setAbonos(a)
    } catch (fallo) {
      setError(mensajeDeError(fallo))
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

  const visibles = useMemo(
    () => (filtro === 'todas' ? deudas : deudas.filter((d) => claseDeuda(d) === filtro)),
    [deudas, filtro],
  )

  const conteos = useMemo(() => {
    const c = { todas: deudas.length, por_vencer: 0, vencida: 0, pagada: 0 }
    for (const d of deudas) c[claseDeuda(d)] += 1
    return c
  }, [deudas])

  function cobrar(deuda) {
    if (!abrirWhatsApp({ deuda, comercio })) {
      setAviso('Ese cliente no tiene teléfono registrado. Agrégalo al crear el próximo fiado.')
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

      <Boton onClick={() => setFormAbierto(true)}>
        <Plus className="size-5" aria-hidden="true" />
        Nuevo fiado
      </Boton>

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
          Icono={Wallet}
          titulo={deudas.length === 0 ? 'Todavía no tienes fiados' : 'Nada en este filtro'}
          texto={
            deudas.length === 0
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
        abierto={formAbierto}
        alCerrar={() => setFormAbierto(false)}
        alGuardar={() => cargar({ silencioso: true })}
      />

      <FormularioAbono
        deuda={abonando}
        alCerrar={() => setAbonando(null)}
        alGuardar={() => cargar({ silencioso: true })}
      />
    </div>
  )
}

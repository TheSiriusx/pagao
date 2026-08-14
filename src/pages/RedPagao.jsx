import { useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { consultarScore } from '../lib/datos'
import { codigoDeError, mensajeDeError } from '../lib/errores'
import { cedulaValida, formatearCedula } from '../lib/formato'
import { Alerta, Boton, Campo, Vacio } from '../components/UI'
import { TarjetaScore } from '../components/Semaforo'
import ModalPaywall from '../components/ModalPaywall'

export default function RedPagao() {
  const { comercio, recargarComercio } = useAuth()

  const [cedula, setCedula] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)
  const [paywall, setPaywall] = useState(false)

  const esPro = comercio.plan !== 'free'
  const consultasGastadas = comercio.free_queries_used ?? 0

  async function buscar(evento) {
    evento.preventDefault()
    setError(null)
    setResultado(null)

    if (!cedulaValida(cedula)) {
      setError('Escribe la cédula como V12345678 o E12345678.')
      return
    }

    setConsultando(true)
    try {
      const fila = await consultarScore(cedula)
      setResultado({ ...fila, cedula })
      // El servidor pudo haber gastado la consulta gratis: hay que releer el
      // contador para que Ajustes y este mismo aviso digan la verdad.
      await recargarComercio()
    } catch (fallo) {
      // El límite lo decide get_debtor_score en el servidor. Aquí solo se
      // reacciona al código que devolvió.
      if (codigoDeError(fallo) === 'FREE_LIMIT') {
        setPaywall(true)
      } else {
        setError(mensajeDeError(fallo))
      }
    } finally {
      setConsultando(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-start gap-3">
          <span className="rounded-xl bg-marca-50 p-2 text-marca-600">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">Red Pagao</h1>
            <p className="text-sm text-slate-500">
              Revisa cómo paga un cliente antes de fiarle.
            </p>
          </div>
        </div>

        <form onSubmit={buscar} noValidate>
          <Campo
            id="buscarCedula"
            etiqueta="Cédula del cliente"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="V12345678"
            value={cedula}
            onChange={(e) => {
              setCedula(e.target.value)
              setError(null)
            }}
            error={error}
          />

          <Boton type="submit" cargando={consultando} className="mt-4">
            <Search className="size-5" aria-hidden="true" />
            {consultando ? 'Consultando…' : 'Consultar'}
          </Boton>
        </form>

        {!esPro && (
          <p className="mt-3 text-center text-xs text-slate-400">
            {consultasGastadas >= 1
              ? 'Ya usaste tu consulta gratis.'
              : 'Te queda 1 consulta gratis.'}
          </p>
        )}
      </section>

      {resultado ? (
        <section className="space-y-3">
          <p className="text-center text-sm text-slate-500">{formatearCedula(resultado.cedula)}</p>

          <TarjetaScore
            banda={resultado.band}
            score={resultado.score}
            deudasActivas={resultado.active_debts}
          />

          <Alerta tono="info">
            Esto es todo lo que la red comparte: el puntaje, el color y en cuántos negocios debe.
            Nunca los nombres de los comercios ni los montos.
          </Alerta>
        </section>
      ) : (
        <Vacio
          Icono={Search}
          titulo="Consulta antes de fiar"
          texto="Escribe la cédula y te decimos si paga a tiempo, según lo que reportan otros comercios."
        />
      )}

      <ModalPaywall abierto={paywall} alCerrar={() => setPaywall(false)} />
    </div>
  )
}

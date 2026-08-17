import { useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { consultarScore } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { cedulaValida, formatearCedula } from '../lib/formato'
import { Alerta, Boton, Campo, Vacio } from '../components/UI'
import { TarjetaScore } from '../components/Semaforo'

export default function RedPagao() {
  const [cedula, setCedula] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)

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
    } catch (fallo) {
      setError(mensajeDeError(fallo))
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
      </section>

      {resultado ? (
        <section className="space-y-3">
          <TarjetaScore
            banda={resultado.band}
            score={resultado.score}
            deudasActivas={resultado.active_debts}
            nombre={resultado.full_name}
            cedula={formatearCedula(resultado.cedula)}
            totalDeuda={resultado.total_debt}
          />

          <Alerta tono="info">
            {resultado.active_debts > 0 && resultado.total_debt == null
              ? 'El total adeudado aparece a partir de 3 tiendas. Con menos, esa cifra revelaría cuánto le fió un comercio en concreto.'
              : 'La red nunca dice en qué comercios debe ni cuánto le debe a cada uno.'}
          </Alerta>
        </section>
      ) : (
        <Vacio
          Icono={Search}
          titulo="Consulta antes de fiar"
          texto="Escribe la cédula y te decimos si paga a tiempo, según lo que reportan otros comercios."
        />
      )}
    </div>
  )
}

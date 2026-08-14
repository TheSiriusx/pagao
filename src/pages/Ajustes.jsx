import { useState } from 'react'
import { Check, LogOut, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { actualizarComercio } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearTelefono, normalizarTelefono } from '../lib/formato'
import { BANCOS } from '../lib/bancos'
import { Alerta, Boton, Campo } from '../components/UI'

export default function Ajustes() {
  const { comercio, usuario, recargarComercio, salir } = useAuth()

  const [negocio, setNegocio] = useState(comercio.business_name ?? '')
  const [dueno, setDueno] = useState(comercio.owner_name ?? '')
  const [telefono, setTelefono] = useState(formatearTelefono(comercio.phone))
  const [banco, setBanco] = useState(comercio.bank_name ?? '')
  const [telefonoPago, setTelefonoPago] = useState(formatearTelefono(comercio.bank_phone))
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardado, setGuardado] = useState(false)

  const esPro = comercio.plan !== 'free'
  const vence = comercio.plan_expires_at ? new Date(comercio.plan_expires_at) : null
  const vencido = esPro && vence && vence < new Date()

  async function guardar(evento) {
    evento.preventDefault()
    setErrorGeneral(null)
    setGuardado(false)

    const nuevos = {}
    if (negocio.trim().length < 2) nuevos.negocio = 'Escribe el nombre de tu negocio.'
    if (!normalizarTelefono(telefono)) nuevos.telefono = 'Escribe un celular venezolano válido.'
    if (telefonoPago.trim() && !normalizarTelefono(telefonoPago)) {
      nuevos.telefonoPago = 'Ese número no parece un celular venezolano.'
    }
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setGuardando(true)
    try {
      await actualizarComercio(comercio.id, {
        business_name: negocio.trim(),
        owner_name: dueno.trim() || null,
        phone: normalizarTelefono(telefono),
        bank_name: banco || null,
        bank_phone: normalizarTelefono(telefonoPago),
      })
      await recargarComercio()
      setGuardado(true)
    } catch (fallo) {
      setErrorGeneral(
        fallo?.code === '23505'
          ? 'Ese teléfono ya está registrado con otra cuenta.'
          : mensajeDeError(fallo),
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <section
        className={`rounded-2xl p-5 ring-1 ${
          esPro && !vencido ? 'bg-marca-50 ring-marca-100' : 'bg-white shadow-sm ring-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">Tu plan</p>
            <p className="flex items-center gap-1.5 text-xl font-bold text-slate-900">
              {esPro && !vencido && <Zap className="size-5 text-marca-600" aria-hidden="true" />}
              {vencido ? 'Pro vencido' : esPro ? 'Pro' : 'Gratis'}
            </p>
          </div>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          {vencido ? (
            <>Se venció el {vence.toLocaleDateString('es-VE')}. Cuenta como gratis.</>
          ) : esPro ? (
            <>
              Consultas ilimitadas
              {vence && <> hasta el {vence.toLocaleDateString('es-VE')}</>}.
            </>
          ) : (
            <>
              Fiados ilimitados y <strong>1 consulta</strong> a la Red Pagao. Llevas{' '}
              {comercio.free_queries_used ?? 0} usada
              {(comercio.free_queries_used ?? 0) === 1 ? '' : 's'}.
            </>
          )}
        </p>

        {(!esPro || vencido) && (
          <Alerta tono="info" className="mt-4">
            Los pagos todavía no están conectados. Para probar el Pro, cámbialo a mano en Supabase →
            Table Editor → <code>merchants</code> → tu fila → <code>plan</code> = <code>pro</code>.
            El plan no se puede cambiar desde la app a propósito.
          </Alerta>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-bold text-slate-900">Datos del negocio</h2>

        <form onSubmit={guardar} noValidate className="space-y-4">
          <Campo
            id="ajNegocio"
            etiqueta="Nombre del negocio"
            value={negocio}
            onChange={(e) => setNegocio(e.target.value)}
            error={errores.negocio}
          />

          <Campo
            id="ajDueno"
            etiqueta="Tu nombre"
            value={dueno}
            onChange={(e) => setDueno(e.target.value)}
            ayuda="Opcional."
          />

          <Campo
            id="ajTelefono"
            etiqueta="Tu celular"
            type="tel"
            inputMode="numeric"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            error={errores.telefono}
          />

          <Campo id="ajBanco" etiqueta="Banco del Pago Móvil">
            <select
              id="ajBanco"
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base
                         text-slate-900 focus:border-marca-500 focus:ring-2 focus:ring-marca-100
                         focus:outline-none"
            >
              <option value="">Sin Pago Móvil</option>
              {BANCOS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="ajTelefonoPago"
            etiqueta="Teléfono del Pago Móvil"
            type="tel"
            inputMode="numeric"
            value={telefonoPago}
            onChange={(e) => setTelefonoPago(e.target.value)}
            ayuda="Es el que va en el mensaje de cobro por WhatsApp."
            error={errores.telefonoPago}
          />

          {errorGeneral && <Alerta>{errorGeneral}</Alerta>}
          {guardado && (
            <Alerta tono="exito">
              <span className="inline-flex items-center gap-1">
                <Check className="size-4" aria-hidden="true" /> Guardado.
              </span>
            </Alerta>
          )}

          <Boton type="submit" cargando={guardando} variante="secundario">
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm text-slate-500">Entraste con</p>
        <p className="break-words text-slate-900">{usuario?.email}</p>

        <Boton variante="fantasma" onClick={salir} className="mt-4">
          <LogOut className="size-5" aria-hidden="true" />
          Cerrar sesión
        </Boton>
      </section>
    </div>
  )
}

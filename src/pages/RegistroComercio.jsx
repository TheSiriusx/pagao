import { useState } from 'react'
import { LogOut, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { mensajeDeError } from '../lib/errores'
import { normalizarTelefono } from '../lib/formato'
import { BANCOS } from '../lib/bancos'
import { Alerta, Boton, Campo, Logo } from '../components/UI'

export default function RegistroComercio() {
  const { usuario, recargarComercio, salir } = useAuth()

  const [negocio, setNegocio] = useState('')
  const [dueno, setDueno] = useState('')
  const [telefono, setTelefono] = useState('')
  const [banco, setBanco] = useState('')
  const [telefonoPago, setTelefonoPago] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)

  function validar() {
    const nuevos = {}

    if (negocio.trim().length < 2) {
      nuevos.negocio = 'Escribe el nombre de tu negocio.'
    }
    // merchants.phone es NOT NULL: entrando por correo, el teléfono ya no
    // viene de la sesión, así que hay que pedirlo aquí.
    if (!normalizarTelefono(telefono)) {
      nuevos.telefono = 'Escribe tu celular, como 0412-1234567.'
    }
    if (telefonoPago.trim() && !normalizarTelefono(telefonoPago)) {
      nuevos.telefonoPago = 'Ese número no parece un celular venezolano.'
    }

    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  async function guardar(evento) {
    evento.preventDefault()
    setErrorGeneral(null)
    if (!validar()) return

    setGuardando(true)

    const principal = normalizarTelefono(telefono)
    // Si eligió banco y dejó el teléfono de pago vacío, es el mismo de arriba.
    const pago = normalizarTelefono(telefonoPago) ?? (banco ? principal : null)

    // id = auth.uid() es lo que exige la política RLS merchants_self: un
    // usuario solo puede crear SU propia ficha, nunca la de otro.
    const { error } = await supabase.from('merchants').insert({
      id: usuario.id,
      phone: principal,
      business_name: negocio.trim(),
      owner_name: dueno.trim() || null,
      bank_name: banco || null,
      bank_phone: pago,
    })

    if (error) {
      setGuardando(false)
      setErrorGeneral(
        error.code === '23505'
          ? 'Ese teléfono ya está registrado con otra cuenta.'
          : mensajeDeError(error),
      )
      return
    }

    // No se apaga "guardando": recargarComercio hace que App cambie de
    // pantalla, y dejar el botón activo invita a un segundo insert.
    await recargarComercio()
  }

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Logo />
          <button
            type="button"
            onClick={salir}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </button>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-start gap-3">
            <span className="rounded-xl bg-marca-50 p-2 text-marca-600">
              <Store className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">Registra tu negocio</h1>
              <p className="text-sm text-slate-500">Es una sola vez. Después vas directo a tus fiados.</p>
            </div>
          </div>

          <form onSubmit={guardar} noValidate className="space-y-4">
            <Campo
              id="negocio"
              etiqueta="Nombre del negocio"
              placeholder="Bodega La Esquina"
              autoComplete="organization"
              value={negocio}
              onChange={(e) => setNegocio(e.target.value)}
              error={errores.negocio}
            />

            <Campo
              id="dueno"
              etiqueta="Tu nombre"
              placeholder="María Pérez"
              autoComplete="name"
              value={dueno}
              onChange={(e) => setDueno(e.target.value)}
              ayuda="Opcional."
            />

            <Campo
              id="telefono"
              etiqueta="Tu celular"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="0412-1234567"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              error={errores.telefono}
            />

            <Campo id="banco" etiqueta="Banco del Pago Móvil">
              <select
                id="banco"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base
                           text-slate-900 focus:border-marca-500 focus:ring-2 focus:ring-marca-100
                           focus:outline-none"
              >
                <option value="">Sin Pago Móvil por ahora</option>
                {BANCOS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo
              id="telefonoPago"
              etiqueta="Teléfono del Pago Móvil"
              type="tel"
              inputMode="numeric"
              placeholder="0412-1234567"
              value={telefonoPago}
              onChange={(e) => setTelefonoPago(e.target.value)}
              ayuda="Si es el mismo de arriba, déjalo vacío."
              error={errores.telefonoPago}
            />

            {errorGeneral && <Alerta>{errorGeneral}</Alerta>}

            <Boton type="submit" cargando={guardando}>
              {guardando ? 'Guardando…' : 'Empezar a usar Pagao'}
            </Boton>
          </form>
        </div>

        <p className="mt-4 text-center text-xs break-words text-slate-400">
          Entraste con {usuario?.email}
        </p>
      </div>
    </div>
  )
}

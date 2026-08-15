import { useState } from 'react'
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mensajeDeError } from '../lib/errores'
import { Alerta, Boton, Campo, Logo } from '../components/UI'

/**
 * Entrada por correo y contraseña.
 *
 * Es el método definitivo de la app: se descartó el OTP por SMS porque
 * Supabase exige un proveedor (Twilio) hasta para los códigos de prueba, y
 * cada mensaje a Venezuela cuesta más que la consulta de score que se cobra.
 *
 * El teléfono del comerciante se sigue pidiendo, pero en el registro del
 * negocio: es el número de contacto, no la credencial.
 */
export default function Login() {
  const [modo, setModo] = useState('entrar') // entrar | crear
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const creando = modo === 'crear'

  function cambiarModo() {
    setModo(creando ? 'entrar' : 'crear')
    setError(null)
    setAviso(null)
  }

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)
    setAviso(null)

    const email = correo.trim().toLowerCase()

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Escribe un correo válido.')
      return
    }
    if (clave.length < 6) {
      setError('La contraseña necesita al menos 6 caracteres.')
      return
    }

    setEnviando(true)

    if (creando) {
      const { data, error: fallo } = await supabase.auth.signUp({ email, password: clave })

      if (fallo) {
        setEnviando(false)
        setError(mensajeDeError(fallo))
        return
      }

      // Sin sesión = el proyecto tiene "Confirm email" activado y Supabase
      // mandó un correo. Con la confirmación apagada se entra de una vez y
      // onAuthStateChange cambia de pantalla solo.
      if (!data.session) {
        setEnviando(false)
        setModo('entrar')
        setAviso('Te mandamos un correo para confirmar la cuenta. Ábrelo y vuelve a entrar.')
      }
      return
    }

    const { error: fallo } = await supabase.auth.signInWithPassword({ email, password: clave })

    if (fallo) {
      setEnviando(false)
      setError(mensajeDeError(fallo))
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-start gap-3">
            <span className="rounded-xl bg-marca-50 p-2 text-marca-600">
              {creando ? (
                <UserPlus className="size-5" aria-hidden="true" />
              ) : (
                <LogIn className="size-5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">
                {creando ? 'Crea tu cuenta' : 'Entra a Pagao'}
              </h1>
              <p className="text-sm text-slate-500">
                {creando
                  ? 'Con tu correo y una contraseña. Toma menos de un minuto.'
                  : 'Con el correo y la contraseña que registraste.'}
              </p>
            </div>
          </div>

          {aviso && (
            <Alerta tono="info" className="mb-4">
              {aviso}
            </Alerta>
          )}

          <form onSubmit={enviar} noValidate className="space-y-4">
            <Campo
              id="correo"
              etiqueta="Correo"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck="false"
              placeholder="maria@ejemplo.com"
              value={correo}
              onChange={(e) => {
                setCorreo(e.target.value)
                setError(null)
              }}
            />

            <Campo id="clave" etiqueta="Contraseña">
              <div className="relative">
                <input
                  id="clave"
                  type={verClave ? 'text' : 'password'}
                  autoComplete={creando ? 'new-password' : 'current-password'}
                  placeholder="Mínimo 6 caracteres"
                  value={clave}
                  onChange={(e) => {
                    setClave(e.target.value)
                    setError(null)
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pr-12 pl-3
                             text-base text-slate-900 placeholder:text-slate-400
                             focus:border-marca-500 focus:ring-2 focus:ring-marca-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400
                             hover:text-slate-600"
                >
                  {verClave ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Campo>

            {error && <Alerta>{error}</Alerta>}

            <Boton type="submit" cargando={enviando}>
              {enviando ? 'Un momento…' : creando ? 'Crear cuenta' : 'Entrar'}
            </Boton>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            {creando ? '¿Ya tienes cuenta?' : '¿Todavía no tienes cuenta?'}{' '}
            <button type="button" onClick={cambiarModo} className="font-semibold text-marca-600">
              {creando ? 'Entra' : 'Créala'}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Tus deudas solo las ves tú. El score es lo único que se comparte.
        </p>
      </div>
    </div>
  )
}

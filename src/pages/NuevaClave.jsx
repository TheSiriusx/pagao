import { useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { mensajeDeError } from '../lib/errores'
import { Alerta, Boton, Campo, Logo } from '../components/UI'

/**
 * Contraseña nueva, después de entrar por el enlace del correo.
 *
 * Se llega aquí porque Supabase disparó el evento PASSWORD_RECOVERY: hay
 * sesión, pero es una sesión de recuperación y lo único que toca hacer con
 * ella es cambiar la clave.
 */
export default function NuevaClave() {
  const { terminarRecuperacion, salir } = useAuth()

  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  async function guardar(evento) {
    evento.preventDefault()
    setError(null)

    if (clave.length < 6) {
      setError('La contraseña necesita al menos 6 caracteres.')
      return
    }
    if (clave !== repetida) {
      setError('Las dos contraseñas no son iguales.')
      return
    }

    setGuardando(true)
    const { error: fallo } = await supabase.auth.updateUser({ password: clave })

    if (fallo) {
      setGuardando(false)
      setError(mensajeDeError(fallo))
      return
    }

    // La sesión de recuperación ya sirve como sesión normal: se sale del modo
    // recuperación y la app continúa donde corresponda.
    terminarRecuperacion()
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
              <KeyRound className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">Escribe tu contraseña nueva</h1>
              <p className="text-sm text-slate-500">Con esta vas a entrar de ahora en adelante.</p>
            </div>
          </div>

          <form onSubmit={guardar} noValidate className="space-y-4">
            <Campo id="claveNueva" etiqueta="Contraseña nueva">
              <div className="relative">
                <input
                  id="claveNueva"
                  type={verClave ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
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
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center
                             text-slate-400 hover:text-slate-600"
                >
                  {verClave ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Campo>

            <Campo
              id="claveRepetida"
              etiqueta="Repítela"
              type={verClave ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="La misma otra vez"
              value={repetida}
              onChange={(e) => {
                setRepetida(e.target.value)
                setError(null)
              }}
            />

            {error && <Alerta>{error}</Alerta>}

            <Boton type="submit" cargando={guardando}>
              {guardando ? 'Guardando…' : 'Guardar y entrar'}
            </Boton>
          </form>

          <button
            type="button"
            onClick={salir}
            className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-700"
          >
            Mejor no, salir
          </button>
        </div>
      </div>
    </div>
  )
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null)
  const [comercio, setComercio] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [cargandoComercio, setCargandoComercio] = useState(false)
  const [errorComercio, setErrorComercio] = useState(null)
  // Al entrar por el enlace del correo de recuperación hay sesión, pero lo
  // que toca es pedir la contraseña nueva, no soltar al usuario en la app.
  const [recuperando, setRecuperando] = useState(false)

  // Evita que una respuesta lenta de un usuario anterior pise a la del actual.
  const peticionActual = useRef(0)

  useEffect(() => {
    let vivo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSesion(data.session ?? null)
      setCargandoSesion(false)
    })

    // El callback de onAuthStateChange debe ser síncrono: si se hace await de
    // otra llamada a supabase adentro, el cliente se traba esperándose a sí
    // mismo. La carga del comercio va en su propio efecto, más abajo.
    const { data: sub } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      setSesion(nuevaSesion ?? null)
      setCargandoSesion(false)

      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (evento === 'SIGNED_OUT') setRecuperando(false)
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const usuario = sesion?.user ?? null
  const usuarioId = usuario?.id ?? null

  const cargarComercio = useCallback(async () => {
    if (!usuarioId) {
      setComercio(null)
      setErrorComercio(null)
      return
    }

    const idPeticion = ++peticionActual.current
    setCargandoComercio(true)
    setErrorComercio(null)

    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('id', usuarioId)
      .maybeSingle()

    if (idPeticion !== peticionActual.current) return

    if (error) {
      setErrorComercio(error)
      setComercio(null)
    } else {
      // null = usuario autenticado que todavía no registró su negocio.
      setComercio(data ?? null)
    }
    setCargandoComercio(false)
  }, [usuarioId])

  useEffect(() => {
    cargarComercio()
  }, [cargarComercio])

  const salir = useCallback(async () => {
    await supabase.auth.signOut()
    setComercio(null)

    // El service worker guarda las respuestas GET para que la lista de fiados
    // se vea sin señal. En un teléfono compartido, esa caché le mostraría los
    // clientes del dueño anterior al siguiente que entre: se borra al salir.
    if ('caches' in window) {
      try {
        await caches.delete('pagao-datos')
      } catch {
        // Si el navegador no deja borrarla, no vale la pena romper el logout.
      }
    }
  }, [])

  const valor = useMemo(
    () => ({
      sesion,
      usuario,
      comercio,
      cargandoSesion,
      cargandoComercio,
      errorComercio,
      recuperando,
      terminarRecuperacion: () => setRecuperando(false),
      recargarComercio: cargarComercio,
      salir,
    }),
    [
      sesion,
      usuario,
      comercio,
      cargandoSesion,
      cargandoComercio,
      errorComercio,
      recuperando,
      cargarComercio,
      salir,
    ],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const contexto = useContext(AuthContext)
  if (!contexto) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return contexto
}

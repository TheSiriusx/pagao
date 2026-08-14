import { useAuth } from './context/AuthContext'
import { mensajeDeError } from './lib/errores'
import { Alerta, Boton, Cargando, Logo } from './components/UI'
import Login from './pages/Login'
import RegistroComercio from './pages/RegistroComercio'
import Inicio from './pages/Inicio'

export default function App() {
  const { sesion, comercio, cargandoSesion, cargandoComercio, errorComercio, recargarComercio } =
    useAuth()

  if (cargandoSesion) {
    return <PantallaCarga texto="Abriendo Pagao…" />
  }

  if (!sesion) {
    return <Login />
  }

  // Hay sesión pero todavía no sabemos si tiene ficha de comerciante.
  if (cargandoComercio && !comercio) {
    return <PantallaCarga texto="Buscando tu negocio…" />
  }

  if (errorComercio) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Logo className="justify-center" />
          <Alerta>{mensajeDeError(errorComercio)}</Alerta>
          <Boton variante="secundario" onClick={recargarComercio}>
            Reintentar
          </Boton>
        </div>
      </div>
    )
  }

  if (!comercio) {
    return <RegistroComercio />
  }

  return <Inicio />
}

function PantallaCarga({ texto }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2">
      <Logo />
      <Cargando texto={texto} />
    </div>
  )
}

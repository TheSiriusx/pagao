import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Logo } from '../components/UI'
import NavInferior from '../components/NavInferior'
import Deudas from './Deudas'
import Clientes from './Clientes'
import RedPagao from './RedPagao'
import Ajustes from './Ajustes'

const PANTALLAS = {
  deudas: Deudas,
  clientes: Clientes,
  red: RedPagao,
  ajustes: Ajustes,
}

/**
 * Cascarón con las tres secciones.
 *
 * Sin router a propósito: son tres pestañas y ninguna necesita enlace propio.
 * Meter react-router obligaría además a configurar los rewrites de Vercel para
 * que el service worker no rompa las rutas profundas. Si más adelante hacen
 * falta enlaces compartibles, se cambia solo este archivo.
 */
export default function Inicio() {
  const { comercio } = useAuth()
  const [pestana, setPestana] = useState('deudas')

  const Pantalla = PANTALLAS[pestana]
  const esPro = comercio.plan !== 'free'

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-3">
          <Logo />
          <span className="min-w-0 truncate text-sm text-slate-500">
            {comercio.business_name}
            {esPro && <span className="ml-1.5 font-semibold text-marca-600">Pro</span>}
          </span>
        </div>
      </header>

      {/* pb-24 deja sitio para la barra de pestañas fija de abajo. */}
      <main className="mx-auto w-full max-w-md px-4 py-5 pb-24">
        <Pantalla />
      </main>

      <NavInferior activa={pestana} alCambiar={setPestana} />
    </div>
  )
}

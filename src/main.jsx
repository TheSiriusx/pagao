import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configuracionLista } from './lib/supabase'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import FaltaConfiguracion from './pages/FaltaConfiguracion'
import './index.css'

const raiz = createRoot(document.getElementById('root'))

// Sin las variables de entorno no hay cliente de Supabase que valga: se muestra
// una pantalla que explica qué falta en vez de una pantalla en blanco.
raiz.render(
  <StrictMode>
    {configuracionLista ? (
      <AuthProvider>
        <App />
      </AuthProvider>
    ) : (
      <FaltaConfiguracion />
    )}
  </StrictMode>,
)

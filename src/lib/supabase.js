import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * El bundle del cliente es público: cualquiera puede leerlo con "ver código
 * fuente". Aquí SOLO pueden vivir la URL del proyecto y la anon key, que están
 * diseñadas para ser públicas porque toda la autorización real la hace RLS en
 * la base de datos. Nunca agregues una service key ni tokens de terceros.
 */
export const configuracionLista = Boolean(url && anonKey)

export const supabase = configuracionLista
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Hace falta para recuperar la contraseña: el enlace del correo trae
        // el token en el fragmento de la URL, y sin esto nadie lo lee.
        detectSessionInUrl: true,
      },
    })
  : null

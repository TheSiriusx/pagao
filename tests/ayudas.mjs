/**
 * Utilidades compartidas por las suites.
 *
 * Todas las pruebas hablan con Supabase usando ÚNICAMENTE la anon key, que es
 * exactamente lo que lleva el navegador de un comerciante. Si algo pasa aquí,
 * pasa en la app real; si algo se bloquea aquí, se bloquea de verdad.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

function leerEnv() {
  let texto
  try {
    texto = readFileSync(join(RAIZ, '.env'), 'utf8')
  } catch {
    console.error('\nNo se encontró el .env. Cópialo de .env.example y llena los dos valores.\n')
    process.exit(1)
  }

  const env = Object.fromEntries(
    texto
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    console.error('\nAl .env le faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.\n')
    process.exit(1)
  }
  return env
}

const env = leerEnv()
export const URL_BASE = env.VITE_SUPABASE_URL
export const ANON = env.VITE_SUPABASE_ANON_KEY

/** Sello único por corrida, para que los datos de prueba nunca choquen. */
export const SELLO = Date.now().toString().slice(-7)

export async function api(ruta, { token, metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const texto = await r.text()
  let datos = null
  try {
    datos = texto ? JSON.parse(texto) : null
  } catch {
    datos = texto
  }
  return { estado: r.status, datos }
}

export const rpc = (nombre, token, args = {}) =>
  api(`/rest/v1/rpc/${nombre}`, { token, metodo: 'POST', cuerpo: args })

/** true si la respuesta trae el código de error que se esperaba. */
export const fallaCon = (respuesta, codigo) => JSON.stringify(respuesta.datos ?? '').includes(codigo)

let contador = 0

/**
 * Crea un comerciante de prueba completo: usuario de Auth + ficha en
 * merchants. El correo lleva el prefijo pagao.test para poder limpiarlos
 * después de un tirón (ver tests/README.md).
 */
export async function crearComerciante(etiqueta = 'x') {
  contador += 1
  const sufijo = `${SELLO}${String(contador).padStart(2, '0')}`
  const correo = `pagao.test.${etiqueta}.${sufijo}@pagaotest.com`

  const alta = await api('/auth/v1/signup', {
    metodo: 'POST',
    cuerpo: { email: correo, password: `Prueba-${SELLO}!` },
  })

  const token = alta.datos?.access_token
  if (!token) {
    throw new Error(
      `No se pudo crear el usuario de prueba (${correo}): ${JSON.stringify(alta.datos)}\n` +
        'Revisa que en Supabase esté activo el proveedor Email y apagado "Confirm email".',
    )
  }

  const uid = alta.datos.user.id
  const ficha = await api('/rest/v1/merchants', {
    token,
    metodo: 'POST',
    cuerpo: {
      id: uid,
      phone: `+58412${sufijo}`,
      business_name: `Prueba ${etiqueta.toUpperCase()} ${sufijo}`,
      bank_name: '0134 - Banesco',
      bank_phone: `+58412${sufijo}`,
    },
  })
  if (ficha.estado >= 300) {
    throw new Error(`No se pudo crear la ficha de ${etiqueta}: ${JSON.stringify(ficha.datos)}`)
  }

  return { etiqueta, correo, uid, token }
}

/** Atajo: registra un fiado y devuelve su id. */
export async function crearFiado(token, { cedula, nombre = 'Cliente Prueba', monto, vence, telefono = null }) {
  const r = await rpc('create_debt', token, {
    p_cedula: cedula,
    p_full_name: nombre,
    p_amount: monto,
    p_due_date: vence,
    p_phone: telefono,
  })
  if (r.estado >= 300) throw new Error(`create_debt falló: ${JSON.stringify(r.datos)}`)
  return r.datos
}

/** Atajo: trae una deuda concreta desde list_debts. */
export async function traerFiado(token, id) {
  const r = await rpc('list_debts', token)
  return (r.datos ?? []).find((d) => d.id === id) ?? null
}

/** Fecha ISO desplazada en días respecto a hoy. */
export function fecha(diasDesdeHoy) {
  const f = new Date(Date.now() + diasDesdeHoy * 86400000)
  return f.toISOString().slice(0, 10)
}

/** Recolector de resultados de una suite. */
export function crearSuite(titulo) {
  const fallos = []
  let pasadas = 0
  let seccionActual = null

  return {
    titulo,
    seccion(nombre) {
      seccionActual = nombre
      console.log(`\n  ${nombre}`)
    },
    check(descripcion, condicion, detalle = '') {
      if (condicion) {
        pasadas += 1
        console.log(`    ok    ${descripcion}`)
      } else {
        fallos.push({ seccion: seccionActual, descripcion, detalle })
        console.log(`    FALLA ${descripcion}${detalle ? `  → ${detalle}` : ''}`)
      }
    },
    resultado: () => ({ titulo, pasadas, fallos }),
  }
}

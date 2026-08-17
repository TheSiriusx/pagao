import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeDeError } from '../lib/errores'

const PAGINA = 100

/**
 * Lista que se pide al servidor por páginas, con filtro y búsqueda.
 *
 * Antes todo esto se hacía en el navegador sobre la lista completa. Dejó de
 * servir cuando se descubrió que PostgREST corta en 1000 filas sin avisar:
 * filtrar o buscar sobre una lista truncada da resultados incompletos y nadie
 * se entera. Ahora el servidor decide qué entra en cada página.
 */
export function useListaPaginada(cargar, { filtro = null, buscar = '' } = {}) {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [hayMas, setHayMas] = useState(false)
  const [error, setError] = useState(null)

  // Una búsqueda lenta que llega tarde no debe pisar a una más reciente.
  const peticion = useRef(0)

  const pedir = useCallback(
    async ({ desde = 0, silencioso = false } = {}) => {
      const id = ++peticion.current
      if (desde === 0 && !silencioso) setCargando(true)
      if (desde > 0) setCargandoMas(true)
      setError(null)

      try {
        const pagina = await cargar({ filtro, buscar: buscar.trim() || null, limite: PAGINA, desde })
        if (id !== peticion.current) return

        setItems((previos) => (desde === 0 ? pagina : [...previos, ...pagina]))
        setHayMas(pagina.length === PAGINA)
      } catch (fallo) {
        if (id === peticion.current) setError(mensajeDeError(fallo))
      } finally {
        if (id === peticion.current) {
          setCargando(false)
          setCargandoMas(false)
        }
      }
    },
    [cargar, filtro, buscar],
  )

  // La búsqueda espera a que el usuario deje de teclear: sin esto se manda
  // una consulta por letra.
  useEffect(() => {
    const espera = buscar ? 350 : 0
    const id = setTimeout(() => pedir({ desde: 0 }), espera)
    return () => clearTimeout(id)
  }, [pedir, buscar])

  return {
    items,
    cargando,
    cargandoMas,
    hayMas,
    error,
    cargarMas: () => pedir({ desde: items.length }),
    recargar: () => pedir({ desde: 0, silencioso: true }),
  }
}

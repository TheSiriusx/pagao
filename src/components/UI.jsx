import { useEffect } from 'react'
import { AlertCircle, Info, Loader2, X } from 'lucide-react'

/* Piezas compartidas. Todo dimensionado para entrar en 320px de ancho y con
   objetivos táctiles de 44px, que es el mínimo cómodo en un teléfono. */

export function Boton({
  children,
  variante = 'primario',
  cargando = false,
  className = '',
  disabled,
  ...props
}) {
  const base =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base ' +
    'font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50'

  const variantes = {
    primario: 'bg-marca-600 text-white hover:bg-marca-700',
    secundario: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
    fantasma: 'bg-transparent text-slate-600 hover:bg-slate-200',
  }

  return (
    <button
      className={`${base} ${variantes[variante]} ${className}`}
      disabled={disabled || cargando}
      {...props}
    >
      {cargando && <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Campo({ etiqueta, ayuda, error, id, className = '', children, ...props }) {
  const hayError = Boolean(error)

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>

      {children ?? (
        <input
          id={id}
          aria-invalid={hayError}
          aria-describedby={hayError ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
          className={
            'w-full rounded-xl border bg-white px-3 py-3 text-base text-slate-900 ' +
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 ' +
            (hayError
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-slate-300 focus:border-marca-500 focus:ring-marca-100')
          }
          {...props}
        />
      )}

      {hayError ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="mt-1.5 text-sm text-slate-500">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}

export function Alerta({ tono = 'error', children, className = '' }) {
  const tonos = {
    error: { caja: 'bg-red-50 text-red-800 ring-red-200', Icono: AlertCircle },
    info: { caja: 'bg-sky-50 text-sky-900 ring-sky-200', Icono: Info },
    exito: { caja: 'bg-marca-50 text-marca-700 ring-marca-100', Icono: Info },
  }
  const { caja, Icono } = tonos[tono] ?? tonos.error

  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ring-1 ${caja} ${className}`}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

export function Cargando({ texto = 'Cargando…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-slate-500 ${className}`}>
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{texto}</span>
    </div>
  )
}

/**
 * Hoja que sube desde abajo. En un teléfono es mucho más cómoda que un modal
 * centrado: queda al alcance del pulgar y no tapa la pantalla completa.
 */
export function Hoja({ abierta, alCerrar, titulo, children }) {
  useEffect(() => {
    if (!abierta) return

    const alTeclear = (e) => {
      if (e.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', alTeclear)

    // Evita que el fondo se desplace mientras la hoja está abierta.
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = previo
    }
  }, [abierta, alCerrar])

  if (!abierta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={alCerrar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white
                   p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="-mt-1 -mr-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}

export function Vacio({ Icono, titulo, texto, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      {Icono && <Icono className="mx-auto size-6 text-slate-400" aria-hidden="true" />}
      <h2 className="mt-2 font-semibold text-slate-700">{titulo}</h2>
      {texto && <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Logo({ className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#0f172a" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#10b981" strokeWidth="5" />
        <path
          d="M23 32.5 L29.5 39 L42 26"
          fill="none"
          stroke="#fff"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xl font-bold tracking-tight text-slate-900">Pagao</span>
    </div>
  )
}

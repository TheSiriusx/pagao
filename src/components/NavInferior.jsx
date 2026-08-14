import { Search, Settings, Wallet } from 'lucide-react'

const PESTANAS = [
  { id: 'deudas', etiqueta: 'Fiados', Icono: Wallet },
  { id: 'red', etiqueta: 'Red Pagao', Icono: Search },
  { id: 'ajustes', etiqueta: 'Ajustes', Icono: Settings },
]

export default function NavInferior({ activa, alCambiar }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-md">
        {PESTANAS.map(({ id, etiqueta, Icono }) => {
          const seleccionada = activa === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => alCambiar(id)}
              aria-current={seleccionada ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 px-1 py-2.5 text-xs font-medium
                          transition ${seleccionada ? 'text-marca-600' : 'text-slate-400'}`}
            >
              <Icono className="size-5" aria-hidden="true" />
              {etiqueta}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

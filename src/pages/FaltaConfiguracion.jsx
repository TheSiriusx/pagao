import { KeyRound } from 'lucide-react'
import { Alerta, Logo } from '../components/UI'

export default function FaltaConfiguracion() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-start gap-3">
            <span className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <KeyRound className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">Falta configurar Supabase</h1>
              <p className="text-sm text-slate-500">Copia .env.example a .env y llena los dos valores.</p>
            </div>
          </div>

          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
            <code>
              VITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}
              VITE_SUPABASE_ANON_KEY=eyJhbGci…
            </code>
          </pre>

          <p className="mt-3 text-sm text-slate-500">
            Están en Supabase → Project Settings → API. Después reinicia <code>npm run dev</code>.
          </p>

          <Alerta tono="info" className="mt-4">
            Solo esas dos. Cualquier otra clave metida en una variable VITE_ termina publicada en el
            bundle que descarga el navegador.
          </Alerta>
        </div>
      </div>
    </div>
  )
}

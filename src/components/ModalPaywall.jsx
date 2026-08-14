import { Search, ShieldCheck, Zap } from 'lucide-react'
import { Alerta, Boton, Hoja } from './UI'

/**
 * Aparece cuando get_debtor_score responde FREE_LIMIT.
 *
 * El límite lo decide el servidor dentro de la función, no este componente:
 * aunque alguien borre este archivo, la consulta número dos sigue rebotando.
 * Todavía no hay cobro real conectado.
 */
export default function ModalPaywall({ abierto, alCerrar }) {
  return (
    <Hoja abierta={abierto} alCerrar={alCerrar} titulo="Ya usaste tu consulta gratis">
      <p className="text-sm text-slate-600">
        Con el plan gratis puedes revisar el historial de <strong>un cliente</strong>. Para seguir
        consultando tienes dos opciones.
      </p>

      <div className="mt-4 space-y-3">
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
              <Search className="size-4 text-slate-400" aria-hidden="true" />
              Consulta suelta
            </span>
            <span className="font-bold text-slate-900">$0,50</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Pagas solo cuando la necesitas.</p>
        </div>

        <div className="rounded-xl bg-marca-50 p-4 ring-1 ring-marca-100">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-semibold text-marca-700">
              <Zap className="size-4" aria-hidden="true" />
              Plan Pro
            </span>
            <span className="font-bold text-marca-700">$3/mes</span>
          </div>
          <p className="mt-1 text-sm text-marca-700/80">Consultas ilimitadas todo el mes.</p>
        </div>
      </div>

      <Alerta tono="info" className="mt-4">
        Todavía no hay pagos conectados. Para probar el plan Pro, actívalo a mano desde Ajustes.
      </Alerta>

      <div className="mt-4 flex items-start gap-2 text-xs text-slate-400">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Nunca ves los datos de otros comercios: solo el puntaje, el color y en cuántos negocios
          debe.
        </span>
      </div>

      <Boton variante="secundario" onClick={alCerrar} className="mt-4">
        Entendido
      </Boton>
    </Hoja>
  )
}

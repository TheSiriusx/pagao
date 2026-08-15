import { useEffect, useState } from 'react'
import { MapPin, MessageCircle, Pencil, Phone } from 'lucide-react'
import { actualizarCliente } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearCedula, formatearMonto, formatearTelefono, telefonoParaWhatsApp, telefonoValido } from '../lib/formato'
import { Alerta, Boton, Campo, Hoja } from './UI'

/**
 * Ficha del cliente: datos de contacto y sus deudas contigo.
 *
 * Todo lo que se ve aquí es de este comerciante. La dirección y los teléfonos
 * viven en merchant_debtors, no en la tabla global: el comercio de al lado
 * tiene su propia ficha del mismo cliente y no ve esta.
 */
export default function FichaCliente({ cliente, deudas = [], alCerrar, alGuardar }) {
  const [editando, setEditando] = useState(false)
  const [campos, setCampos] = useState({ nombre: '', telefono: '', telefono2: '', direccion: '' })
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!cliente) return
    setCampos({
      nombre: cliente.full_name ?? '',
      telefono: cliente.phone ? formatearTelefono(cliente.phone) : '',
      telefono2: cliente.phone2 ? formatearTelefono(cliente.phone2) : '',
      direccion: cliente.address ?? '',
    })
    setEditando(false)
    setErrores({})
    setErrorGeneral(null)
  }, [cliente?.debtor_id])

  if (!cliente) return null

  const suyas = deudas.filter((d) => d.debtor_id === cliente.debtor_id)
  const pendientes = suyas.filter((d) => d.status !== 'paid')
  const enMora = cliente.vencidas > 0

  function set(clave, valor) {
    setCampos((c) => ({ ...c, [clave]: valor }))
    setErrores((e) => ({ ...e, [clave]: undefined }))
    setErrorGeneral(null)
  }

  async function guardar(evento) {
    evento.preventDefault()
    setErrorGeneral(null)

    const nuevos = {}
    if (campos.nombre.trim().length < 2) nuevos.nombre = 'Falta el nombre.'
    if (campos.telefono.trim() && !telefonoValido(campos.telefono)) {
      nuevos.telefono = 'Ese número no parece un celular venezolano.'
    }
    if (campos.telefono2.trim() && !telefonoValido(campos.telefono2)) {
      nuevos.telefono2 = 'Ese número no parece un celular venezolano.'
    }
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setGuardando(true)
    try {
      await actualizarCliente({ debtorId: cliente.debtor_id, ...campos })
      await alGuardar()
      setEditando(false)
    } catch (fallo) {
      setErrorGeneral(mensajeDeError(fallo))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta={Boolean(cliente)} alCerrar={alCerrar} titulo={cliente.full_name}>
      {editando ? (
        <form onSubmit={guardar} noValidate className="space-y-4">
          <Campo
            id="fcNombre"
            etiqueta="Nombre"
            value={campos.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            error={errores.nombre}
          />
          <Campo
            id="fcTelefono"
            etiqueta="Celular"
            type="tel"
            inputMode="numeric"
            placeholder="0412-1234567"
            value={campos.telefono}
            onChange={(e) => set('telefono', e.target.value)}
            error={errores.telefono}
          />
          <Campo
            id="fcTelefono2"
            etiqueta="Otro teléfono"
            type="tel"
            inputMode="numeric"
            placeholder="0212-5551234"
            value={campos.telefono2}
            onChange={(e) => set('telefono2', e.target.value)}
            error={errores.telefono2}
          />
          <Campo
            id="fcDireccion"
            etiqueta="Dónde vive"
            placeholder="Calle Sucre, casa 24"
            value={campos.direccion}
            onChange={(e) => set('direccion', e.target.value)}
            ayuda="Solo la ves tú."
          />

          {errorGeneral && <Alerta>{errorGeneral}</Alerta>}

          <div className="flex gap-2">
            <Boton variante="secundario" type="button" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
          </div>
        </form>
      ) : (
        <>
          <div
            className={`rounded-xl p-4 ring-1 ${
              enMora ? 'bg-red-50 ring-red-200' : 'bg-slate-50 ring-slate-200'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-slate-500">Te debe</span>
              <span className={`text-2xl font-bold ${enMora ? 'text-red-700' : 'text-slate-900'}`}>
                {formatearMonto(cliente.debe)}
              </span>
            </div>
            <p className="mt-1 text-right text-xs text-slate-500">
              {cliente.pendientes} {cliente.pendientes === 1 ? 'fiado abierto' : 'fiados abiertos'}
              {enMora && ` · ${cliente.vencidas} vencido${cliente.vencidas === 1 ? '' : 's'}`}
            </p>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Cédula</dt>
              <dd className="min-w-0 text-slate-900">{formatearCedula(cliente.cedula)}</dd>
            </div>

            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Celular</dt>
              <dd className="min-w-0 break-words text-slate-900">
                {cliente.phone ? formatearTelefono(cliente.phone) : '—'}
              </dd>
            </div>

            {cliente.phone2 && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">Otro</dt>
                <dd className="min-w-0 break-words text-slate-900">
                  {formatearTelefono(cliente.phone2)}
                </dd>
              </div>
            )}

            {cliente.address && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-slate-500">Vive en</dt>
                <dd className="min-w-0 break-words text-slate-900">{cliente.address}</dd>
              </div>
            )}

            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-500">Le has fiado</dt>
              <dd className="min-w-0 text-slate-900">{formatearMonto(cliente.total_fiado)} en total</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {cliente.phone && (
              <a
                href={`https://wa.me/${telefonoParaWhatsApp(cliente.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50
                           px-3 py-2.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                WhatsApp
              </a>
            )}
            {cliente.phone && (
              <a
                href={`tel:${cliente.phone}`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100
                           px-3 py-2.5 text-sm font-semibold text-slate-700"
              >
                <Phone className="size-4" aria-hidden="true" />
                Llamar
              </a>
            )}
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100
                         px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </button>
          </div>

          {pendientes.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-slate-700">Fiados abiertos</p>
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {pendientes.map((d) => {
                  const saldo = Number(d.amount) - Number(d.abonado ?? 0)
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900">{formatearMonto(saldo)}</p>
                        {d.notes && <p className="truncate text-xs text-slate-400">{d.notes}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        {new Date(`${d.due_date}T12:00:00`).toLocaleDateString('es-VE', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {!cliente.address && (
            <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Sin dirección registrada. Tócale a Editar para agregarla.
            </p>
          )}
        </>
      )}
    </Hoja>
  )
}

import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { guardarTelefonoDeudor } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { formatearTelefono, telefonoValido } from '../lib/formato'
import { Alerta, Boton, Campo, Hoja } from './UI'

/**
 * Agrega o corrige el celular de un cliente ya registrado.
 *
 * Sin esto, un fiado creado sin teléfono dejaba el botón de cobro inservible
 * para siempre. Del lado del servidor, set_debtor_phone solo deja tocar el
 * teléfono de alguien con quien quien llama YA tiene una deuda.
 */
export default function FormularioTelefono({ deuda, alCerrar, alGuardar }) {
  const [telefono, setTelefono] = useState('')
  const [error, setError] = useState(null)
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setTelefono(deuda?.phone ? formatearTelefono(deuda.phone) : '')
    setError(null)
    setErrorGeneral(null)
  }, [deuda?.id, deuda?.phone])

  if (!deuda) return null

  const yaTenia = Boolean(deuda.phone)

  async function enviar(evento) {
    evento.preventDefault()
    setErrorGeneral(null)

    if (!telefonoValido(telefono)) {
      setError('Escribe un celular venezolano, como 0412-1234567.')
      return
    }

    setGuardando(true)
    try {
      await guardarTelefonoDeudor(deuda.debtor_id, telefono)
      // alGuardar recarga la lista y, si vino del botón de cobro, abre
      // WhatsApp con el número recién guardado.
      await alGuardar()
      alCerrar()
    } catch (fallo) {
      setErrorGeneral(mensajeDeError(fallo))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja
      abierta={Boolean(deuda)}
      alCerrar={alCerrar}
      titulo={yaTenia ? 'Cambiar el teléfono' : 'Falta el teléfono'}
    >
      <p className="mb-4 text-sm text-slate-600">
        {yaTenia
          ? `Corrige el número de ${deuda.full_name}.`
          : `Para mandarle el recordatorio por WhatsApp hace falta el celular de ${deuda.full_name}.`}
      </p>

      <form onSubmit={enviar} noValidate className="space-y-4">
        <Campo
          id="telefonoDeudor"
          etiqueta="Celular del cliente"
          type="tel"
          inputMode="numeric"
          autoFocus
          placeholder="0412-1234567"
          value={telefono}
          onChange={(e) => {
            setTelefono(e.target.value)
            setError(null)
          }}
          error={error}
        />

        {errorGeneral && <Alerta>{errorGeneral}</Alerta>}

        <Boton type="submit" cargando={guardando}>
          <MessageCircle className="size-5" aria-hidden="true" />
          {guardando ? 'Guardando…' : yaTenia ? 'Guardar' : 'Guardar y cobrar'}
        </Boton>
      </form>
    </Hoja>
  )
}

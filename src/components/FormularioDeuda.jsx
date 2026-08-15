import { useEffect, useState } from 'react'
import { actualizarDeuda, crearDeuda } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { cedulaValida, formatearCedula, telefonoValido } from '../lib/formato'
import { isoDeHoy } from '../lib/fechas'
import { Alerta, Boton, Campo, Hoja } from './UI'

const VACIO = {
  cedula: '',
  nombre: '',
  monto: '',
  vence: isoDeHoy(15),
  notas: '',
  telefono: '',
  telefono2: '',
  direccion: '',
}

/**
 * Sirve para dos cosas: registrar un fiado nuevo y corregir uno existente.
 * En modo edición la cédula y el nombre no se tocan — cambiarlos convertiría
 * la deuda en la de otra persona, y esa fila ya vive en el historial de la
 * red. Para eso se borra y se vuelve a crear.
 */
export default function FormularioDeuda({ abierto, deuda, alCerrar, alGuardar }) {
  const editando = Boolean(deuda)

  const [campos, setCampos] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (deuda) {
      setCampos({
        cedula: deuda.cedula,
        nombre: deuda.full_name,
        monto: String(deuda.amount),
        vence: String(deuda.due_date).slice(0, 10),
        notas: deuda.notes ?? '',
        telefono: '',
        telefono2: '',
        direccion: '',
      })
    } else {
      setCampos(VACIO)
    }
    setErrores({})
    setErrorGeneral(null)
  }, [deuda?.id, abierto])

  function set(clave, valor) {
    setCampos((c) => ({ ...c, [clave]: valor }))
    setErrores((e) => ({ ...e, [clave]: undefined }))
    setErrorGeneral(null)
  }

  function validar() {
    const nuevos = {}

    if (!editando) {
      // Las mismas reglas corren en create_debt: el cliente solo avisa antes
      // de gastar el viaje a la red, no es la validación de verdad.
      if (!cedulaValida(campos.cedula)) {
        nuevos.cedula = 'Escríbela como V12345678 o E12345678.'
      }
      if (campos.nombre.trim().length < 2) {
        nuevos.nombre = 'Falta el nombre del cliente.'
      }
      if (campos.telefono.trim() && !telefonoValido(campos.telefono)) {
        nuevos.telefono = 'Ese número no parece un celular venezolano.'
      }
      if (campos.telefono2.trim() && !telefonoValido(campos.telefono2)) {
        nuevos.telefono2 = 'Ese número no parece un celular venezolano.'
      }
    }

    if (!(Number(campos.monto) > 0)) {
      nuevos.monto = 'El monto debe ser mayor que cero.'
    }
    const abonado = Number(deuda?.abonado ?? 0)
    if (editando && Number(campos.monto) < abonado) {
      nuevos.monto = `No puede ser menor que los $${abonado.toFixed(2)} que ya abonó.`
    }
    if (!campos.vence) {
      nuevos.vence = 'Falta la fecha de vencimiento.'
    }

    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (!validar()) return

    setGuardando(true)
    try {
      if (editando) {
        await actualizarDeuda({ id: deuda.id, ...campos })
      } else {
        await crearDeuda(campos)
      }
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
      abierta={abierto}
      alCerrar={alCerrar}
      titulo={editando ? 'Corregir fiado' : 'Nuevo fiado'}
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        {editando ? (
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="font-semibold text-slate-900">{campos.nombre}</p>
            <p className="text-xs text-slate-500">{formatearCedula(campos.cedula)}</p>
          </div>
        ) : (
          <>
            <Campo
              id="cedula"
              etiqueta="Cédula del cliente"
              inputMode="text"
              autoCapitalize="characters"
              placeholder="V12345678"
              value={campos.cedula}
              onChange={(e) => set('cedula', e.target.value)}
              error={errores.cedula}
              ayuda="Con esta cédula se arma su historial en la red."
            />

            <Campo
              id="nombre"
              etiqueta="Nombre"
              placeholder="José Rodríguez"
              value={campos.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              error={errores.nombre}
            />
          </>
        )}

        <div className="flex gap-3">
          <Campo
            id="monto"
            etiqueta="Monto ($)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0,00"
            className="flex-1"
            value={campos.monto}
            onChange={(e) => set('monto', e.target.value)}
            error={errores.monto}
          />

          <Campo
            id="vence"
            etiqueta="Vence"
            type="date"
            className="flex-1"
            value={campos.vence}
            onChange={(e) => set('vence', e.target.value)}
            error={errores.vence}
          />
        </div>

        {!editando && (
          <>
            <Campo
              id="telefonoCliente"
              etiqueta="Celular del cliente"
              type="tel"
              inputMode="numeric"
              placeholder="0412-1234567"
              value={campos.telefono}
              onChange={(e) => set('telefono', e.target.value)}
              error={errores.telefono}
              ayuda="Sin él no puedes mandarle el recordatorio por WhatsApp."
            />

            <Campo
              id="telefono2Cliente"
              etiqueta="Otro teléfono"
              type="tel"
              inputMode="numeric"
              placeholder="0212-5551234"
              value={campos.telefono2}
              onChange={(e) => set('telefono2', e.target.value)}
              error={errores.telefono2}
              ayuda="De un familiar o del trabajo, por si no contesta."
            />

            <Campo
              id="direccionCliente"
              etiqueta="Dónde vive"
              placeholder="Calle Sucre, casa 24, al lado de la panadería"
              value={campos.direccion}
              onChange={(e) => set('direccion', e.target.value)}
              ayuda="Solo la ves tú. No se comparte con la Red Pagao."
            />
          </>
        )}

        <Campo
          id="notas"
          etiqueta="Nota"
          placeholder="2 bultos de harina"
          value={campos.notas}
          onChange={(e) => set('notas', e.target.value)}
          ayuda="Opcional."
        />

        {errorGeneral && <Alerta>{errorGeneral}</Alerta>}

        <Boton type="submit" cargando={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar fiado'}
        </Boton>
      </form>
    </Hoja>
  )
}

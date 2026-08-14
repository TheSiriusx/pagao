import { useState } from 'react'
import { crearDeuda } from '../lib/datos'
import { mensajeDeError } from '../lib/errores'
import { cedulaValida, telefonoValido } from '../lib/formato'
import { isoDeHoy } from '../lib/fechas'
import { Alerta, Boton, Campo, Hoja } from './UI'

const VACIO = { cedula: '', nombre: '', monto: '', vence: isoDeHoy(15), notas: '', telefono: '' }

export default function FormularioDeuda({ abierto, alCerrar, alGuardar }) {
  const [campos, setCampos] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [guardando, setGuardando] = useState(false)

  function set(clave, valor) {
    setCampos((c) => ({ ...c, [clave]: valor }))
    setErrores((e) => ({ ...e, [clave]: undefined }))
    setErrorGeneral(null)
  }

  function validar() {
    const nuevos = {}

    // La misma regla corre en create_debt: el cliente solo avisa antes de
    // gastar el viaje a la red, no es la validación de verdad.
    if (!cedulaValida(campos.cedula)) {
      nuevos.cedula = 'Escríbela como V12345678 o E12345678.'
    }
    if (campos.nombre.trim().length < 2) {
      nuevos.nombre = 'Falta el nombre del cliente.'
    }
    if (!(Number(campos.monto) > 0)) {
      nuevos.monto = 'El monto debe ser mayor que cero.'
    }
    if (!campos.vence) {
      nuevos.vence = 'Falta la fecha de vencimiento.'
    }
    if (campos.telefono.trim() && !telefonoValido(campos.telefono)) {
      nuevos.telefono = 'Ese número no parece un celular venezolano.'
    }

    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (!validar()) return

    setGuardando(true)
    try {
      await crearDeuda(campos)
      setCampos(VACIO)
      setErrores({})
      await alGuardar()
      alCerrar()
    } catch (fallo) {
      setErrorGeneral(mensajeDeError(fallo))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja abierta={abierto} alCerrar={alCerrar} titulo="Nuevo fiado">
      <form onSubmit={enviar} noValidate className="space-y-4">
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

        <Campo
          id="telefonoCliente"
          etiqueta="Celular del cliente"
          type="tel"
          inputMode="numeric"
          placeholder="0412-1234567"
          value={campos.telefono}
          onChange={(e) => set('telefono', e.target.value)}
          error={errores.telefono}
          ayuda="Opcional, pero sin él no puedes mandarle el recordatorio."
        />

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
          {guardando ? 'Guardando…' : 'Registrar fiado'}
        </Boton>
      </form>
    </Hoja>
  )
}

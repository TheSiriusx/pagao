/**
 * Supabase de mentira, en memoria.
 *
 * Las pruebas de interfaz no deben tocar la base de datos real: serían lentas,
 * dejarían basura en la Red Pagao y fallarían por cosas ajenas al frontend.
 * Aquí se interceptan las llamadas a Supabase y se responden con un backend
 * mínimo que imita las RPC de verdad, incluidos sus errores.
 *
 * Lo que se prueba con esto es la INTERFAZ: que las pantallas dibujen bien,
 * que los formularios validen, que los saldos se calculen y que los errores
 * del servidor se muestren en español. Que las reglas del servidor funcionen
 * ya lo comprueban las suites de tests/, contra la base real.
 */

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

function jwt(uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated' })}.x`
}

export function crearSimulador({ conComercio = true, plan = 'free', consultasUsadas = 0 } = {}) {
  const UID = '11111111-2222-3333-4444-555555555555'

  const estado = {
    usuario: {
      id: UID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'maria@ejemplo.com',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
    comercio: conComercio
      ? {
          id: UID,
          phone: '+584121234567',
          business_name: 'Bodega La Esquina',
          owner_name: 'María Pérez',
          bank_name: '0134 - Banesco',
          bank_phone: '+584121234567',
          plan,
          plan_expires_at: null,
          free_queries_used: consultasUsadas,
          created_at: new Date().toISOString(),
        }
      : null,
    deudas: [],
    abonos: [],
    scores: {},
    // Los tests leen esto para comprobar qué se le mandó al servidor.
    llamadas: [],
  }

  let siguienteId = 1
  const nuevoId = () => `deuda-${siguienteId++}`

  const sesion = () => ({
    access_token: jwt(UID),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresh-falso',
    user: estado.usuario,
  })

  const abonadoDe = (id) =>
    estado.abonos.filter((a) => a.debt_id === id).reduce((t, a) => t + Number(a.amount), 0)

  const conAbonado = (d) => ({ ...d, abonado: abonadoDe(d.id) })

  const error = (codigo) => ({
    cuerpo: { code: 'P0001', message: codigo, details: null, hint: null },
    estado: 400,
  })

  function manejarRpc(nombre, args) {
    switch (nombre) {
      case 'list_debts':
        return {
          cuerpo: estado.deudas
            .map(conAbonado)
            .sort((a, b) =>
              a.status === 'paid' && b.status !== 'paid'
                ? 1
                : b.status === 'paid' && a.status !== 'paid'
                  ? -1
                  : String(a.due_date).localeCompare(String(b.due_date)),
            ),
        }

      case 'list_payments':
        return { cuerpo: estado.abonos }

      case 'create_debt': {
        const cedula = String(args.p_cedula ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
        if (!/^[VE][0-9]{6,9}$/.test(cedula)) return error('INVALID_CEDULA')
        if (!(Number(args.p_amount) > 0)) return error('INVALID_AMOUNT')

        const previa = estado.deudas.find((d) => d.cedula === cedula)
        const id = nuevoId()
        estado.deudas.push({
          id,
          debtor_id: previa?.debtor_id ?? `deudor-${cedula}`,
          cedula,
          // Igual que el servidor: conserva el nombre con el que se registró
          // la primera vez.
          full_name: previa?.full_name ?? args.p_full_name,
          phone: previa?.phone ?? args.p_phone ?? null,
          amount: Number(args.p_amount),
          due_date: args.p_due_date,
          status: 'active',
          notes: args.p_notes ?? null,
          payment_date: null,
          days_late: 0,
          created_at: new Date().toISOString(),
        })
        return { cuerpo: id }
      }

      case 'add_payment': {
        const d = estado.deudas.find((x) => x.id === args.p_debt_id)
        if (!d) return error('NOT_YOUR_DEBT')
        if (d.status === 'paid') return error('ALREADY_PAID')
        if (!(Number(args.p_amount) > 0)) return error('INVALID_AMOUNT')
        const ya = abonadoDe(d.id)
        if (Number(args.p_amount) > d.amount - ya + 0.005) return error('AMOUNT_TOO_BIG')

        estado.abonos.push({
          id: `abono-${estado.abonos.length + 1}`,
          debt_id: d.id,
          amount: Number(args.p_amount),
          paid_at: new Date().toISOString(),
        })
        const total = abonadoDe(d.id)
        if (total >= d.amount - 0.005) {
          d.status = 'paid'
          d.payment_date = new Date().toISOString()
        }
        return { cuerpo: [{ abonado: total, saldo: Math.max(d.amount - total, 0), quedo_pagada: d.status === 'paid' }] }
      }

      case 'mark_debt_paid': {
        const d = estado.deudas.find((x) => x.id === args.p_debt_id)
        if (!d || d.status === 'paid') return error('NOT_YOUR_DEBT_OR_ALREADY_PAID')
        const falta = d.amount - abonadoDe(d.id)
        if (falta > 0) {
          estado.abonos.push({
            id: `abono-${estado.abonos.length + 1}`,
            debt_id: d.id,
            amount: falta,
            paid_at: new Date().toISOString(),
          })
        }
        d.status = 'paid'
        d.payment_date = new Date().toISOString()
        return { cuerpo: null }
      }

      case 'update_debt': {
        const d = estado.deudas.find((x) => x.id === args.p_debt_id)
        if (!d) return error('NOT_YOUR_DEBT')
        if (d.status === 'paid') return error('ALREADY_PAID')
        if (Number(args.p_amount) < abonadoDe(d.id) - 0.005) return error('AMOUNT_BELOW_PAID')
        d.amount = Number(args.p_amount)
        d.due_date = args.p_due_date
        d.notes = args.p_notes ?? null
        if (abonadoDe(d.id) >= d.amount - 0.005) {
          d.status = 'paid'
          d.payment_date = new Date().toISOString()
        }
        return { cuerpo: null }
      }

      case 'delete_debt': {
        const i = estado.deudas.findIndex((x) => x.id === args.p_debt_id)
        if (i < 0) return error('NOT_YOUR_DEBT')
        if (estado.deudas[i].status === 'paid') return error('CANNOT_DELETE_PAID')
        estado.abonos = estado.abonos.filter((a) => a.debt_id !== args.p_debt_id)
        estado.deudas.splice(i, 1)
        return { cuerpo: null }
      }

      case 'delete_payment': {
        const i = estado.abonos.findIndex((a) => a.id === args.p_payment_id)
        if (i < 0) return error('NOT_YOUR_PAYMENT')
        const d = estado.deudas.find((x) => x.id === estado.abonos[i].debt_id)
        if (d?.status === 'paid') return error('DEBT_ALREADY_PAID')
        estado.abonos.splice(i, 1)
        return { cuerpo: null }
      }

      case 'set_debt_disputed': {
        const d = estado.deudas.find((x) => x.id === args.p_debt_id)
        if (!d) return error('NOT_YOUR_DEBT')
        if (d.status === 'paid') return error('ALREADY_PAID')
        d.status = args.p_disputed ? 'disputed' : 'active'
        return { cuerpo: null }
      }

      case 'set_debtor_phone': {
        for (const d of estado.deudas) {
          if (d.debtor_id === args.p_debtor_id) d.phone = args.p_phone
        }
        return { cuerpo: null }
      }

      case 'get_debtor_score': {
        const cedula = String(args.p_cedula ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
        const guardado = estado.scores[cedula]
        if (!guardado) {
          return { cuerpo: [{ score: null, band: 'gris', active_debts: 0, full_name: null, total_debt: null }] }
        }
        return { cuerpo: [guardado] }
      }

      case 'sweep_my_overdue':
        return { cuerpo: 0 }

      default:
        return { cuerpo: {} }
    }
  }

  /** Se engancha a una página de Playwright. */
  async function instalar(pagina, host) {
    await pagina.route(`**/${host}/**`, async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const metodo = req.method()
      let cuerpo = null
      try {
        cuerpo = req.postData() ? JSON.parse(req.postData()) : null
      } catch {
        cuerpo = null
      }

      estado.llamadas.push({ ruta: url.pathname, metodo, cuerpo })

      const responder = (datos, estadoHttp = 200) =>
        route.fulfill({
          status: estadoHttp,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(datos),
        })

      // ---- Auth ----
      if (url.pathname.includes('/auth/v1/signup')) return responder(sesion())
      if (url.pathname.includes('/auth/v1/token')) {
        if (cuerpo?.password === 'malamala') {
          return responder({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400)
        }
        return responder(sesion())
      }
      if (url.pathname.includes('/auth/v1/recover')) return responder({})
      if (url.pathname.includes('/auth/v1/user')) return responder(estado.usuario)
      if (url.pathname.includes('/auth/v1/logout')) return responder({})

      // ---- RPC ----
      if (url.pathname.includes('/rest/v1/rpc/')) {
        const nombre = url.pathname.split('/rest/v1/rpc/')[1]
        // Las que viajan por GET llevan los argumentos en la query.
        const args = cuerpo ?? Object.fromEntries(url.searchParams)
        const r = manejarRpc(nombre, args)
        return responder(r.cuerpo, r.estado ?? 200)
      }

      // ---- Tabla merchants ----
      if (url.pathname.includes('/rest/v1/merchants')) {
        if (metodo === 'POST') {
          estado.comercio = {
            plan: 'free',
            plan_expires_at: null,
            free_queries_used: 0,
            created_at: new Date().toISOString(),
            ...cuerpo,
          }
          return responder([estado.comercio], 201)
        }
        if (metodo === 'PATCH') {
          Object.assign(estado.comercio, cuerpo)
          return responder([estado.comercio])
        }
        return responder(estado.comercio ? [estado.comercio] : [])
      }

      return responder({})
    })
  }

  return {
    estado,
    instalar,
    /** Precarga deudas sin pasar por la interfaz. */
    sembrarDeuda(d) {
      const id = nuevoId()
      estado.deudas.push({
        id,
        debtor_id: `deudor-${d.cedula}`,
        phone: null,
        status: 'active',
        notes: null,
        payment_date: null,
        days_late: 0,
        created_at: new Date().toISOString(),
        ...d,
        id,
      })
      return id
    },
    sembrarScore(cedula, fila) {
      estado.scores[cedula.toUpperCase().replace(/[^A-Z0-9]/g, '')] = fila
    },
  }
}

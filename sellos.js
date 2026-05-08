const db = require('../db');

// Umbrales y recompensas — definidos en un solo lugar
const REGLAS = {
  umbrales: [
    {
      en_visita:      7,
      tipo:           'corte_gratis',
      descripcion:    'Corte de cabello gratis',
      // El valor se calcula dinámicamente del precio del servicio "Corte de cabello"
    },
    {
      en_visita:      11,
      tipo:           'paquete_gratis',
      descripcion:    'Paquete corte + barba gratis',
    },
  ],
  caducidad_dias: 365,
};

/**
 * Obtiene o crea el ciclo activo de un cliente.
 * Si el ciclo caducó, lo cierra y crea uno nuevo.
 */
async function obtenerOCrearCiclo(clienteId, client) {
  const q = client || db;

  // Buscar ciclo activo
  const { rows } = await q.query(
    `SELECT * FROM ciclos WHERE cliente_id = $1 AND activo = true LIMIT 1`,
    [clienteId]
  );

  if (rows.length > 0) {
    const ciclo = rows[0];

    // Verificar caducidad
    if (new Date() > new Date(ciclo.caduca_en)) {
      // Caducó — cerrar y crear nuevo
      await q.query(
        `UPDATE ciclos SET activo = false, cerrado_en = NOW() WHERE id = $1`,
        [ciclo.id]
      );
      return await crearNuevoCiclo(clienteId, q);
    }

    return ciclo;
  }

  return await crearNuevoCiclo(clienteId, q);
}

async function crearNuevoCiclo(clienteId, q) {
  // Obtener número de ciclo siguiente
  const { rows: prev } = await q.query(
    `SELECT COALESCE(MAX(numero_ciclo), 0) + 1 AS siguiente FROM ciclos WHERE cliente_id = $1`,
    [clienteId]
  );
  const numeroCiclo = prev[0].siguiente;

  const { rows } = await q.query(
    `INSERT INTO ciclos (cliente_id, numero_ciclo, sellos_actuales, activo)
     VALUES ($1, $2, 0, true)
     RETURNING *`,
    [clienteId, numeroCiclo]
  );
  return rows[0];
}

/**
 * Registra una visita y aplica la lógica de sellos.
 * Retorna el estado actualizado del cliente.
 */
async function registrarVisita({ clienteId, sucursalId, servicioId, agendaproCitaId, montoCobrado, creadoPor }) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Evitar duplicados del webhook
    if (agendaproCitaId) {
      const { rows: dup } = await client.query(
        `SELECT id FROM visitas WHERE agendapro_cita_id = $1`,
        [agendaproCitaId]
      );
      if (dup.length > 0) {
        await client.query('ROLLBACK');
        return { duplicado: true, visita_id: dup[0].id };
      }
    }

    // Verificar que el servicio suma sello
    const { rows: servRows } = await client.query(
      `SELECT * FROM servicios WHERE id = $1 AND suma_sello = true AND activo = true`,
      [servicioId]
    );
    if (servRows.length === 0) throw new Error('El servicio no suma sello o no existe');
    const servicio = servRows[0];

    // Verificar que no hay canje disponible sin aplicar (el cliente debe canjearlo primero)
    const { rows: canjesPend } = await client.query(
      `SELECT id FROM canjes WHERE cliente_id = $1 AND estado = 'disponible'`,
      [clienteId]
    );

    // Obtener o crear ciclo activo
    const ciclo = await obtenerOCrearCiclo(clienteId, client);

    // Calcular nuevo número de sello
    const nuevoSello = ciclo.sellos_actuales + 1;

    // Registrar la visita
    const { rows: visitaRows } = await client.query(
      `INSERT INTO visitas
        (cliente_id, ciclo_id, sucursal_id, servicio_id, agendapro_cita_id,
         numero_sello, monto_cobrado, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [clienteId, ciclo.id, sucursalId, servicioId, agendaproCitaId || null,
       nuevoSello, montoCobrado || servicio.precio_base, creadoPor || 'sistema']
    );
    const visita = visitaRows[0];

    // Actualizar sellos en el ciclo
    await client.query(
      `UPDATE ciclos SET sellos_actuales = $1 WHERE id = $2`,
      [nuevoSello, ciclo.id]
    );

    // Verificar si alcanzó un umbral de recompensa
    let recompensaGenerada = null;
    const umbral = REGLAS.umbrales.find(u => u.en_visita === nuevoSello);

    if (umbral) {
      // Obtener precio del servicio de recompensa
      const precioRecompensa = umbral.tipo === 'corte_gratis'
        ? await getPrecioServicio('Corte de cabello', client)
        : await getPrecioServicio('Paquete corte+barba', client);

      const { rows: canjeRows } = await client.query(
        `INSERT INTO canjes
          (cliente_id, ciclo_id, tipo_recompensa, numero_visita, descripcion, monto_valor, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'disponible')
         RETURNING *`,
        [clienteId, ciclo.id, umbral.tipo, umbral.en_visita, umbral.descripcion, precioRecompensa]
      );
      recompensaGenerada = canjeRows[0];

      // Si fue la visita 11, cerrar el ciclo al canjear
    }

    await client.query('COMMIT');

    return {
      duplicado:            false,
      visita,
      ciclo_id:             ciclo.id,
      sellos_actuales:      nuevoSello,
      recompensa_generada:  recompensaGenerada,
      canje_pendiente:      canjesPend.length > 0,
    };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Aplica una recompensa disponible (el cliente viene a cobrarla).
 */
async function aplicarCanje(canjeId, sucursalId) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT k.*, c.id as ciclo_id_ref FROM canjes k
       JOIN ciclos c ON c.id = k.ciclo_id
       WHERE k.id = $1 AND k.estado = 'disponible'`,
      [canjeId]
    );
    if (rows.length === 0) throw new Error('Canje no encontrado o ya aplicado');
    const canje = rows[0];

    // Marcar canje como aplicado
    await client.query(
      `UPDATE canjes SET estado = 'aplicado', aplicado_en = NOW() WHERE id = $1`,
      [canjeId]
    );

    // Si fue la visita 11, cerrar ciclo e iniciar uno nuevo
    if (canje.numero_visita === 11) {
      await client.query(
        `UPDATE ciclos SET activo = false, cerrado_en = NOW() WHERE id = $1`,
        [canje.ciclo_id]
      );
      await crearNuevoCiclo(canje.cliente_id, client);
    }

    await client.query('COMMIT');
    return { ok: true, canje };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Consulta el estado completo de un cliente por QR o teléfono.
 */
async function estadoCliente(identificador, tipo = 'qr') {
  const campo = tipo === 'telefono' ? 'telefono' : 'qr_code';

  const { rows: clienteRows } = await db.query(
    `SELECT id, nombre, telefono, email, qr_code, creado_en FROM clientes WHERE ${campo} = $1 AND activo = true`,
    [identificador]
  );
  if (clienteRows.length === 0) return null;
  const cliente = clienteRows[0];

  // Ciclo activo
  const { rows: cicloRows } = await db.query(
    `SELECT * FROM ciclos WHERE cliente_id = $1 AND activo = true LIMIT 1`,
    [cliente.id]
  );
  const ciclo = cicloRows[0] || null;

  // Caducidad
  const caducado = ciclo && new Date() > new Date(ciclo.caduca_en);

  // Recompensa disponible
  const { rows: canjeRows } = await db.query(
    `SELECT * FROM canjes WHERE cliente_id = $1 AND estado = 'disponible' ORDER BY generado_en ASC LIMIT 1`,
    [cliente.id]
  );

  // Historial reciente
  const { rows: historial } = await db.query(
    `SELECT v.fecha, v.numero_sello, v.es_canje, s.nombre as servicio, su.nombre as sucursal
     FROM visitas v
     JOIN servicios s ON s.id = v.servicio_id
     JOIN sucursales su ON su.id = v.sucursal_id
     WHERE v.cliente_id = $1
     ORDER BY v.fecha DESC LIMIT 10`,
    [cliente.id]
  );

  return {
    cliente,
    sellos: {
      actuales:   caducado ? 0 : (ciclo?.sellos_actuales || 0),
      caduca_en:  ciclo?.caduca_en || null,
      caducado,
      proximo_umbral: proximoUmbral(caducado ? 0 : (ciclo?.sellos_actuales || 0)),
    },
    recompensa_disponible: canjeRows[0] || null,
    historial,
  };
}

function proximoUmbral(sellosActuales) {
  for (const u of REGLAS.umbrales) {
    if (sellosActuales < u.en_visita) {
      return {
        en_visita:    u.en_visita,
        faltan:       u.en_visita - sellosActuales,
        descripcion:  u.descripcion,
      };
    }
  }
  return null;
}

async function getPrecioServicio(nombre, client) {
  const q = client || db;
  const { rows } = await q.query(
    `SELECT precio_base FROM servicios WHERE nombre = $1 LIMIT 1`,
    [nombre]
  );
  return rows[0]?.precio_base || 0;
}

module.exports = { registrarVisita, aplicarCanje, estadoCliente, obtenerOCrearCiclo, REGLAS };

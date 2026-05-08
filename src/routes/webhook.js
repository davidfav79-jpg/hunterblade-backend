const router  = require('express').Router();
const db      = require('../db');
const { registrarVisita, obtenerOCrearCiclo } = require('../services/sellos');

/**
 * POST /api/webhook/agendapro
 *
 * AgendaPro envía este evento cuando una cita cambia de estado.
 * Solo procesamos el estado "completada".
 *
 * Payload esperado (adaptar según documentación de AgendaPro):
 * {
 *   event:        "appointment.completed",
 *   appointment:  {
 *     id:         "ap_xxx",
 *     client: {
 *       id:       "cl_xxx",
 *       name:     "Juan Pérez",
 *       phone:    "4421234567",
 *       email:    "juan@mail.com"
 *     },
 *     service: {
 *       id:       "sv_xxx",
 *       name:     "Corte de cabello",
 *       price:    180
 *     },
 *     location_id: "loc_xxx"
 *   }
 * }
 */
router.post('/agendapro', async (req, res) => {
  const { event, appointment } = req.body;

  // Solo procesar citas completadas
  if (event !== 'appointment.completed') {
    return res.json({ ok: true, ignorado: true, razon: 'evento no relevante' });
  }

  if (!appointment) {
    return res.status(400).json({ error: 'payload inválido' });
  }

  try {
    const { id: citaId, client: apCliente, service: apServicio, location_id } = appointment;

    // 1. Buscar o crear cliente
    let cliente;
    const { rows: existente } = await db.query(
      `SELECT * FROM clientes WHERE agendapro_cliente_id = $1 OR telefono = $2 LIMIT 1`,
      [apCliente.id, apCliente.phone]
    );

    if (existente.length > 0) {
      cliente = existente[0];
      // Actualizar el agendapro_cliente_id si no lo tenía
      if (!cliente.agendapro_cliente_id) {
        await db.query(
          `UPDATE clientes SET agendapro_cliente_id = $1 WHERE id = $2`,
          [apCliente.id, cliente.id]
        );
      }
    } else {
      const { rows } = await db.query(
        `INSERT INTO clientes (nombre, telefono, email, agendapro_cliente_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [apCliente.name, apCliente.phone, apCliente.email || null, apCliente.id]
      );
      cliente = rows[0];
    }

    // 2. Buscar servicio por agendapro_servicio_id o por nombre
    const { rows: servicioRows } = await db.query(
      `SELECT * FROM servicios
       WHERE (agendapro_servicio_id = $1 OR nombre ILIKE $2)
         AND suma_sello = true AND activo = true
       LIMIT 1`,
      [apServicio.id, `%${apServicio.name}%`]
    );

    if (servicioRows.length === 0) {
      // Servicio no elegible — ignorar silenciosamente
      return res.json({ ok: true, ignorado: true, razon: 'servicio no suma sello' });
    }
    const servicio = servicioRows[0];

    // 3. Buscar sucursal por location_id de AgendaPro (o usar la default)
    const { rows: sucRows } = await db.query(
      `SELECT id FROM sucursales WHERE activa = true LIMIT 1`
    );
    const sucursalId = sucRows[0]?.id;
    if (!sucursalId) return res.status(500).json({ error: 'No hay sucursal activa' });

    // 4. Registrar visita
    const resultado = await registrarVisita({
      clienteId:        cliente.id,
      sucursalId,
      servicioId:       servicio.id,
      agendaproCitaId:  citaId,
      montoCobrado:     apServicio.price || servicio.precio_base,
      creadoPor:        'agendapro',
    });

    if (resultado.duplicado) {
      return res.json({ ok: true, ignorado: true, razon: 'cita ya registrada' });
    }

    res.json({
      ok: true,
      cliente_id:           cliente.id,
      sellos_actuales:      resultado.sellos_actuales,
      recompensa_generada:  resultado.recompensa_generada,
    });

  } catch (err) {
    console.error('Webhook AgendaPro error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

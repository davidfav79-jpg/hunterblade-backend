const router = require('express').Router();
const db     = require('../db');
const { estadoCliente } = require('../services/sellos');

// GET /api/clientes/qr/:codigo — consulta por QR (el barbero escanea)
router.get('/qr/:codigo', async (req, res) => {
  try {
    const estado = await estadoCliente(req.params.codigo, 'qr');
    if (!estado) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(estado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clientes/tel/:telefono — consulta por teléfono
router.get('/tel/:telefono', async (req, res) => {
  try {
    const estado = await estadoCliente(req.params.telefono, 'telefono');
    if (!estado) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(estado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clientes — registrar nuevo cliente
router.post('/', async (req, res) => {
  const { nombre, telefono, email, agendapro_cliente_id } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'nombre y telefono son requeridos' });

  try {
    const { rows } = await db.query(
      `INSERT INTO clientes (nombre, telefono, email, agendapro_cliente_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING *`,
      [nombre, telefono, email || null, agendapro_cliente_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

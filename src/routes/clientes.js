const router = require('express').Router();
const db     = require('../db');
const { estadoCliente } = require('../services/sellos');

// GET /api/clientes/buscar?q=... — búsqueda por nombre, teléfono o email
router.get('/buscar', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.status(400).json({ error: 'Mínimo 2 caracteres' });
  try {
    const { rows } = await db.query(
      `SELECT id, nombre, telefono, email, qr_code, creado_en
       FROM clientes
       WHERE activo = true AND (
         telefono ILIKE $1 OR
         nombre   ILIKE $1 OR
         email    ILIKE $1
       )
       ORDER BY nombre ASC
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clientes/qr/:codigo — consulta por QR
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
    const { rows } = await db.query(
      `SELECT id FROM clientes WHERE telefono = $1 AND activo = true`,
      [req.params.telefono]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (rows.length === 1) {
      const estado = await estadoCliente(req.params.telefono, 'telefono');
      return res.json(estado);
    }
    const { rows: clientes } = await db.query(
      `SELECT id, nombre, telefono, email, qr_code, creado_en
       FROM clientes WHERE telefono = $1 AND activo = true ORDER BY nombre ASC`,
      [req.params.telefono]
    );
    return res.json({ multiples: true, clientes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clientes/id/:id — consulta por ID
router.get('/id/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT qr_code FROM clientes WHERE id = $1 AND activo = true`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    const estado = await estadoCliente(rows[0].qr_code, 'qr');
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
       RETURNING *`,
      [nombre, telefono, email || null, agendapro_cliente_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clientes/:id — editar nombre, teléfono y/o email
router.put('/:id', async (req, res) => {
  const { nombre, telefono, email } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'nombre y telefono son requeridos' });
  try {
    const { rows } = await db.query(
      `UPDATE clientes
       SET nombre = $1, telefono = $2, email = $3
       WHERE id = $4 AND activo = true
       RETURNING id, nombre, telefono, email`,
      [nombre, telefono, email || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clientes/:id — soft delete (marca activo = false)
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE clientes SET activo = false WHERE id = $1 AND activo = true RETURNING id`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

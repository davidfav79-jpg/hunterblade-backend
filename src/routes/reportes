const router = require('express').Router();
const db = require('../db');

// GET /api/reportes/visitas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/visitas', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
  try {
    const { rows } = await db.query(
      `SELECT
        v.id, v.fecha, v.numero_sello, v.es_canje,
        c.id as cliente_id, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
        s.nombre as servicio,
        su.nombre as sucursal
       FROM visitas v
       JOIN clientes c ON c.id = v.cliente_id
       JOIN servicios s ON s.id = v.servicio_id
       JOIN sucursales su ON su.id = v.sucursal_id
       WHERE v.fecha::date BETWEEN $1 AND $2
       ORDER BY v.fecha DESC`,
      [desde, hasta]
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reportes/canjes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/canjes', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
  try {
    const { rows } = await db.query(
      `SELECT
        k.id, k.aplicado_en, k.descripcion, k.monto_valor, k.tipo_recompensa,
        c.nombre as cliente_nombre, c.telefono as cliente_telefono
       FROM canjes k
       JOIN clientes c ON c.id = k.cliente_id
       WHERE k.estado = 'aplicado'
         AND k.aplicado_en::date BETWEEN $1 AND $2
       ORDER BY k.aplicado_en DESC`,
      [desde, hasta]
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reportes/clientes-nuevos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/clientes-nuevos', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
  try {
    const { rows } = await db.query(
      `SELECT id, nombre, telefono, email, creado_en
       FROM clientes
       WHERE activo = true
         AND creado_en::date BETWEEN $1 AND $2
       ORDER BY creado_en DESC`,
      [desde, hasta]
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reportes/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Resumen ejecutivo para email automático
router.get('/resumen', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
  try {
    const [visRes, canRes, cliRes] = await Promise.all([
      db.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT cliente_id) as unicos
         FROM visitas WHERE fecha::date BETWEEN $1 AND $2`,
        [desde, hasta]
      ),
      db.query(
        `SELECT COUNT(*) as total, COALESCE(SUM(monto_valor),0) as valor_total
         FROM canjes WHERE estado='aplicado' AND aplicado_en::date BETWEEN $1 AND $2`,
        [desde, hasta]
      ),
      db.query(
        `SELECT COUNT(*) as total FROM clientes
         WHERE activo=true AND creado_en::date BETWEEN $1 AND $2`,
        [desde, hasta]
      ),
    ]);
    res.json({
      periodo: { desde, hasta },
      visitas: {
        total: parseInt(visRes.rows[0].total),
        clientes_unicos: parseInt(visRes.rows[0].unicos),
      },
      canjes: {
        total: parseInt(canRes.rows[0].total),
        valor_total: parseFloat(canRes.rows[0].valor_total),
      },
      clientes_nuevos: parseInt(cliRes.rows[0].total),
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

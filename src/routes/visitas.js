const router = require('express').Router();
const { registrarVisita } = require('../services/sellos');

// POST /api/visitas — registrar visita manualmente desde el admin
router.post('/', async (req, res) => {
  const { cliente_id, sucursal_id, servicio_id, monto_cobrado } = req.body;
  if (!cliente_id || !sucursal_id || !servicio_id) {
    return res.status(400).json({ error: 'cliente_id, sucursal_id y servicio_id son requeridos' });
  }

  try {
    const resultado = await registrarVisita({
      clienteId:   cliente_id,
      sucursalId:  sucursal_id,
      servicioId:  servicio_id,
      montoCobrado: monto_cobrado,
      creadoPor:   'admin',
    });
    res.status(201).json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

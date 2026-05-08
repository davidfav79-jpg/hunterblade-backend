const router = require('express').Router();
const { aplicarCanje } = require('../services/sellos');

// POST /api/canjes/:id/aplicar — el barbero aplica el canje cuando el cliente llega a cobrar
router.post('/:id/aplicar', async (req, res) => {
  const { sucursal_id } = req.body;
  if (!sucursal_id) return res.status(400).json({ error: 'sucursal_id es requerido' });

  try {
    const resultado = await aplicarCanje(req.params.id, sucursal_id);
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

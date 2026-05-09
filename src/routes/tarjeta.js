const router = require('express').Router();
const { estadoCliente } = require('../services/sellos');

router.get('/:qr_code', async (req, res) => {
  try {
    const estado = await estadoCliente(req.params.qr_code, 'qr');
    if (!estado) return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Hunter Blade</title>
      <style>body{background:#0a0a0a;color:#f0ede6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px}</style>
      </head>
      <body><div><div style="font-size:48px;margin-bottom:16px">✂</div><p>Tarjeta no encontrada</p></div></body>
      </html>
    `);
    res.json(estado);
  } catch(err) {
    res.status(500).send('Error');
  }
});

module.exports = router;

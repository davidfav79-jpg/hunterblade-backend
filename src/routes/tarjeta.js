const router  = require('express').Router();
const path    = require('path');
const { estadoCliente } = require('../services/sellos');

router.get('/:qr_code', async (req, res) => {
  try {
    const estado = await estadoCliente(req.params.qr_code, 'qr');
    if (!estado) return res.status(404).sendFile(path.join(__dirname, '../../public/tarjeta.html'));
    res.sendFile(path.join(__dirname, '../../public/tarjeta.html'));
  } catch(err) {
    res.status(500).send('Error');
  }
});

module.exports = router;

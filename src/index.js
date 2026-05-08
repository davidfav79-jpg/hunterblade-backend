require('dotenv').config();
const express = require('express');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

app.use('/api/clientes',  require('./routes/clientes'));
app.use('/api/visitas',   require('./routes/visitas'));
app.use('/api/canjes',    require('./routes/canjes'));
app.use('/api/webhook',   require('./routes/webhook'));

app.get('/health', (_, res) => res.json({ ok: true, version: '1.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hunter Blade API corriendo en :${PORT}`));

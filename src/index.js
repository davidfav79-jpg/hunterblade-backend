require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/clientes',  require('./routes/clientes'));
app.use('/api/visitas',   require('./routes/visitas'));
app.use('/api/canjes',    require('./routes/canjes'));
app.use('/api/webhook',   require('./routes/webhook'));

app.get('/health', (_, res) => res.json({ ok: true, version: '1.0.0' }));

app.get('/', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hunter Blade API corriendo en :${PORT}`));

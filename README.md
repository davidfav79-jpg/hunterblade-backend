# Hunter Blade — Sistema de Fidelización
## Fase 1: Tarjeta de Sellos

---

## Reglas de negocio

| Visita | Recompensa               |
|--------|--------------------------|
| 7      | Corte de cabello gratis  |
| 11     | Paquete corte + barba gratis |

- Servicios elegibles: Corte de cabello, Corte de niño, Arreglo de barba, Paquete corte+barba
- Caducidad: 365 días desde la primera visita del ciclo
- El cliente puede canjear sin consumir otro servicio
- Después de cada canje el contador reinicia a 0

---

## Setup

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus datos de PostgreSQL

# 3. Crear la base de datos
createdb hunterblade

# 4. Inicializar el esquema
npm run db:init

# 5. Correr en desarrollo
npm run dev
```

---

## API Endpoints

### Consultar estado de cliente (por QR)
```
GET /api/clientes/qr/:codigo
```
Respuesta:
```json
{
  "cliente": { "id": "...", "nombre": "Juan Pérez", "qr_code": "..." },
  "sellos": {
    "actuales": 4,
    "caduca_en": "2026-03-15T00:00:00Z",
    "caducado": false,
    "proximo_umbral": { "en_visita": 7, "faltan": 3, "descripcion": "Corte de cabello gratis" }
  },
  "recompensa_disponible": null,
  "historial": [...]
}
```

### Consultar estado de cliente (por teléfono)
```
GET /api/clientes/tel/:telefono
```

### Registrar cliente nuevo
```
POST /api/clientes
Body: { "nombre": "Juan Pérez", "telefono": "4421234567", "email": "..." }
```

### Registrar visita manualmente (desde el admin)
```
POST /api/visitas
Body: {
  "cliente_id":   "uuid",
  "sucursal_id":  "uuid",
  "servicio_id":  "uuid",
  "monto_cobrado": 180
}
```

### Aplicar canje (cliente viene a cobrar su regalo)
```
POST /api/canjes/:id/aplicar
Body: { "sucursal_id": "uuid" }
```

### Webhook AgendaPro (automático)
```
POST /api/webhook/agendapro
```
Se configura en el panel de AgendaPro apuntando a:
`https://tu-dominio.com/api/webhook/agendapro`

---

## Flujo completo

1. Cliente agenda en AgendaPro → cita completada → webhook llega automáticamente
2. Backend registra visita y actualiza sellos
3. Si llega al umbral 7 u 11 → se genera un canje con estado `disponible`
4. Cliente llega a cobrar → barbero escanea QR → ve recompensa disponible
5. Barbero confirma → `POST /api/canjes/:id/aplicar` → sellos reinician

---

## Próximo paso: Fase 2
- Sistema de puntos por visita y por gasto
- Niveles: Bronce, Plata, Oro, Platino con multiplicadores
- App móvil iOS/Android
- Tarjeta en Apple Wallet y Google Wallet

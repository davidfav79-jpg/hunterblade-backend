-- ============================================
-- HUNTER BLADE — Sistema de Fidelización v1.0
-- Fase 1: Tarjeta de Sellos
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------
-- SUCURSALES
-- --------------------------------------------
CREATE TABLE sucursales (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(100) NOT NULL,
  ciudad        VARCHAR(100) NOT NULL DEFAULT 'Querétaro',
  activa        BOOLEAN NOT NULL DEFAULT true,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------
-- SERVICIOS ELEGIBLES (los 4 que suman sello)
-- --------------------------------------------
CREATE TABLE servicios (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre              VARCHAR(100) NOT NULL,
  precio_base         NUMERIC(10,2) NOT NULL,
  suma_sello          BOOLEAN NOT NULL DEFAULT true,
  agendapro_servicio_id VARCHAR(100),
  activo              BOOLEAN NOT NULL DEFAULT true
);

-- --------------------------------------------
-- CLIENTES
-- --------------------------------------------
CREATE TABLE clientes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre              VARCHAR(150) NOT NULL,
  telefono            VARCHAR(20) UNIQUE NOT NULL,
  email               VARCHAR(150) UNIQUE,
  agendapro_cliente_id VARCHAR(100) UNIQUE,
  qr_code             VARCHAR(100) UNIQUE NOT NULL DEFAULT uuid_generate_v4()::text,
  activo              BOOLEAN NOT NULL DEFAULT true,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------
-- CICLOS DE SELLOS
-- Cada vez que un cliente canjea, se crea un nuevo ciclo
-- --------------------------------------------
CREATE TABLE ciclos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  numero_ciclo    INT NOT NULL DEFAULT 1,         -- 1, 2, 3... histórico
  sellos_actuales INT NOT NULL DEFAULT 0,         -- 0 a 11
  iniciado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  caduca_en       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
  cerrado_en      TIMESTAMPTZ,                    -- cuando se canjeó la visita 11
  activo          BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(cliente_id, numero_ciclo)
);

-- --------------------------------------------
-- VISITAS
-- Cada cita completada que suma sello
-- --------------------------------------------
CREATE TABLE visitas (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id            UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  ciclo_id              UUID NOT NULL REFERENCES ciclos(id),
  sucursal_id           UUID NOT NULL REFERENCES sucursales(id),
  servicio_id           UUID NOT NULL REFERENCES servicios(id),
  agendapro_cita_id     VARCHAR(100) UNIQUE,       -- para evitar duplicados del webhook
  numero_sello          INT NOT NULL,              -- sello 1, 2, ... 11
  es_canje              BOOLEAN NOT NULL DEFAULT false, -- true si fue visita de recompensa
  monto_cobrado         NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_descontado      NUMERIC(10,2) NOT NULL DEFAULT 0,
  fecha                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por            VARCHAR(50) NOT NULL DEFAULT 'sistema' -- 'agendapro', 'admin', 'sistema'
);

-- --------------------------------------------
-- CANJES
-- Registro de cada recompensa entregada
-- --------------------------------------------
CREATE TABLE canjes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  ciclo_id        UUID NOT NULL REFERENCES ciclos(id),
  visita_id       UUID REFERENCES visitas(id),    -- la visita en que se aplicó
  tipo_recompensa VARCHAR(20) NOT NULL,            -- 'corte_gratis' | 'paquete_gratis'
  numero_visita   INT NOT NULL,                   -- 7 u 11
  descripcion     VARCHAR(200) NOT NULL,
  monto_valor     NUMERIC(10,2) NOT NULL,          -- valor económico del regalo
  estado          VARCHAR(20) NOT NULL DEFAULT 'disponible', -- 'disponible' | 'aplicado' | 'expirado'
  generado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aplicado_en     TIMESTAMPTZ
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_clientes_telefono     ON clientes(telefono);
CREATE INDEX idx_clientes_qr           ON clientes(qr_code);
CREATE INDEX idx_clientes_agendapro    ON clientes(agendapro_cliente_id);
CREATE INDEX idx_ciclos_cliente_activo ON ciclos(cliente_id) WHERE activo = true;
CREATE INDEX idx_visitas_cliente       ON visitas(cliente_id);
CREATE INDEX idx_visitas_agendapro     ON visitas(agendapro_cita_id);
CREATE INDEX idx_canjes_cliente_estado ON canjes(cliente_id, estado);

-- ============================================
-- FUNCIÓN: obtener ciclo activo de un cliente
-- ============================================
CREATE OR REPLACE FUNCTION ciclo_activo(p_cliente_id UUID)
RETURNS TABLE(
  ciclo_id        UUID,
  sellos_actuales INT,
  caduca_en       TIMESTAMPTZ,
  caducado        BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.sellos_actuales,
    c.caduca_en,
    (NOW() > c.caduca_en) AS caducado
  FROM ciclos c
  WHERE c.cliente_id = p_cliente_id
    AND c.activo = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCIÓN: calcular recompensa disponible
-- Devuelve qué recompensa tiene disponible el cliente
-- ============================================
CREATE OR REPLACE FUNCTION recompensa_disponible(p_cliente_id UUID)
RETURNS TABLE(
  tiene_recompensa  BOOLEAN,
  tipo_recompensa   VARCHAR,
  numero_visita     INT,
  descripcion       VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    true,
    k.tipo_recompensa,
    k.numero_visita,
    k.descripcion
  FROM canjes k
  WHERE k.cliente_id = p_cliente_id
    AND k.estado = 'disponible'
  ORDER BY k.generado_en ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DATOS INICIALES
-- ============================================
INSERT INTO sucursales (nombre, ciudad) VALUES
  ('Hunter Blade Querétaro', 'Querétaro');

INSERT INTO servicios (nombre, precio_base, suma_sello) VALUES
  ('Corte de cabello',    180.00, true),
  ('Corte de niño',       150.00, true),
  ('Arreglo de barba',    120.00, true),
  ('Paquete corte+barba', 280.00, true);

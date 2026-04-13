-- ============================================================
-- Nexus Ops — Migration 002: Carpet 3D WebAR
-- ============================================================
-- Tabelas: carpet_models, carpet_sizes
-- Storage bucket: carpet-assets (público para leitura)
-- RLS: habilitado — acesso apenas via service_role (server-side)
-- ============================================================

-- ── Modelos de tapete ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carpet_models (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  sku_base     TEXT        NOT NULL,
  shape        TEXT        NOT NULL DEFAULT 'rectangular',  -- rectangular | oval | round
  image_path   TEXT,                                        -- path no bucket carpet-assets
  image_url    TEXT,                                        -- URL pública da imagem
  glb_path     TEXT,                                        -- path no bucket carpet-assets
  glb_url      TEXT,                                        -- URL pública do GLB
  status       TEXT        NOT NULL DEFAULT 'pending',      -- pending | processing | ready | error
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE carpet_models ENABLE ROW LEVEL SECURITY;

-- ── Tamanhos disponíveis por modelo ─────────────────────────
CREATE TABLE IF NOT EXISTS carpet_sizes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id     UUID        NOT NULL REFERENCES carpet_models(id) ON DELETE CASCADE,
  size_name    TEXT        NOT NULL,    -- ex: "150x200", "300x400"
  width_cm     INTEGER     NOT NULL CHECK (width_cm > 0),
  height_cm    INTEGER     NOT NULL CHECK (height_cm > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE carpet_sizes ENABLE ROW LEVEL SECURITY;

-- ── Index para busca por model_id ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_carpet_sizes_model_id ON carpet_sizes(model_id);

-- ── Storage bucket carpet-assets (público) ──────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'carpet-assets',
  'carpet-assets',
  true,
  15728640,   -- 15 MB por arquivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'model/gltf-binary']
)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública dos assets (imagens + GLBs para model-viewer e WebAR)
CREATE POLICY "carpet_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'carpet-assets');

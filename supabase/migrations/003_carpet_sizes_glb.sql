-- Adiciona colunas de GLB por tamanho na tabela carpet_sizes
ALTER TABLE carpet_sizes ADD COLUMN IF NOT EXISTS glb_path TEXT;
ALTER TABLE carpet_sizes ADD COLUMN IF NOT EXISTS glb_url  TEXT;

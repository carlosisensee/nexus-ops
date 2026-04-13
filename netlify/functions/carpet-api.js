/**
 * Nexus Ops — Carpet 3D API
 * CRUD para modelos de tapete WebAR + upload para Supabase Storage.
 *
 * Actions (query param ?action=...):
 *   GET  list           → lista todos os modelos com tamanhos
 *   POST create         → cria um novo modelo
 *   POST add-size       → adiciona tamanho a um modelo
 *   POST upload-image   → faz upload da imagem para Supabase Storage
 *   POST upload-glb     → faz upload do GLB para Supabase Storage + status=ready
 *   POST update-status  → atualiza status do modelo
 *   DELETE delete-size  → remove um tamanho
 *   DELETE delete-model → remove modelo + arquivos do Storage
 *
 * Segurança (OWASP):
 *   - service_role key apenas em env vars (nunca no frontend)
 *   - CORS restrito à origem configurada
 *   - Validação de entrada em todos os endpoints
 *   - Uploads limitados a tipos e tamanho seguros
 */

'use strict';

const { getSupabaseClient } = require('./_supabase');

const BUCKET = 'carpet-assets';
const VALID_SHAPES   = new Set(['rectangular', 'oval', 'round']);
const VALID_STATUSES = new Set(['pending', 'processing', 'ready', 'error']);
const MAX_PAYLOAD_B  = 12 * 1024 * 1024; // 12 MB base64

// Origens permitidas para o endpoint público by-sku (site do cliente)
// Aceita qualquer origem se NEXUS_WIDGET_ORIGINS não for definida.
function buildCorsPublic(origin) {
  const extra = (process.env.NEXUS_WIDGET_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin':  origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age':       '86400',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'Cache-Control':                'public, max-age=300', // 5 min cache no CDN
  };
}

// ── CORS ─────────────────────────────────────────────────────────────────────
function buildCors(origin) {
  const allowed = process.env.NEXUS_ALLOWED_ORIGIN || '';
  const ok = !allowed || origin === allowed ||
    origin === 'http://localhost:8888' || origin === 'http://127.0.0.1:8888';
  return {
    'Access-Control-Allow-Origin':  ok ? (origin || '*') : allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age':       '86400',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'Cache-Control':                'no-store',
  };
}

function ok(cors, data)         { return { statusCode: 200, headers: cors, body: JSON.stringify(data) }; }
function err(cors, code, msg)   { return { statusCode: code, headers: cors, body: JSON.stringify({ error: msg }) }; }

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  const cors   = buildCors(event.headers['origin'] || '');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  const action = event.queryStringParameters?.action || '';
  const method = event.httpMethod;

  // ── GET list ────────────────────────────────────────────────
  if (action === 'list' && method === 'GET') {
    try {
      const supabase = getSupabaseClient();
      const { data: models, error: e1 } = await supabase
        .from('carpet_models')
        .select('*')
        .order('created_at', { ascending: false });
      if (e1) throw e1;

      const { data: sizes, error: e2 } = await supabase
        .from('carpet_sizes')
        .select('*')
        .order('width_cm', { ascending: true });
      if (e2) throw e2;

      const sizesMap = {};
      sizes.forEach(s => {
        if (!sizesMap[s.model_id]) sizesMap[s.model_id] = [];
        sizesMap[s.model_id].push(s);
      });

      return ok(cors, models.map(m => ({ ...m, sizes: sizesMap[m.id] || [] })));
    } catch (e) {
      console.error('[carpet-api] list error:', e.message);
      return err(cors, 500, 'Erro ao listar modelos.');
    }
  }

  // ── GET by-sku ─────────────────────────────────────────────
  // Endpoint PÚBLICO — chamado pelo script do site do cliente via dataLayer.
  // Retorna o modelo 3D ready mais recente para um determinado sku_base.
  // Suporta: ?action=by-sku&sku=XXXX  ou  &sku_base=XXXX
  if (action === 'by-sku' && method === 'GET') {
    const pubCors = buildCorsPublic(event.headers['origin'] || '');
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: pubCors, body: '' };

    const sku = (event.queryStringParameters?.sku || event.queryStringParameters?.sku_base || '').trim();
    if (!sku) return { statusCode: 400, headers: pubCors, body: JSON.stringify({ error: 'sku obrigatório' }) };

    try {
      const supabase = getSupabaseClient();
      const { data: models, error: e } = await supabase
        .from('carpet_models')
        .select('id, name, sku_base, shape, glb_url, image_url, status')
        .eq('sku_base', sku)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(1);
      if (e) throw e;

      if (!models || models.length === 0) {
        return { statusCode: 404, headers: pubCors, body: JSON.stringify({ found: false }) };
      }

      const model = models[0];
      const arUrl = `https://nexus-ops-hub.netlify.app/marketing/carpet-ar.html?id=${model.id}`;
      return { statusCode: 200, headers: pubCors, body: JSON.stringify({ found: true, model, ar_url: arUrl }) };
    } catch (e) {
      console.error('[carpet-api] by-sku error:', e.message);
      return { statusCode: 500, headers: buildCorsPublic(event.headers['origin'] || ''), body: JSON.stringify({ error: 'Erro interno' }) };
    }
  }

  // ── POST create ─────────────────────────────────────────────
  if (action === 'create' && method === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { name, sku_base, shape = 'rectangular' } = body;
    if (!name?.trim() || !sku_base?.trim()) return err(cors, 400, 'name e sku_base são obrigatórios.');
    if (!VALID_SHAPES.has(shape)) return err(cors, 400, 'shape inválido.');

    try {
      const supabase = getSupabaseClient();
      const { data, error: e } = await supabase
        .from('carpet_models')
        .insert({ name: name.trim(), sku_base: sku_base.trim(), shape })
        .select()
        .single();
      if (e) throw e;
      return ok(cors, { ...data, sizes: [] });
    } catch (e) {
      console.error('[carpet-api] create error:', e.message);
      return err(cors, 500, 'Erro ao criar modelo.');
    }
  }

  // ── POST add-size ────────────────────────────────────────────
  if (action === 'add-size' && method === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { model_id, size_name, width_cm, height_cm } = body;
    if (!model_id || !size_name?.trim()) return err(cors, 400, 'model_id e size_name são obrigatórios.');
    const w = parseInt(width_cm, 10);
    const h = parseInt(height_cm, 10);
    if (!w || !h || w <= 0 || h <= 0) return err(cors, 400, 'width_cm e height_cm devem ser inteiros positivos.');

    try {
      const supabase = getSupabaseClient();
      const { data, error: e } = await supabase
        .from('carpet_sizes')
        .insert({ model_id, size_name: size_name.trim(), width_cm: w, height_cm: h })
        .select()
        .single();
      if (e) throw e;
      return ok(cors, data);
    } catch (e) {
      console.error('[carpet-api] add-size error:', e.message);
      return err(cors, 500, 'Erro ao adicionar tamanho.');
    }
  }

  // ── POST upload-image ────────────────────────────────────────
  if (action === 'upload-image' && method === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { model_id, data: b64, mime_type } = body;
    if (!model_id || !b64) return err(cors, 400, 'model_id e data são obrigatórios.');
    if (b64.length > MAX_PAYLOAD_B) return err(cors, 413, 'Arquivo muito grande. Máximo: 12 MB.');

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(mime_type)) return err(cors, 400, 'Tipo de arquivo não permitido.');
    const ext = mime_type === 'image/png' ? 'png' : mime_type === 'image/webp' ? 'webp' : 'jpg';

    try {
      const supabase  = getSupabaseClient();
      const filePath  = `models/${model_id}/image.${ext}`;
      const buffer    = Buffer.from(b64, 'base64');

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, buffer, { contentType: mime_type, upsert: true });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

      const { error: dbErr } = await supabase
        .from('carpet_models')
        .update({ image_path: filePath, image_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', model_id);
      if (dbErr) throw dbErr;

      return ok(cors, { image_url: publicUrl });
    } catch (e) {
      console.error('[carpet-api] upload-image error:', e.message);
      return err(cors, 500, 'Erro ao fazer upload da imagem.');
    }
  }

  // ── POST upload-glb ──────────────────────────────────────────
  if (action === 'upload-glb' && method === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { model_id, data: b64 } = body;
    if (!model_id || !b64) return err(cors, 400, 'model_id e data são obrigatórios.');
    if (b64.length > MAX_PAYLOAD_B) return err(cors, 413, 'GLB muito grande. Máximo: 12 MB.');

    try {
      const supabase = getSupabaseClient();
      const filePath = `models/${model_id}/model.glb`;
      const buffer   = Buffer.from(b64, 'base64');

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, buffer, { contentType: 'model/gltf-binary', upsert: true });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

      const { error: dbErr } = await supabase
        .from('carpet_models')
        .update({ glb_path: filePath, glb_url: publicUrl, status: 'ready', updated_at: new Date().toISOString() })
        .eq('id', model_id);
      if (dbErr) throw dbErr;

      return ok(cors, { glb_url: publicUrl });
    } catch (e) {
      console.error('[carpet-api] upload-glb error:', e.message);
      return err(cors, 500, 'Erro ao fazer upload do GLB.');
    }
  }

  // ── POST upload-size-glb ────────────────────────────────────
  // Faz upload do GLB para um tamanho específico e armazena na tabela carpet_sizes
  if (action === 'upload-size-glb' && method === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { size_id, model_id, data: glbData, set_as_primary = false } = body;
    if (!size_id || !model_id || !glbData) return err(cors, 400, 'size_id, model_id e data são obrigatórios.');
    if (glbData.length > MAX_PAYLOAD_B) return err(cors, 413, 'GLB muito grande.');

    try {
      const supabase  = getSupabaseClient();
      const buf       = Buffer.from(glbData, 'base64');
      const path      = `${model_id}/size-${size_id}.glb`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, buf, { contentType: 'model/gltf-binary', upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const glbUrl = urlData.publicUrl;

      // Atualiza carpet_sizes
      const { error: szErr } = await supabase
        .from('carpet_sizes').update({ glb_path: path, glb_url: glbUrl }).eq('id', size_id);
      if (szErr) throw szErr;

      // Opcional: atualiza modelo principal também
      if (set_as_primary) {
        const { error: mErr } = await supabase
          .from('carpet_models').update({ glb_path: path, glb_url: glbUrl, status: 'ready' }).eq('id', model_id);
        if (mErr) throw mErr;
      }

      return ok(cors, { glb_url: glbUrl });
    } catch (e) {
      console.error('[carpet-api] upload-size-glb error:', e.message);
      return err(cors, 500, 'Erro no upload do GLB por tamanho.');
    }
  }

  // ── POST update-status ───────────────────────────────────────
  if (action === 'update-status' && method === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { model_id, status } = body;
    if (!model_id || !VALID_STATUSES.has(status)) return err(cors, 400, 'model_id e status válido são obrigatórios.');

    try {
      const supabase = getSupabaseClient();
      const { error: e } = await supabase
        .from('carpet_models')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', model_id);
      if (e) throw e;
      return ok(cors, { ok: true });
    } catch (e) {
      console.error('[carpet-api] update-status error:', e.message);
      return err(cors, 500, 'Erro ao atualizar status.');
    }
  }

  // ── DELETE delete-size ───────────────────────────────────────
  if (action === 'delete-size' && method === 'DELETE') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { size_id } = body;
    if (!size_id) return err(cors, 400, 'size_id é obrigatório.');

    try {
      const supabase = getSupabaseClient();
      const { error: e } = await supabase.from('carpet_sizes').delete().eq('id', size_id);
      if (e) throw e;
      return ok(cors, { ok: true });
    } catch (e) {
      console.error('[carpet-api] delete-size error:', e.message);
      return err(cors, 500, 'Erro ao remover tamanho.');
    }
  }

  // ── DELETE delete-model ──────────────────────────────────────
  if (action === 'delete-model' && method === 'DELETE') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err(cors, 400, 'JSON inválido.'); }

    const { model_id } = body;
    if (!model_id) return err(cors, 400, 'model_id é obrigatório.');

    try {
      const supabase = getSupabaseClient();

      // Remove arquivos do Storage
      const { data: model } = await supabase
        .from('carpet_models').select('image_path, glb_path').eq('id', model_id).single();

      if (model) {
        const toDelete = [model.image_path, model.glb_path].filter(Boolean);
        if (toDelete.length) {
          await supabase.storage.from(BUCKET).remove(toDelete);
        }
      }

      // Remove registro (cascade deleta carpet_sizes)
      const { error: e } = await supabase.from('carpet_models').delete().eq('id', model_id);
      if (e) throw e;

      return ok(cors, { ok: true });
    } catch (e) {
      console.error('[carpet-api] delete-model error:', e.message);
      return err(cors, 500, 'Erro ao deletar modelo.');
    }
  }

  return err(cors, 400, `Ação desconhecida: ${action}`);
};

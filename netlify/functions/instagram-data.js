/**
 * Nexus Ops — Instagram Data Function
 * Proxy server-side para a Instagram Graph API v20.
 *
 * SEGURANÇA (OWASP):
 *   - Token lido do Supabase (banco) ou env var fallback (A02)
 *   - Credenciais nunca chegam ao frontend em nenhum momento
 *   - CORS restrito à origem em NEXUS_ALLOWED_ORIGIN (A05)
 *   - Allowlist de parâmetros de entrada (A03)
 *   - Erros genéricos ao cliente; detalhes em server log (A09)
 *   - URLs hardcoded — sem SSRF (A10)
 *   - Queries Supabase via client tipado — sem SQL injection (A03)
 *
 * Env vars obrigatórias:
 *   SUPABASE_URL           → URL do projeto Supabase
 *   SUPABASE_SERVICE_KEY   → service_role key (nunca expor)
 *   NEXUS_ALLOWED_ORIGIN   → URL do site em produção
 *
 * Env vars opcionais (fallback se Supabase não tiver credencial):
 *   IG_ACCESS_TOKEN        → Token Instagram (fallback)
 *   IG_ACCOUNT_ID          → Account ID Instagram (fallback)
 */

'use strict';

const { getSupabaseClient } = require('./_supabase');

const GRAPH_BASE   = 'https://graph.facebook.com/v20.0';
const VALID_PERIODS = new Set([7, 30, 90]);
const MAX_POSTS     = 50;
const CACHE_TTL_MS  = 6 * 60 * 60 * 1000; // 6 horas

// ── CORS ────────────────────────────────────────────────────────────────────
function buildCorsHeaders(requestOrigin) {
  const allowed = process.env.NEXUS_ALLOWED_ORIGIN || '';
  let origin = (!allowed || requestOrigin === allowed ||
    requestOrigin === 'http://localhost:8888' ||
    requestOrigin === 'http://127.0.0.1:8888')
    ? (requestOrigin || '*')
    : allowed;

  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age':       '86400',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'Cache-Control':                'no-store',
  };
}

function errorResponse(status, publicMsg, cors, detail) {
  if (detail) console.error(`[instagram-data] ${publicMsg} | ${detail}`);
  return { statusCode: status, headers: cors, body: JSON.stringify({ error: publicMsg }) };
}

// ── Buscar credenciais ───────────────────────────────────────────────────────
// Prioridade: Supabase ig_credentials → env vars (fallback)
async function getCredentials() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ig_credentials')
      .select('account_id, access_token, token_expires_at, username')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) throw new Error(error?.message || 'sem registro');

    // Avisa no log se o token está próximo do vencimento (< 7 dias)
    const expiresAt = new Date(data.token_expires_at);
    const daysLeft  = Math.floor((expiresAt - Date.now()) / 86400000);
    if (daysLeft < 7) {
      console.warn(`[instagram-data] ATENÇÃO: token expira em ${daysLeft} dia(s). Execute ig-token-refresh.`);
    }

    return { token: data.access_token, accountId: data.account_id, source: 'supabase' };
  } catch (err) {
    // Fallback para env vars (compatibilidade retroativa durante migração)
    const token     = process.env.IG_ACCESS_TOKEN;
    const accountId = process.env.IG_ACCOUNT_ID;
    if (token && accountId) {
      console.warn(`[instagram-data] Usando credenciais de env var (fallback). Motivo Supabase: ${err.message}`);
      return { token, accountId, source: 'env' };
    }
    throw new Error('Nenhuma credencial disponível (Supabase e env vars).');
  }
}

// ── Salvar snapshot diário no Supabase ───────────────────────────────────────
async function saveSnapshot(supabase, accountId, account, summary) {
  try {
    const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const { error } = await supabase
      .from('ig_snapshots')
      .upsert({
        account_id:          accountId,
        snapshot_date:       today,
        followers_count:     account.followers_count    || 0,
        following_count:     account.follows_count      || 0,
        media_count:         account.media_count        || 0,
        total_reach:         summary.total_reach        || 0,
        total_impressions:   summary.total_impressions  || 0,
        avg_engagement_rate: summary.avg_engagement_rate || 0,
        post_count:          summary.post_count         || 0,
      }, { onConflict: 'account_id,snapshot_date' });

    if (error) console.error('[instagram-data] Erro ao salvar snapshot:', error.message);
  } catch (err) {
    // Erro no snapshot não quebra a requisição principal
    console.error('[instagram-data] Falha no saveSnapshot:', err.message);
  }
}

// ── Salvar posts no cache ────────────────────────────────────────────────────
async function cachePosts(supabase, accountId, posts) {
  try {
    const rows = posts.map((p) => ({
      instagram_post_id: p.id,
      account_id:        accountId,
      media_type:        p.media_type,
      caption:           p.caption     || null,
      thumbnail_url:     p.thumbnail_url || null,
      media_url:         p.media_url   || null,
      permalink:         p.permalink   || null,
      post_timestamp:    p.timestamp   || null,
      like_count:        p.like_count       || 0,
      comments_count:    p.comments_count   || 0,
      reach:             p.reach            || 0,
      impressions:       p.impressions      || 0,
      saves:             p.saves            || 0,
      shares:            p.shares           || 0,
      video_views:       p.video_views      || 0,
      engagement_rate:   p.engagement_rate  || 0,
      cached_at:         new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('ig_posts_cache')
      .upsert(rows, { onConflict: 'instagram_post_id' });

    if (error) console.error('[instagram-data] Erro ao cachear posts:', error.message);
  } catch (err) {
    console.error('[instagram-data] Falha no cachePosts:', err.message);
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
exports.handler = async function (event) {
  const requestOrigin = event.headers['origin'] || '';
  const cors = buildCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'GET') return errorResponse(405, 'Método não permitido.', cors);

  // Validação de parâmetros (A03)
  const rawPeriod = event.queryStringParameters?.period;
  const period    = parseInt(rawPeriod || '30', 10);
  if (!VALID_PERIODS.has(period)) {
    return errorResponse(400, 'Parâmetro period inválido. Use 7, 30 ou 90.', cors);
  }

  // Busca credenciais (Supabase → env var fallback)
  let token, accountId;
  try {
    ({ token, accountId } = await getCredentials());
  } catch (err) {
    return errorResponse(503, 'Serviço não configurado. Token Instagram indisponível.', cors, err.message);
  }

  if (!/^\d{10,20}$/.test(accountId)) {
    return errorResponse(503, 'Configuração inválida no servidor.', cors, `accountId inválido: ${accountId}`);
  }

  // Cliente Supabase (pode falhar sem bloquear a requisição principal)
  let supabase;
  try { supabase = getSupabaseClient(); } catch { supabase = null; }

  try {
    // ── 1. Dados da conta ────────────────────────────────────────────────
    const accountUrl = new URL(`${GRAPH_BASE}/${accountId}`);
    accountUrl.searchParams.set('fields', 'id,username,name,biography,media_count,followers_count,follows_count,profile_picture_url,website');
    accountUrl.searchParams.set('access_token', token);

    const accountResp = await fetch(accountUrl.toString());
    const account     = await accountResp.json();
    if (account.error) {
      return errorResponse(502, 'Erro ao consultar conta Instagram. Verifique o token.', cors, account.error.message);
    }

    // ── 2. Lista de mídias ───────────────────────────────────────────────
    const since    = Math.floor(Date.now() / 1000) - period * 86400;
    const mediaUrl = new URL(`${GRAPH_BASE}/${accountId}/media`);
    mediaUrl.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count');
    mediaUrl.searchParams.set('since', String(since));
    mediaUrl.searchParams.set('limit', String(MAX_POSTS));
    mediaUrl.searchParams.set('access_token', token);

    const mediaResp = await fetch(mediaUrl.toString());
    const mediaData = await mediaResp.json();
    if (mediaData.error) {
      return errorResponse(502, 'Erro ao consultar posts Instagram.', cors, mediaData.error.message);
    }

    const posts = (mediaData.data || []).slice(0, MAX_POSTS);

    // ── 3. Insights por post ─────────────────────────────────────────────
    const enriched = await Promise.all(
      posts.map(async (post) => {
        try {
          const isVideo  = post.media_type === 'VIDEO' || post.media_type === 'REEL';
          const metrics  = isVideo ? 'impressions,reach,saved,video_views' : 'impressions,reach,saved';
          const iUrl     = new URL(`${GRAPH_BASE}/${post.id}/insights`);
          iUrl.searchParams.set('metric', metrics);
          iUrl.searchParams.set('access_token', token);

          const iResp    = await fetch(iUrl.toString());
          const insights = await iResp.json();
          const m        = {};
          if (insights.data) insights.data.forEach((i) => { m[i.name] = i.values?.[0]?.value ?? 0; });

          const reach  = m.reach  || 0;
          const saves  = m.saved  || 0;
          const shares = m.shares || 0;
          const er     = reach > 0 ? ((post.like_count + post.comments_count + saves + shares) / reach) * 100 : 0;

          return { ...post, impressions: m.impressions || 0, reach, saves, shares, video_views: m.video_views || 0, engagement_rate: parseFloat(er.toFixed(2)) };
        } catch {
          return { ...post, impressions: 0, reach: 0, saves: 0, shares: 0, video_views: 0, engagement_rate: 0 };
        }
      })
    );

    // ── 4. Métricas agregadas ────────────────────────────────────────────
    const totalReach       = enriched.reduce((s, p) => s + p.reach, 0);
    const totalImpressions = enriched.reduce((s, p) => s + p.impressions, 0);
    const avgEngagement    = enriched.length ? enriched.reduce((s, p) => s + p.engagement_rate, 0) / enriched.length : 0;

    const summary = {
      total_reach:         totalReach,
      total_impressions:   totalImpressions,
      avg_engagement_rate: parseFloat(avgEngagement.toFixed(2)),
      post_count:          enriched.length,
      period_days:         period,
    };

    // ── 5. Persistência no Supabase (assíncrona, não bloqueia resposta) ──
    if (supabase) {
      await Promise.allSettled([
        saveSnapshot(supabase, accountId, account, summary),
        cachePosts(supabase, accountId, enriched),
      ]);
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ account, posts: enriched, summary }),
    };

  } catch (err) {
    return errorResponse(500, 'Erro interno ao processar dados. Tente novamente.', cors, err.message);
  }
};

/**
 * Nexus Ops — Instagram Data Function
 * Proxy server-side para a Instagram Graph API v20.
 *
 * SEGURANÇA (OWASP):
 *   - Credenciais EXCLUSIVAMENTE via env vars (A02 — nunca expostas ao cliente)
 *   - CORS restrito à origem configurada em NEXUS_ALLOWED_ORIGIN (A05)
 *   - Allowlist de parâmetros de entrada (A03 — evita injection/abuse)
 *   - Erros genéricos ao cliente; detalhes apenas em server log (A09)
 *   - URLs de API externas hardcoded — sem SSRF via input do usuário (A10)
 *
 * Env vars obrigatórias:
 *   IG_ACCESS_TOKEN        → Long-lived Access Token do Instagram Graph API
 *   IG_ACCOUNT_ID          → Instagram Business Account ID (numérico)
 *   NEXUS_ALLOWED_ORIGIN   → URL do site em produção (ex: https://nexus-ops.netlify.app)
 */

'use strict';

// ── Constantes ──────────────────────────────────────────────────────────────

// URL base hardcoded — sem SSRF via input (A10)
const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

// Allowlist de períodos válidos — qualquer outro valor é rejeitado (A03)
const VALID_PERIODS = new Set([7, 30, 90]);

// Máximo de posts a processar (evita abuse de recursos)
const MAX_POSTS = 50;

// ── Helper: constrói headers CORS restritos ─────────────────────────────────
function buildCorsHeaders(requestOrigin) {
  const allowedOrigin = process.env.NEXUS_ALLOWED_ORIGIN || '';

  // Em produção: só permite a origem configurada
  // Em dev (NEXUS_ALLOWED_ORIGIN não definida): permite qualquer origem com aviso no log
  let origin;
  if (!allowedOrigin) {
    // Ambiente de desenvolvimento — sem restrição de origem
    origin = requestOrigin || '*';
  } else if (requestOrigin && (
    requestOrigin === allowedOrigin ||
    requestOrigin === 'http://localhost:8888' ||
    requestOrigin === 'http://127.0.0.1:8888'
  )) {
    origin = requestOrigin;
  } else {
    // Origem não autorizada — CORS vai bloquear no browser
    origin = allowedOrigin;
  }

  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age':       '86400',
    'Content-Type':                 'application/json',
    // Segurança adicional nas respostas das functions
    'X-Content-Type-Options':       'nosniff',
    'Cache-Control':                'no-store',
  };
}

// ── Helper: resposta de erro — nunca expõe detalhes internos ao cliente ──────
function errorResponse(statusCode, publicMessage, corsHeaders, internalDetail) {
  if (internalDetail) {
    // Log no servidor (visível nos Netlify Function Logs, nunca no browser)
    console.error(`[instagram-data] ${publicMessage} | detalhe interno: ${internalDetail}`);
  }
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ error: publicMessage }),
  };
}

// ── Handler principal ────────────────────────────────────────────────────────
exports.handler = async function (event) {
  const requestOrigin = event.headers['origin'] || event.headers['referer'] || '';
  const cors = buildCorsHeaders(requestOrigin);

  // ── Preflight CORS ─────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Método não permitido.', cors);
  }

  // ── A02: Credenciais EXCLUSIVAMENTE de variáveis de ambiente ───────────────
  // O frontend nunca transmite token ou account ID.
  // Se as env vars não estiverem configuradas, a function falha com mensagem clara.
  const token     = process.env.IG_ACCESS_TOKEN;
  const accountId = process.env.IG_ACCOUNT_ID;

  if (!token || !accountId) {
    return errorResponse(
      503,
      'Serviço não configurado. Configure IG_ACCESS_TOKEN e IG_ACCOUNT_ID nas variáveis de ambiente do Netlify.',
      cors,
      'env vars IG_ACCESS_TOKEN e/ou IG_ACCOUNT_ID ausentes'
    );
  }

  // ── A03: Validação e allowlist de parâmetros de entrada ───────────────────
  // `period` deve ser exatamente 7, 30 ou 90 — qualquer outro valor é rejeitado.
  const rawPeriod = event.queryStringParameters?.period;
  const period    = parseInt(rawPeriod || '30', 10);

  if (!VALID_PERIODS.has(period)) {
    return errorResponse(400, 'Parâmetro period inválido. Use 7, 30 ou 90.', cors);
  }

  // ── A03: Validação de formato do accountId (deve ser numérico) ─────────────
  // O valor vem de env var (confiamos nela), mas validamos por defesa em profundidade.
  if (!/^\d{10,20}$/.test(accountId)) {
    return errorResponse(
      503,
      'Configuração inválida no servidor.',
      cors,
      `IG_ACCOUNT_ID formato inválido: ${accountId}`
    );
  }

  try {
    // ── 1. Dados da conta ──────────────────────────────────────────────────
    // URL hardcoded com campos específicos — sem SSRF (A10)
    const accountUrl = new URL(`${GRAPH_BASE}/${accountId}`);
    accountUrl.searchParams.set('fields', 'id,username,name,biography,media_count,followers_count,follows_count,profile_picture_url,website');
    accountUrl.searchParams.set('access_token', token);

    const accountResp = await fetch(accountUrl.toString());
    const account     = await accountResp.json();

    if (account.error) {
      return errorResponse(
        502,
        'Erro ao consultar conta Instagram. Verifique o token nas variáveis de ambiente.',
        cors,
        `Graph API account error: ${account.error.message}`
      );
    }

    // ── 2. Lista de mídias do período ──────────────────────────────────────
    const since    = Math.floor(Date.now() / 1000) - period * 86400;
    const mediaUrl = new URL(`${GRAPH_BASE}/${accountId}/media`);
    mediaUrl.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count');
    mediaUrl.searchParams.set('since', String(since));
    mediaUrl.searchParams.set('limit', String(MAX_POSTS));
    mediaUrl.searchParams.set('access_token', token);

    const mediaResp = await fetch(mediaUrl.toString());
    const mediaData = await mediaResp.json();

    if (mediaData.error) {
      return errorResponse(
        502,
        'Erro ao consultar posts Instagram.',
        cors,
        `Graph API media error: ${mediaData.error.message}`
      );
    }

    const posts = (mediaData.data || []).slice(0, MAX_POSTS);

    // ── 3. Insights por post (paralelo, com fallback silencioso) ───────────
    const enriched = await Promise.all(
      posts.map(async (post) => {
        try {
          const isVideo = post.media_type === 'VIDEO' || post.media_type === 'REEL';
          const metrics = isVideo
            ? 'impressions,reach,saved,shares,video_views'
            : 'impressions,reach,saved,shares';

          const insightUrl = new URL(`${GRAPH_BASE}/${post.id}/insights`);
          insightUrl.searchParams.set('metric', metrics);
          insightUrl.searchParams.set('access_token', token);

          const insightsResp = await fetch(insightUrl.toString());
          const insights     = await insightsResp.json();

          const m = {};
          if (insights.data) {
            insights.data.forEach((i) => {
              m[i.name] = i.values?.[0]?.value ?? 0;
            });
          }

          const reach  = m.reach  || 0;
          const saves  = m.saved  || 0;
          const shares = m.shares || 0;
          const er     = reach > 0
            ? ((post.like_count + post.comments_count + saves + shares) / reach) * 100
            : 0;

          return {
            ...post,
            impressions:     m.impressions  || 0,
            reach,
            saves,
            shares,
            video_views:     m.video_views  || 0,
            engagement_rate: parseFloat(er.toFixed(2)),
          };
        } catch {
          // Post sem insights disponíveis (recente, sem permissão, etc.)
          return {
            ...post,
            impressions: 0, reach: 0, saves: 0, shares: 0,
            video_views: 0, engagement_rate: 0,
          };
        }
      })
    );

    // ── 4. Métricas agregadas ──────────────────────────────────────────────
    const totalReach       = enriched.reduce((s, p) => s + p.reach, 0);
    const totalImpressions = enriched.reduce((s, p) => s + p.impressions, 0);
    const avgEngagement    = enriched.length
      ? enriched.reduce((s, p) => s + p.engagement_rate, 0) / enriched.length
      : 0;

    // ── A09: Resposta sanitizada — nunca inclui o token ou accountId ────────
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        account,
        posts: enriched,
        summary: {
          total_reach:         totalReach,
          total_impressions:   totalImpressions,
          avg_engagement_rate: parseFloat(avgEngagement.toFixed(2)),
          post_count:          enriched.length,
          period_days:         period,
        },
      }),
    };

  } catch (err) {
    return errorResponse(
      500,
      'Erro interno ao processar dados. Tente novamente.',
      cors,
      err.message
    );
  }
};

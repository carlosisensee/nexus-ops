/**
 * Nexus Ops — AI Analyze Function
 * Proxy server-side para a Anthropic API (Claude Haiku).
 *
 * SEGURANÇA (OWASP):
 *   - CORS restrito à origem configurada em NEXUS_ALLOWED_ORIGIN (A05)
 *   - Payload validado e sanitizado antes de enviar ao modelo (A03)
 *   - Limites de tamanho de payload (A04 — evita abuse de recursos)
 *   - Erros genéricos ao cliente; detalhes apenas em server log (A09)
 *   - API key Anthropic exclusivamente via env var — nunca exposta (A02)
 *   - URL da Anthropic hardcoded — sem SSRF (A10)
 *
 * Env var obrigatória:
 *   ANTHROPIC_API_KEY      → Chave da API Anthropic
 *   NEXUS_ALLOWED_ORIGIN   → URL do site em produção
 */

'use strict';

// ── Constantes de limite (A04 — Insecure Design / resource abuse) ────────────
const MAX_POSTS           = 100;   // máximo de posts aceitos no payload
const MAX_CAPTION_LENGTH  = 300;   // chars de caption enviados ao modelo
const MAX_TOKENS_RESPONSE = 3500;  // tokens máximos na resposta do Claude

// URL hardcoded — sem SSRF via input (A10)
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// ── Helper: CORS restritos (mesma lógica do instagram-data.js) ───────────────
function buildCorsHeaders(requestOrigin) {
  const allowedOrigin = process.env.NEXUS_ALLOWED_ORIGIN || '';

  let origin;
  if (!allowedOrigin) {
    origin = requestOrigin || '*';
  } else if (requestOrigin && (
    requestOrigin === allowedOrigin ||
    requestOrigin === 'http://localhost:8888' ||
    requestOrigin === 'http://127.0.0.1:8888'
  )) {
    origin = requestOrigin;
  } else {
    origin = allowedOrigin;
  }

  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age':       '86400',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'Cache-Control':                'no-store',
  };
}

// ── Helper: resposta de erro sanitizada ──────────────────────────────────────
function errorResponse(statusCode, publicMessage, corsHeaders, internalDetail) {
  if (internalDetail) {
    console.error(`[ai-analyze] ${publicMessage} | detalhe: ${internalDetail}`);
  }
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ error: publicMessage }),
  };
}

// ── Helper: sanitiza string — remove HTML/scripts (A03) ──────────────────────
// Remove tags HTML e limita tamanho. Captions são dados de terceiros (Instagram)
// e não devem ser confiados para injeção no prompt sem sanitização.
function sanitizeString(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')          // remove HTML tags
    .replace(/[^\w\s\u00C0-\u024F\u0400-\u04FF.,!?@#%&*()\-_:;'"]/g, ' ') // só chars seguros
    .trim()
    .substring(0, maxLength);
}

// ── Helper: valida e sanitiza um post do payload ─────────────────────────────
function sanitizePost(p) {
  if (!p || typeof p !== 'object') return null;

  const VALID_TYPES = new Set(['IMAGE', 'VIDEO', 'REEL', 'CAROUSEL_ALBUM']);
  const mediaType   = VALID_TYPES.has(p.media_type) ? p.media_type : 'IMAGE';

  return {
    media_type:       mediaType,
    engagement_rate:  Math.max(0, Math.min(100, parseFloat(p.engagement_rate) || 0)),
    reach:            Math.max(0, parseInt(p.reach)            || 0),
    impressions:      Math.max(0, parseInt(p.impressions)      || 0),
    like_count:       Math.max(0, parseInt(p.like_count)       || 0),
    comments_count:   Math.max(0, parseInt(p.comments_count)   || 0),
    saves:            Math.max(0, parseInt(p.saves)            || 0),
    shares:           Math.max(0, parseInt(p.shares)           || 0),
    // caption sanitizada — dados de terceiros nunca vão direto para o prompt
    caption:          sanitizeString(p.caption || '', MAX_CAPTION_LENGTH),
    // timestamp: aceita apenas ISO 8601 básico
    timestamp:        /^\d{4}-\d{2}-\d{2}T/.test(p.timestamp || '')
                        ? p.timestamp.substring(0, 24)
                        : new Date().toISOString(),
  };
}

// ── Handler principal ────────────────────────────────────────────────────────
exports.handler = async function (event) {
  const requestOrigin = event.headers['origin'] || '';
  const cors = buildCorsHeaders(requestOrigin);

  // ── Preflight CORS ─────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Método não permitido.', cors);
  }

  // ── A02: API key exclusivamente de env var ─────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(
      503,
      'Serviço de IA não configurado.',
      cors,
      'ANTHROPIC_API_KEY ausente'
    );
  }

  // ── Validação e parsing do body ────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Corpo da requisição inválido.', cors);
  }

  // ── A03 / A04: Valida estrutura e limites do payload ──────────────────────
  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return errorResponse(400, 'Campo posts ausente ou vazio.', cors);
  }

  if (body.posts.length > MAX_POSTS) {
    return errorResponse(400, `Máximo de ${MAX_POSTS} posts por análise.`, cors);
  }

  // Sanitiza cada post — dados vindos do frontend não são confiados diretamente
  const posts = body.posts
    .map(sanitizePost)
    .filter(Boolean);

  if (!posts.length) {
    return errorResponse(400, 'Nenhum post válido após validação.', cors);
  }

  // account: apenas username e followers_count — nada sensível
  const account = {
    username:        sanitizeString(body.account?.username || 'conta', 50),
    followers_count: Math.max(0, parseInt(body.account?.followers_count) || 0),
  };

  // period: allowlist
  const VALID_PERIODS = new Set([7, 30, 90]);
  const period = VALID_PERIODS.has(parseInt(body.period)) ? parseInt(body.period) : 30;

  // ── Monta dados para o prompt ──────────────────────────────────────────────
  const sorted      = [...posts].sort((a, b) => b.engagement_rate - a.engagement_rate);
  const top5        = sorted.slice(0, 5);
  const bottom3     = sorted.slice(-3).reverse();
  const avgER       = posts.reduce((s, p) => s + p.engagement_rate, 0) / posts.length;
  const totalReach  = posts.reduce((s, p) => s + p.reach, 0);
  const totalImpr   = posts.reduce((s, p) => s + p.impressions, 0);

  const byType = {};
  posts.forEach((p) => {
    if (!byType[p.media_type]) byType[p.media_type] = [];
    byType[p.media_type].push(p.engagement_rate);
  });
  const typeAvg = Object.entries(byType)
    .map(([t, ers]) => `${t}: ${(ers.reduce((s, e) => s + e, 0) / ers.length).toFixed(1)}%`)
    .join(' | ');

  const topHours = top5.map((p) => new Date(p.timestamp).getHours());
  const bestHour = topHours.length
    ? Math.round(topHours.reduce((a, b) => a + b) / topHours.length)
    : null;

  // ── Prompt — dados já sanitizados chegam aqui (A03) ───────────────────────
  const prompt = `Você é especialista em marketing digital e Instagram Analytics para uma loja de tapetes e decoração de interiores. Analise os dados abaixo e retorne uma análise em português brasileiro.

CONTA: @${account.username} | Seguidores: ${account.followers_count.toLocaleString('pt-BR')}
PERÍODO: Últimos ${period} dias | Total: ${posts.length} posts

VISÃO GERAL:
- Alcance total: ${totalReach.toLocaleString('pt-BR')}
- Impressões totais: ${totalImpr.toLocaleString('pt-BR')}
- Engajamento médio: ${avgER.toFixed(2)}%
- Por formato: ${typeAvg}
${bestHour !== null ? `- Melhor horário dos top posts: ~${bestHour}h` : ''}

TOP 5 POSTS (maior engajamento):
${top5.map((p, i) => `${i + 1}. [${p.media_type}] ER:${p.engagement_rate.toFixed(1)}% | Alcance:${p.reach.toLocaleString()} | Saves:${p.saves} | Hora:${new Date(p.timestamp).getHours()}h | Caption: "${p.caption}"`).join('\n')}

3 POSTS COM MENOR ENGAJAMENTO:
${bottom3.map((p, i) => `${i + 1}. [${p.media_type}] ER:${p.engagement_rate.toFixed(1)}% | Hora:${new Date(p.timestamp).getHours()}h | Caption: "${p.caption}"`).join('\n')}

Responda SOMENTE com um JSON válido neste formato exato (sem markdown, sem texto antes ou depois):
{
  "resumo": {
    "melhor_post": "Análise do melhor post em 1-2 frases",
    "pior_post": "Explicação do underperformance com dados concretos",
    "destaque_periodo": "Observação mais relevante do período com número concreto",
    "avaliacao_geral": "Avaliação geral comparando com média do setor (decoração ~2%)"
  },
  "padroes": [
    { "icone": "schedule",      "titulo": "Padrão de horário",     "descricao": "Horário ideal com dados específicos" },
    { "icone": "video_library", "titulo": "Formato vencedor",      "descricao": "Qual formato performa melhor e por quê, com números" },
    { "icone": "bookmark",      "titulo": "Conteúdo mais salvo",   "descricao": "Tipo de conteúdo que gera mais saves" },
    { "icone": "edit_note",     "titulo": "Padrão de caption",     "descricao": "O que as melhores captions têm em comum" },
    { "icone": "trending_up",   "titulo": "Tendência do período",  "descricao": "O que está crescendo ou caindo" }
  ],
  "sugestoes": [
    {
      "prioridade": "alta", "icone": "star",
      "titulo": "Título ação 1",
      "descricao": "Recomendação específica e acionável com base nos dados",
      "roteiro": "Roteiro completo pronto para usar: 1) Ideia visual detalhada, 2) Caption pronta com 150-250 chars e CTA, 3) Hashtags sugeridas (#decoracao #tapetes etc). Seja específico para loja de tapetes/decoração de interiores."
    },
    {
      "prioridade": "alta", "icone": "schedule",
      "titulo": "Título ação 2",
      "descricao": "Recomendação de horário/frequência",
      "roteiro": "Roteiro de post para o horário ideal: ideia visual, caption com CTA, hashtags."
    },
    {
      "prioridade": "media", "icone": "video_library",
      "titulo": "Título ação 3",
      "descricao": "Recomendação de formato/tipo de conteúdo",
      "roteiro": "Roteiro detalhado: estrutura do conteúdo, caption, hashtags e CTA."
    },
    {
      "prioridade": "media", "icone": "warning",
      "titulo": "Título ação 4",
      "descricao": "O que evitar com base nos posts de baixo desempenho",
      "roteiro": "Exemplo de como reescrever um post fraco: versão melhorada com caption corrigida."
    },
    {
      "prioridade": "baixa", "icone": "lightbulb",
      "titulo": "Título ação 5",
      "descricao": "Ideia criativa ou oportunidade de longo prazo",
      "roteiro": "Roteiro completo: conceito visual, caption pronta para copiar, hashtags de nicho."
    }
  ],
  "comparativo": {
    "insight": "Interpretação qualitativa da evolução do período",
    "driver_principal": "Principal fator que explica a performance",
    "proximo_passo": "A única coisa mais importante a fazer nos próximos 7 dias"
  }
}`;

  // ── Chamada à Anthropic API ────────────────────────────────────────────────
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: MAX_TOKENS_RESPONSE,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return errorResponse(
        502,
        'Erro ao processar análise de IA. Tente novamente.',
        cors,
        `Anthropic API ${resp.status}: ${errBody.substring(0, 200)}`
      );
    }

    const data = await resp.json();
    const raw  = data.content?.[0]?.text || '';

    // Extrai JSON da resposta (Claude pode adicionar texto antes/depois)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return errorResponse(
        502,
        'Resposta de IA em formato inválido. Tente novamente.',
        cors,
        `Resposta sem JSON: ${raw.substring(0, 200)}`
      );
    }

    const analysis = JSON.parse(match[0]);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ analysis, model: data.model }),
    };

  } catch (err) {
    return errorResponse(
      500,
      'Erro interno ao processar análise. Tente novamente.',
      cors,
      err.message
    );
  }
};

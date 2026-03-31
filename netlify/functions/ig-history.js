/**
 * Nexus Ops — Instagram History
 * Retorna snapshots históricos para renderização de gráficos de tendência.
 *
 * GET /.netlify/functions/ig-history?range=90
 *   range: dias de histórico a retornar (7 | 30 | 90 | 365)
 *   granularity: day | week | month (opcional, default: day)
 *
 * Env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, NEXUS_ALLOWED_ORIGIN
 */

'use strict';

const { getSupabaseClient } = require('./_supabase');

const VALID_RANGES       = new Set([7, 30, 90, 180, 365]);
const VALID_GRANULARITY  = new Set(['day', 'week', 'month']);

function buildCorsHeaders(requestOrigin) {
  const allowed = process.env.NEXUS_ALLOWED_ORIGIN || '';
  const origin = (!allowed || requestOrigin === allowed ||
    requestOrigin?.startsWith('http://localhost'))
    ? (requestOrigin || '*') : allowed;
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type':                 'application/json',
    'X-Content-Type-Options':       'nosniff',
    'Cache-Control':                'no-store',
  };
}

function errorResponse(status, publicMsg, cors, detail) {
  if (detail) console.error(`[ig-history] ${publicMsg} | ${detail}`);
  return { statusCode: status, headers: cors, body: JSON.stringify({ error: publicMsg }) };
}

exports.handler = async function (event) {
  const cors = buildCorsHeaders(event.headers['origin'] || '');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'GET')     return errorResponse(405, 'Método não permitido.', cors);

  // Parâmetros com allowlist
  const rawRange = parseInt(event.queryStringParameters?.range || '90', 10);
  const range    = VALID_RANGES.has(rawRange) ? rawRange : 90;

  const rawGran       = event.queryStringParameters?.granularity || 'day';
  const granularity   = VALID_GRANULARITY.has(rawGran) ? rawGran : 'day';

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (err) {
    return errorResponse(503, 'Banco de dados não configurado.', cors, err.message);
  }

  try {
    const since = new Date();
    since.setDate(since.getDate() - range);
    const sinceStr = since.toISOString().substring(0, 10);

    // Busca snapshots do período
    const { data: snapshots, error } = await supabase
      .from('ig_snapshots')
      .select('snapshot_date, followers_count, following_count, total_reach, total_impressions, avg_engagement_rate, post_count')
      .gte('snapshot_date', sinceStr)
      .order('snapshot_date', { ascending: true });

    if (error) {
      return errorResponse(500, 'Erro ao buscar histórico.', cors, error.message);
    }

    if (!snapshots || snapshots.length === 0) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          snapshots:    [],
          range_days:   range,
          granularity,
          message:      'Nenhum snapshot disponível ainda. Os dados serão acumulados com o uso diário.',
        }),
      };
    }

    // Agrega por semana ou mês se solicitado
    let result = snapshots;
    if (granularity === 'week') {
      result = aggregateByPeriod(snapshots, 'week');
    } else if (granularity === 'month') {
      result = aggregateByPeriod(snapshots, 'month');
    }

    // Calcula tendências (comparativo primeiro vs último ponto)
    const first = result[0];
    const last  = result[result.length - 1];
    const trends = {
      followers_change:     last.followers_count - first.followers_count,
      followers_pct:        first.followers_count > 0
        ? (((last.followers_count - first.followers_count) / first.followers_count) * 100).toFixed(1)
        : null,
      reach_change:         last.total_reach - first.total_reach,
      engagement_change:    parseFloat((last.avg_engagement_rate - first.avg_engagement_rate).toFixed(2)),
    };

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ snapshots: result, range_days: range, granularity, trends }),
    };

  } catch (err) {
    return errorResponse(500, 'Erro interno ao processar histórico.', cors, err.message);
  }
};

// ── Helper: agrega snapshots por semana ou mês ───────────────────────────────
function aggregateByPeriod(snapshots, period) {
  const groups = {};

  snapshots.forEach((s) => {
    const date = new Date(s.snapshot_date + 'T12:00:00');
    let key;
    if (period === 'week') {
      // Início da semana (domingo)
      const day  = date.getDay();
      const diff = date.getDate() - day;
      const week = new Date(date.setDate(diff));
      key = week.toISOString().substring(0, 10);
    } else {
      key = s.snapshot_date.substring(0, 7); // YYYY-MM
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  return Object.entries(groups).map(([key, items]) => ({
    snapshot_date:       key,
    followers_count:     Math.round(avg(items, 'followers_count')),
    following_count:     Math.round(avg(items, 'following_count')),
    total_reach:         sum(items, 'total_reach'),
    total_impressions:   sum(items, 'total_impressions'),
    avg_engagement_rate: parseFloat(avg(items, 'avg_engagement_rate').toFixed(2)),
    post_count:          sum(items, 'post_count'),
    days_in_period:      items.length,
  })).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
}

function avg(items, field) {
  return items.reduce((s, i) => s + (parseFloat(i[field]) || 0), 0) / items.length;
}
function sum(items, field) {
  return items.reduce((s, i) => s + (parseInt(i[field]) || 0), 0);
}

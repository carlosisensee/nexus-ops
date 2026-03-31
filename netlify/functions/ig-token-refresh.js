/**
 * Nexus Ops — Instagram Token Refresh
 * Renova o token long-lived do Instagram automaticamente.
 *
 * Tokens Instagram Graph API expiram em 60 dias.
 * Esta função verifica o token atual e renova se estiver
 * a menos de 7 dias do vencimento.
 *
 * Chamada pelo scheduled task semanal.
 * Pode também ser chamada manualmente via GET.
 *
 * Env vars:
 *   SUPABASE_URL           → URL do projeto Supabase
 *   SUPABASE_SERVICE_KEY   → service_role key
 *   NEXUS_ALLOWED_ORIGIN   → Origem permitida para CORS
 */

'use strict';

const { getSupabaseClient } = require('./_supabase');

const GRAPH_BASE     = 'https://graph.facebook.com/v20.0';
const REFRESH_WINDOW = 7; // Renova se faltar menos de N dias

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
  if (detail) console.error(`[ig-token-refresh] ${publicMsg} | ${detail}`);
  return { statusCode: status, headers: cors, body: JSON.stringify({ error: publicMsg }) };
}

exports.handler = async function (event) {
  const cors = buildCorsHeaders(event.headers['origin'] || '');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (err) {
    return errorResponse(503, 'Supabase não configurado.', cors, err.message);
  }

  try {
    // ── 1. Buscar credencial atual ───────────────────────────────────────
    const { data: cred, error: fetchErr } = await supabase
      .from('ig_credentials')
      .select('id, account_id, access_token, token_expires_at, username')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchErr || !cred) {
      return errorResponse(404, 'Nenhuma credencial encontrada no banco.', cors, fetchErr?.message);
    }

    const expiresAt  = new Date(cred.token_expires_at);
    const daysLeft   = Math.floor((expiresAt - Date.now()) / 86400000);
    const needsRefresh = daysLeft < REFRESH_WINDOW;

    console.log(`[ig-token-refresh] @${cred.username} | expira em ${daysLeft} dias | refresh necessário: ${needsRefresh}`);

    if (!needsRefresh) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          refreshed: false,
          message:   `Token válido. Expira em ${daysLeft} dias.`,
          expires_at: expiresAt.toISOString(),
        }),
      };
    }

    // ── 2. Chamar endpoint de refresh do Graph API ───────────────────────
    // Documentação: https://developers.facebook.com/docs/instagram-basic-display-api/guides/long-lived-access-tokens
    const refreshUrl = new URL(`${GRAPH_BASE}/refresh_access_token`);
    refreshUrl.searchParams.set('grant_type',    'ig_refresh_token');
    refreshUrl.searchParams.set('access_token',  cred.access_token);

    const refreshResp = await fetch(refreshUrl.toString());
    const refreshData = await refreshResp.json();

    if (refreshData.error || !refreshData.access_token) {
      return errorResponse(
        502,
        'Falha ao renovar token Instagram.',
        cors,
        refreshData.error?.message || JSON.stringify(refreshData)
      );
    }

    // ── 3. Calcular nova expiração e salvar no Supabase ──────────────────
    // Graph API retorna expires_in em segundos (normalmente ~5.184.000 = 60 dias)
    const expiresInSeconds = refreshData.expires_in || 5184000;
    const newExpiresAt     = new Date(Date.now() + expiresInSeconds * 1000);

    const { error: updateErr } = await supabase
      .from('ig_credentials')
      .update({
        access_token:      refreshData.access_token,
        token_expires_at:  newExpiresAt.toISOString(),
        token_issued_at:   new Date().toISOString(),
      })
      .eq('id', cred.id);

    if (updateErr) {
      return errorResponse(500, 'Token renovado mas falha ao salvar no banco.', cors, updateErr.message);
    }

    console.log(`[ig-token-refresh] ✅ Token renovado. Nova expiração: ${newExpiresAt.toISOString()}`);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        refreshed:   true,
        message:     'Token renovado com sucesso.',
        expires_at:  newExpiresAt.toISOString(),
        expires_days: Math.floor(expiresInSeconds / 86400),
      }),
    };

  } catch (err) {
    return errorResponse(500, 'Erro interno ao renovar token.', cors, err.message);
  }
};

/**
 * Nexus Ops — Instagram Credential Seed
 * Endpoint one-time para inserir as credenciais iniciais no Supabase.
 *
 * Após a primeira execução bem-sucedida, as credenciais ficam no banco
 * e as env vars IG_ACCESS_TOKEN / IG_ACCOUNT_ID podem ser removidas.
 *
 * USO (uma única vez após deploy):
 *   POST /.netlify/functions/ig-seed
 *   Body: { "secret": "SEU_NEXUS_SEED_SECRET" }
 *
 * Env vars obrigatórias:
 *   NEXUS_SEED_SECRET    → Senha avulsa para proteger este endpoint (gere uma vez, delete depois)
 *   IG_ACCESS_TOKEN      → Token a ser salvo no banco
 *   IG_ACCOUNT_ID        → Account ID a ser salvo no banco
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

'use strict';

const { getSupabaseClient } = require('./_supabase');

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

exports.handler = async function (event) {
  const cors = {
    'Content-Type':           'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control':          'no-store',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Use POST.' }) };

  // ── Autenticação do endpoint com secret avulso ────────────────────────
  const seedSecret = process.env.NEXUS_SEED_SECRET;
  if (!seedSecret) {
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'NEXUS_SEED_SECRET não configurado.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Body JSON inválido.' }) };
  }

  if (!body.secret || body.secret !== seedSecret) {
    console.warn('[ig-seed] Tentativa de acesso com secret inválido.');
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Não autorizado.' }) };
  }

  // ── Credenciais das env vars ──────────────────────────────────────────
  const token     = process.env.IG_ACCESS_TOKEN;
  const accountId = process.env.IG_ACCOUNT_ID;

  if (!token || !accountId) {
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'IG_ACCESS_TOKEN e IG_ACCOUNT_ID são obrigatórios.' }) };
  }

  if (!/^\d{10,20}$/.test(accountId)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'IG_ACCOUNT_ID deve ser numérico (10-20 dígitos).' }) };
  }

  // ── Validar token chamando a API do Instagram ──────────────────────────
  let username;
  try {
    const url = new URL(`${GRAPH_BASE}/${accountId}`);
    url.searchParams.set('fields', 'id,username,name');
    url.searchParams.set('access_token', token);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message);
    username = data.username;
  } catch (err) {
    console.error('[ig-seed] Erro ao validar token:', err.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Token inválido ou expirado: ' + err.message }) };
  }

  // ── Calcular expiração (tokens long-lived: 60 dias) ───────────────────
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 60);

  // ── Salvar no Supabase ────────────────────────────────────────────────
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('ig_credentials')
      .upsert({
        account_id:       accountId,
        username,
        access_token:     token,
        token_expires_at: expiresAt.toISOString(),
        token_issued_at:  new Date().toISOString(),
      }, { onConflict: 'account_id' });

    if (error) throw new Error(error.message);

    console.log(`[ig-seed] ✅ Credencial salva: @${username} (account: ${accountId})`);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success:    true,
        username:   '@' + username,
        account_id: accountId,
        expires_at: expiresAt.toISOString(),
        message:    'Credenciais salvas. Próximo passo: remova IG_ACCESS_TOKEN e IG_ACCOUNT_ID das env vars do Netlify e execute um novo deploy.',
      }),
    };
  } catch (err) {
    console.error('[ig-seed] Erro ao salvar no Supabase:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Erro ao salvar no banco: ' + err.message }) };
  }
};

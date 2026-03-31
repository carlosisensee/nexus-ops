/**
 * Nexus Ops — Scheduled: snapshot diário do Instagram
 * Executado automaticamente todo dia às 23h pelo Netlify Scheduler.
 *
 * Chama instagram-data internamente para garantir que o snapshot
 * do dia seja persistido no Supabase, mesmo sem acesso ao dashboard.
 */

'use strict';

const { getSupabaseClient } = require('./_supabase');

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';
const MAX_POSTS  = 30;

async function getCredentials() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ig_credentials')
    .select('account_id, access_token')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(error?.message || 'Sem credenciais no banco');
  return data;
}

exports.handler = async function () {
  console.log('[ig-daily-snapshot] Iniciando snapshot diário…');

  let supabase;
  try { supabase = getSupabaseClient(); }
  catch (err) { console.error('[ig-daily-snapshot] Supabase indisponível:', err.message); return { statusCode: 500 }; }

  let token, accountId;
  try { ({ access_token: token, account_id: accountId } = await getCredentials()); }
  catch (err) { console.error('[ig-daily-snapshot] Credenciais indisponíveis:', err.message); return { statusCode: 500 }; }

  try {
    // Dados da conta
    const acctUrl = new URL(`${GRAPH_BASE}/${accountId}`);
    acctUrl.searchParams.set('fields', 'followers_count,follows_count,media_count');
    acctUrl.searchParams.set('access_token', token);
    const acctResp = await fetch(acctUrl.toString());
    const account  = await acctResp.json();
    if (account.error) throw new Error(account.error.message);

    // Posts recentes (30 dias)
    const since    = Math.floor(Date.now() / 1000) - 30 * 86400;
    const mediaUrl = new URL(`${GRAPH_BASE}/${accountId}/media`);
    mediaUrl.searchParams.set('fields', 'id,media_type,like_count,comments_count,timestamp');
    mediaUrl.searchParams.set('since', String(since));
    mediaUrl.searchParams.set('limit', String(MAX_POSTS));
    mediaUrl.searchParams.set('access_token', token);
    const mediaResp = await fetch(mediaUrl.toString());
    const mediaData = await mediaResp.json();
    const posts     = mediaData.data || [];

    // Insights agregados (simplificado — sem insights por post para economizar quota)
    const today = new Date().toISOString().substring(0, 10);
    const { error } = await supabase.from('ig_snapshots').upsert({
      account_id:          accountId,
      snapshot_date:       today,
      followers_count:     account.followers_count  || 0,
      following_count:     account.follows_count    || 0,
      media_count:         account.media_count      || 0,
      total_reach:         0, // preenchido pela chamada completa do dashboard
      total_impressions:   0,
      avg_engagement_rate: 0,
      post_count:          posts.length,
    }, { onConflict: 'account_id,snapshot_date', ignoreDuplicates: true });

    if (error) throw new Error(error.message);

    console.log(`[ig-daily-snapshot] ✅ Snapshot salvo: ${today} | ${account.followers_count} seguidores`);
    return { statusCode: 200 };
  } catch (err) {
    console.error('[ig-daily-snapshot] Erro:', err.message);
    return { statusCode: 500 };
  }
};

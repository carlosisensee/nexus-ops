/**
 * Nexus Ops — Instagram Data Function
 * Proxy server-side para a Instagram Graph API v20.
 *
 * Endpoint: GET /.netlify/functions/instagram-data?period=30
 *
 * Headers aceitos:
 *   X-Instagram-Token   → Long-lived Access Token
 *   X-Account-Id        → Instagram Business Account ID
 *
 * Env vars (alternativa aos headers, mais seguro):
 *   IG_ACCESS_TOKEN
 *   IG_ACCOUNT_ID
 */

const BASE = 'https://graph.facebook.com/v20.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Instagram-Token, X-Account-Id',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // Credenciais: header tem prioridade sobre env var
  const token     = event.headers['x-instagram-token'] || process.env.IG_ACCESS_TOKEN;
  const accountId = event.headers['x-account-id']      || process.env.IG_ACCOUNT_ID;
  const period    = parseInt(event.queryStringParameters?.period || '30', 10);

  if (!token || !accountId) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Credenciais ausentes. Forneça X-Instagram-Token e X-Account-Id.' }),
    };
  }

  try {
    // ── 1. Conta ──────────────────────────────────────────────
    const accountResp = await fetch(
      `${BASE}/${accountId}?fields=id,username,account_type,media_count,followers_count,follows_count,profile_picture_url&access_token=${token}`
    );
    const account = await accountResp.json();
    if (account.error) throw new Error(`Instagram API: ${account.error.message}`);

    // ── 2. Lista de mídias ────────────────────────────────────
    const since = Math.floor(Date.now() / 1000) - period * 86400;
    const mediaResp = await fetch(
      `${BASE}/${accountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&since=${since}&limit=50&access_token=${token}`
    );
    const mediaData = await mediaResp.json();
    if (mediaData.error) throw new Error(`Instagram API: ${mediaData.error.message}`);

    const posts = mediaData.data || [];

    // ── 3. Insights por post (paralelo, com fallback) ─────────
    const enriched = await Promise.all(
      posts.map(async (post) => {
        try {
          const isVideo = post.media_type === 'VIDEO' || post.media_type === 'REEL';
          const metrics = isVideo
            ? 'impressions,reach,saved,shares,video_views'
            : 'impressions,reach,saved,shares';

          const insightsResp = await fetch(
            `${BASE}/${post.id}/insights?metric=${metrics}&access_token=${token}`
          );
          const insights = await insightsResp.json();

          const m = {};
          if (insights.data) {
            insights.data.forEach((i) => { m[i.name] = i.values?.[0]?.value ?? 0; });
          }

          const reach  = m.reach || 0;
          const saves  = m.saved || 0;
          const shares = m.shares || 0;
          const er     = reach > 0
            ? ((post.like_count + post.comments_count + saves + shares) / reach) * 100
            : 0;

          return {
            ...post,
            impressions:     m.impressions || 0,
            reach,
            saves,
            shares,
            video_views:     m.video_views || 0,
            engagement_rate: parseFloat(er.toFixed(2)),
          };
        } catch {
          // Post sem insights disponíveis (ex: post muito recente)
          return {
            ...post,
            impressions: 0, reach: 0, saves: 0, shares: 0,
            video_views: 0, engagement_rate: 0,
          };
        }
      })
    );

    // ── 4. Métricas agregadas ─────────────────────────────────
    const totalReach       = enriched.reduce((s, p) => s + p.reach, 0);
    const totalImpressions = enriched.reduce((s, p) => s + p.impressions, 0);
    const avgEngagement    = enriched.length
      ? enriched.reduce((s, p) => s + p.engagement_rate, 0) / enriched.length
      : 0;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        account,
        posts: enriched,
        summary: {
          total_reach:        totalReach,
          total_impressions:  totalImpressions,
          avg_engagement_rate: parseFloat(avgEngagement.toFixed(2)),
          post_count:         enriched.length,
          period_days:        period,
        },
      }),
    };
  } catch (err) {
    console.error('[instagram-data]', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

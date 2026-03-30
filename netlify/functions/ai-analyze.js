/**
 * Nexus Ops — AI Analyze Function
 * Proxy server-side para a Anthropic API (Claude).
 *
 * Endpoint: POST /.netlify/functions/ai-analyze
 * Body JSON: { posts: [...], account: {...}, period: 30 }
 *
 * Env var obrigatória:
 *   ANTHROPIC_API_KEY   → chave da API Anthropic
 *
 * Retorna análise estruturada em 4 dimensões:
 *   resumo | padroes | sugestoes | comparativo
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }

  const { posts = [], account = {}, period = 30 } = body;

  if (!posts.length) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Nenhum post enviado para análise' }) };
  }

  // ── Preparar resumo dos dados para o Claude ────────────────
  const sorted       = [...posts].sort((a, b) => b.engagement_rate - a.engagement_rate);
  const top5         = sorted.slice(0, 5);
  const bottom3      = sorted.slice(-3).reverse();
  const avgER        = posts.reduce((s, p) => s + p.engagement_rate, 0) / posts.length;
  const totalReach   = posts.reduce((s, p) => s + p.reach, 0);
  const totalImpr    = posts.reduce((s, p) => s + p.impressions, 0);

  // Engajamento médio por tipo de conteúdo
  const byType = {};
  posts.forEach((p) => {
    if (!byType[p.media_type]) byType[p.media_type] = [];
    byType[p.media_type].push(p.engagement_rate);
  });
  const typeAvg = Object.entries(byType)
    .map(([t, ers]) => `${t}: ${(ers.reduce((s, e) => s + e, 0) / ers.length).toFixed(1)}%`)
    .join(' | ');

  // Melhor horário (baseado nos top 5 posts)
  const topHours = top5.map((p) => new Date(p.timestamp).getHours());
  const bestHour = topHours.length ? Math.round(topHours.reduce((a, b) => a + b) / topHours.length) : null;

  const prompt = `Você é um especialista em marketing digital e Instagram Analytics trabalhando para uma loja de tapetes e decoração de interiores. Analise os dados de performance dos posts abaixo e retorne uma análise detalhada em português brasileiro.

CONTA: @${account.username || 'conta'} | Seguidores: ${(account.followers_count || 0).toLocaleString('pt-BR')}
PERÍODO: Últimos ${period} dias | Total: ${posts.length} posts

VISÃO GERAL:
- Alcance total: ${totalReach.toLocaleString('pt-BR')}
- Impressões totais: ${totalImpr.toLocaleString('pt-BR')}
- Engajamento médio: ${avgER.toFixed(2)}%
- Por formato: ${typeAvg}
${bestHour !== null ? `- Melhor horário dos top posts: ~${bestHour}h` : ''}

TOP 5 POSTS (maior engajamento):
${top5.map((p, i) => `${i + 1}. [${p.media_type}] ER:${p.engagement_rate.toFixed(1)}% | Alcance:${p.reach.toLocaleString()} | Saves:${p.saves || 0} | Shares:${p.shares || 0} | Hora:${new Date(p.timestamp).getHours()}h | Caption: "${String(p.caption || '').substring(0, 120)}"`).join('\n')}

3 POSTS COM MENOR ENGAJAMENTO:
${bottom3.map((p, i) => `${i + 1}. [${p.media_type}] ER:${p.engagement_rate.toFixed(1)}% | Hora:${new Date(p.timestamp).getHours()}h | Caption: "${String(p.caption || '').substring(0, 80)}"`).join('\n')}

Responda SOMENTE com um JSON válido neste formato exato (sem markdown, sem texto antes ou depois):
{
  "resumo": {
    "melhor_post": "Análise do melhor post em 1-2 frases explicando por que performou bem",
    "pior_post": "Explicação do underperformance do post com menor engajamento",
    "destaque_periodo": "Observação mais relevante do período com número concreto",
    "avaliacao_geral": "Avaliação geral comparando com média do setor (decoração/home decor ~2%)"
  },
  "padroes": [
    { "icone": "schedule", "titulo": "Padrão de horário", "descricao": "Explicação com dados específicos do horário ideal" },
    { "icone": "video_library", "titulo": "Formato vencedor", "descricao": "Qual formato performa melhor e por quê, com números" },
    { "icone": "bookmark", "titulo": "Conteúdo mais salvo", "descricao": "Tipo de conteúdo que gera mais saves e por quê isso importa" },
    { "icone": "edit_note", "titulo": "Padrão de caption", "descricao": "O que as melhores captions têm em comum (tamanho, CTA, hashtags)" },
    { "icone": "trending_up", "titulo": "Tendência do período", "descricao": "O que está crescendo ou diminuindo comparado ao esperado" }
  ],
  "sugestoes": [
    { "prioridade": "alta", "icone": "star", "titulo": "Título ação 1", "descricao": "Recomendação específica e acionável com base nos dados, explicando o impacto esperado" },
    { "prioridade": "alta", "icone": "schedule", "titulo": "Título ação 2", "descricao": "Recomendação de horário/frequência com base nos padrões identificados" },
    { "prioridade": "media", "icone": "video_library", "titulo": "Título ação 3", "descricao": "Recomendação de formato/tipo de conteúdo" },
    { "prioridade": "media", "icone": "warning", "titulo": "Título ação 4", "descricao": "O que evitar, com base nos posts de baixo desempenho" },
    { "prioridade": "baixa", "icone": "lightbulb", "titulo": "Título ação 5", "descricao": "Ideia criativa ou oportunidade de longo prazo" }
  ],
  "comparativo": {
    "insight": "Interpretação qualitativa da evolução — o que melhorou, o que piorou e por quê",
    "driver_principal": "Principal fator que explica a performance do período",
    "proximo_passo": "A única coisa mais importante a fazer nos próximos 7 dias"
  }
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Anthropic API ${resp.status}: ${errBody}`);
    }

    const data = await resp.json();
    const raw  = data.content?.[0]?.text || '';

    // Extrai JSON da resposta (Claude às vezes adiciona texto antes/depois)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta da IA não contém JSON válido');

    const analysis = JSON.parse(match[0]);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ analysis, model: data.model }),
    };
  } catch (err) {
    console.error('[ai-analyze]', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

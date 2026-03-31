/**
 * Nexus Ops — Supabase client helper
 * Importado pelas Netlify Functions que precisam do banco.
 *
 * SEGURANÇA:
 *   - Usa EXCLUSIVAMENTE a service_role key (env var) — nunca a anon key
 *   - A service_role key bypassa RLS — nunca expor ao browser
 *   - Chamado apenas server-side (dentro das Netlify Functions)
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

/**
 * Retorna um cliente Supabase autenticado com a service_role key.
 * Lança erro se as env vars obrigatórias estiverem ausentes.
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase não configurado: SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.'
    );
  }

  return createClient(url, key, {
    auth: {
      // Desabilita persistência de sessão — functions são stateless
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

module.exports = { getSupabaseClient };

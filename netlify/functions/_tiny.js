/**
 * Nexus OPS — Tiny ERP API helper
 * ─────────────────────────────────────────────────────────
 * Centraliza todas as chamadas à API do Tiny ERP v2.
 * Padrão idêntico ao _supabase.js — importar nas Netlify Functions.
 *
 * CONFIGURAÇÃO:
 *   Adicionar nas env vars do Netlify:
 *     TINY_API_TOKEN  → gerado em Tiny ERP → Configurações → API → Tokens
 *
 * USAGE:
 *   const tiny = require('./_tiny');
 *   const pedido = await tiny.getOrder('987654321');
 *
 * SEGURANÇA:
 *   - Token nunca exposto ao browser — usado apenas server-side
 *   - Todas as chamadas passam pelo backend (Netlify Function)
 */

'use strict';

const TINY_BASE = 'https://api.tiny.com.br/api2';

// ── Token helper ──────────────────────────────────────────
function getToken() {
  const token = process.env.TINY_API_TOKEN;
  if (!token) {
    throw new Error(
      'Tiny ERP não configurado: TINY_API_TOKEN é obrigatório nas variáveis de ambiente do Netlify.'
    );
  }
  return token;
}

// ── Request base ──────────────────────────────────────────
/**
 * Executa uma chamada autenticada à API do Tiny.
 * Lança erro se o status retornado for "Erro".
 *
 * @param {string} endpoint  - ex: 'pedidos.pesquisa.php'
 * @param {object} params    - query params adicionais
 * @returns {Promise<object>} retorno do Tiny (sem wrapper)
 */
async function tinyRequest(endpoint, params = {}) {
  const token = getToken();

  const url = new URL(`${TINY_BASE}/${endpoint}`);
  url.searchParams.set('token', token);
  url.searchParams.set('formato', 'json');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Tiny API HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const retorno = json?.retorno;

  if (!retorno) {
    throw new Error('Tiny API: resposta inesperada (sem campo "retorno")');
  }

  if (retorno.status_processamento === '2' || retorno.status === 'Erro') {
    const erros = retorno?.registros?.registro;
    const msgs = Array.isArray(erros)
      ? erros.map(e => e.erro || JSON.stringify(e)).join('; ')
      : erros?.erro || retorno?.erros?.join('; ') || 'Erro desconhecido';
    throw new Error(`Tiny: ${msgs}`);
  }

  return retorno;
}

// ── Pedidos ───────────────────────────────────────────────

/**
 * Busca pedidos por número visível no ecommerce.
 * Retorna array de pedidos (resumo).
 */
async function searchOrderByNumber(numero) {
  const ret = await tinyRequest('pedidos.pesquisa.php', { numero: String(numero).trim() });
  return ret?.pedidos?.map(p => p.pedido) || [];
}

/**
 * Busca pedidos por CPF do cliente (somente dígitos ou formatado).
 * Retorna array de pedidos ordenados por data desc.
 */
async function searchOrderByCpf(cpf) {
  const cpfClean = String(cpf).replace(/\D/g, '');
  const ret = await tinyRequest('pedidos.pesquisa.php', { pesquisa: cpfClean });
  const pedidos = (ret?.pedidos?.map(p => p.pedido) || []);
  // Ordena do mais recente para o mais antigo
  return pedidos.sort((a, b) => {
    const da = a.data_pedido ? new Date(a.data_pedido.split('/').reverse().join('-')) : 0;
    const db = b.data_pedido ? new Date(b.data_pedido.split('/').reverse().join('-')) : 0;
    return db - da;
  });
}

/**
 * Obtém um pedido completo (com itens, cliente e NF) pelo ID interno do Tiny.
 * @param {string|number} id  - ID interno do Tiny (não o número visível)
 */
async function getOrder(id) {
  const ret = await tinyRequest('pedido.obter.php', { id: String(id) });
  return ret?.pedido || null;
}

/**
 * Obtém dados completos de um produto pelo ID interno do Tiny.
 * Inclui peso e dimensões (úteis para cotação de frete reverso).
 * @param {string|number} id  - ID interno do Tiny
 */
async function getProduct(id) {
  const ret = await tinyRequest('produto.obter.php', { id: String(id) });
  return ret?.produto || null;
}

/**
 * Busca produto por SKU.
 * Retorna o primeiro resultado (resumo — use getProduct para detalhes).
 */
async function searchProductBySku(sku) {
  const ret = await tinyRequest('produtos.pesquisa.php', { pesquisa: String(sku).trim() });
  const lista = ret?.produtos?.map(p => p.produto) || [];
  return lista.find(p => p.codigo === sku) || lista[0] || null;
}

// ── Extratores de dados normalizados ─────────────────────
/**
 * Normaliza um pedido completo do Tiny para o formato padrão Nexus OPS.
 * Extrai todos os campos necessários para o ticket de reversa.
 *
 * @param {object} pedidoTiny  - objeto retornado por getOrder()
 * @param {string} skuDevolvido - SKU do item selecionado pelo cliente
 * @returns {object} dados normalizados
 */
function normalizePedido(pedidoTiny, skuDevolvido) {
  if (!pedidoTiny) return null;

  const cli = pedidoTiny.cliente || {};
  const nf  = pedidoTiny.nota_fiscal || {};
  const itens = pedidoTiny.itens?.map(i => i.item) || [];
  const itemDevolvido = skuDevolvido
    ? itens.find(i => i.codigo === skuDevolvido || i.sku === skuDevolvido)
    : itens[0];

  return {
    // Pedido
    pedido_numero:    pedidoTiny.numero,
    pedido_id_tiny:   pedidoTiny.id,
    pedido_data:      pedidoTiny.data_pedido,
    pedido_nf:        nf.numero || pedidoTiny.numero_nota_fiscal || null,
    pedido_canal:     pedidoTiny.ecommerce?.nomeLojaEcommerce || pedidoTiny.nome_canal_venda || null,
    pedido_valor:     parseFloat(pedidoTiny.total_pedido) || null,

    // Cliente
    cliente_nome:     cli.nome,
    cliente_cpf:      cli.cpf_cnpj,
    cliente_telefone: cli.fone || cli.celular,
    cliente_email:    cli.email,
    cliente_endereco: [cli.endereco, cli.numero, cli.complemento].filter(Boolean).join(', '),
    cliente_cep:      cli.cep,
    cliente_cidade:   cli.cidade,
    cliente_uf:       cli.uf,

    // Item devolvido
    produto_sku:          itemDevolvido?.codigo || itemDevolvido?.sku,
    produto_nome:         itemDevolvido?.descricao,
    produto_quantidade:   parseInt(itemDevolvido?.quantidade) || 1,
    produto_peso:         parseFloat(itemDevolvido?.peso_bruto || itemDevolvido?.peso) || null,
    produto_altura:       parseFloat(itemDevolvido?.altura) || null,
    produto_largura:      parseFloat(itemDevolvido?.largura) || null,
    produto_comprimento:  parseFloat(itemDevolvido?.comprimento) || null,

    // Flag: produto sem medidas para cotação
    flag_sem_medidas: !(
      itemDevolvido?.peso_bruto || itemDevolvido?.peso
    ) || !(
      itemDevolvido?.altura && itemDevolvido?.largura && itemDevolvido?.comprimento
    ),

    // Lista completa de itens (para o cliente selecionar qual devolver)
    itens: itens.map(i => ({
      id:         i.id_produto,
      sku:        i.codigo || i.sku,
      nome:       i.descricao,
      quantidade: parseInt(i.quantidade) || 1,
    })),
  };
}

/**
 * Gera o texto padronizado de cotação para copiar e enviar à transportadora.
 * Campos não preenchidos aparecem como [A INFORMAR].
 */
function buildCotacaoText(ticket) {
  const fill = (v) => v || '[A INFORMAR]';
  const destCidade = process.env.EMPRESA_CIDADE_DESTINO || '[CIDADE EMPRESA]';
  const destUf     = process.env.EMPRESA_UF_DESTINO     || '[UF EMPRESA]';
  const destCep    = process.env.EMPRESA_CEP_DESTINO    || '[CEP EMPRESA]';

  return `SOLICITAÇÃO DE COLETA REVERSA — CONTA E ORDEM CASA ENCANTO

CPF: ${fill(ticket.cliente_cpf)}
Nome: ${fill(ticket.cliente_nome)}
Origem: ${fill(ticket.cliente_cidade)} / ${fill(ticket.cliente_uf)}
CEP Origem: ${fill(ticket.cliente_cep)}
Destino: ${destCidade} / ${destUf}
CEP Destino: ${destCep}

Produto: ${fill(ticket.produto_nome)}
SKU: ${fill(ticket.produto_sku)}
Quantidade: ${fill(ticket.produto_quantidade)}
Peso: ${ticket.produto_peso ? ticket.produto_peso + ' kg' : '[A INFORMAR]'}
Dimensões: ${ticket.produto_comprimento || '[?]'} × ${ticket.produto_largura || '[?]'} × ${ticket.produto_altura || '[?]'} cm
Valor da mercadoria: ${ticket.pedido_valor ? 'R$ ' + Number(ticket.pedido_valor).toFixed(2) : '[A INFORMAR]'}

Modalidade: Conta e Ordem Casa Encanto
Tipo: Coleta reversa
Protocolo: ${fill(ticket.protocolo)}`;
}

module.exports = {
  searchOrderByNumber,
  searchOrderByCpf,
  getOrder,
  getProduct,
  searchProductBySku,
  normalizePedido,
  buildCotacaoText,
};

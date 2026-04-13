/**
 * Nexus Ops — Carpet AR Widget
 * ============================================================
 * Cole este script no GTM (Custom HTML tag) ou diretamente no
 * <head> do site do produto. Ele lê o SKU do dataLayer e injeta
 * automaticamente o botão "Ver no meu ambiente" quando existe um
 * modelo 3D pronto para aquele SKU.
 *
 * Configuração:
 *   window.NexusARConfig = {
 *     apiBase:  'https://nexus-ops-hub.netlify.app',  // URL do Nexus (padrão)
 *     skuField: 'auto',        // campo do datalayer: 'auto' tenta os comuns
 *                              // ou especifique: 'ecommerce.detail.products.0.id'
 *     insertAfter: '.buy-box', // seletor CSS do container alvo (ou 'auto')
 *     buttonText: 'Ver no meu ambiente 🏠', // texto do botão
 *     buttonClass: '',         // classe(s) CSS adicionais para o botão
 *   };
 * ============================================================
 */
(function () {
  'use strict';

  var cfg = Object.assign({
    apiBase:     'https://nexus-ops-hub.netlify.app',
    skuField:    'auto',
    insertAfter: 'auto',
    buttonText:  'Ver no meu ambiente \uD83C\uDFE0',
    buttonClass: '',
  }, window.NexusARConfig || {});

  // ── 1. Extrai SKU do dataLayer ─────────────────────────────────────────────
  function getSku() {
    if (cfg.skuField !== 'auto') {
      return deepGet(window, cfg.skuField.split('.'));
    }

    // Tenta as estruturas mais comuns de enhanced ecommerce / plataformas BR
    var dl = window.dataLayer || [];
    for (var i = dl.length - 1; i >= 0; i--) {
      var ev = dl[i];

      // GTM Enhanced Ecommerce (GA4)
      var g4 = deepGet(ev, ['ecommerce','items','0','item_id']);
      if (g4) return g4;

      // GTM Enhanced Ecommerce (UA)
      var ua = deepGet(ev, ['ecommerce','detail','products','0','id']);
      if (ua) return ua;
      ua = deepGet(ev, ['ecommerce','impressions','0','id']);
      if (ua) return ua;

      // VTEX
      if (ev.productId)  return ev.productId;
      if (ev.productSku) return ev.productSku;

      // Nuvemshop / Tray / genérico
      if (ev.sku)        return ev.sku;
      if (ev.product_id) return ev.product_id;
    }

    // Fallback: meta tag comum em Shopify / WooCommerce / VTEX
    var meta = document.querySelector(
      'meta[property="product:retailer_item_id"], ' +
      'meta[name="product_id"], ' +
      'meta[name="sku"]'
    );
    if (meta) return meta.content;

    return null;
  }

  function deepGet(obj, keys) {
    return keys.reduce(function (acc, k) {
      if (acc == null) return undefined;
      return typeof acc[k] !== 'undefined' ? acc[k] : undefined;
    }, obj);
  }

  // ── 2. Busca modelo na API ─────────────────────────────────────────────────
  function fetchModel(sku, callback) {
    var url = cfg.apiBase + '/.netlify/functions/carpet-api?action=by-sku&sku=' + encodeURIComponent(sku);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try { callback(JSON.parse(xhr.responseText)); }
        catch (e) { /* silencioso */ }
      }
    };
    xhr.send();
  }

  // ── 3. Injeta o botão na página ─────────────────────────────────────────────
  function injectButton(arUrl) {
    // Evita duplicatas
    if (document.getElementById('nexus-ar-btn')) return;

    var btn = document.createElement('a');
    btn.id        = 'nexus-ar-btn';
    btn.href      = arUrl;
    btn.target    = '_blank';
    btn.rel       = 'noopener';
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" style="vertical-align:middle;margin-right:6px">' +
      '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1.5"/>' +
      '<path d="M3 13.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5"/>' +
      '<path d="m9 12 2 2 4-4"/></svg>' +
      cfg.buttonText;

    // Estilos base (sobrescrevíveis via buttonClass)
    btn.setAttribute('style', [
      'display:inline-flex',
      'align-items:center',
      'padding:11px 22px',
      'background:#00327d',
      'color:#fff',
      'font-family:inherit',
      'font-size:14px',
      'font-weight:700',
      'border-radius:8px',
      'text-decoration:none',
      'margin-top:12px',
      'box-shadow:0 2px 12px rgba(0,50,125,.3)',
      'transition:opacity .15s',
    ].join(';'));
    btn.onmouseover = function () { btn.style.opacity = '.85'; };
    btn.onmouseout  = function () { btn.style.opacity = '1'; };

    if (cfg.buttonClass) btn.className = cfg.buttonClass;

    // Localiza onde inserir
    var anchor = findInsertionPoint();
    if (anchor) {
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    } else {
      document.body.appendChild(btn);
    }
  }

  function findInsertionPoint() {
    if (cfg.insertAfter !== 'auto') {
      return document.querySelector(cfg.insertAfter);
    }

    // Candidatos comuns (Shopify, VTEX, WooCommerce, Nuvemshop, Tray)
    var selectors = [
      '[class*="buy-button"]', '[class*="buyButton"]',
      '[class*="add-to-cart"]', '[class*="addToCart"]',
      '#add-to-cart', '.product-form__submit',
      '.vtex-button', '[class*="ProductButton"]',
      '.js-add-to-cart', '.btn-add-to-cart',
      '[data-testid*="buy"]', '[data-action*="cart"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  // ── 4. Bootstrap ─────────────────────────────────────────────────────────────
  function boot() {
    var sku = getSku();
    if (!sku) return; // sem SKU, não faz nada

    fetchModel(sku, function (data) {
      if (data && data.found && data.ar_url) {
        injectButton(data.ar_url);
      }
    });
  }

  // Aguarda DOM + dataLayer estar populado
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Pequeno delay para GTM preencher o dataLayer
    setTimeout(boot, 300);
  }
})();

/**
 * Nexus Ops — Carpet AR Widget  v2
 * ============================================================
 * Lê o SKU do dataLayer (VNDA / GA4 / UA / genérico), consulta
 * a API do Nexus e injeta o botão "Ver no ambiente" no canto
 * superior direito da primeira foto da galeria do produto.
 *
 * Instalação via GTM — Custom HTML tag:
 * ──────────────────────────────────────
 *   <script>
 *     window.NexusARConfig = {
 *       // Opcional — sobrescreve os padrões abaixo
 *       apiBase:    'https://nexus-ops-hub.netlify.app',
 *       skuField:   'auto',  // 'auto' ou caminho dotted: 'ecommerce.items.0.item_reference'
 *       buttonText: 'Ver no ambiente',
 *     };
 *   </script>
 *   <script src="https://nexus-ops-hub.netlify.app/marketing/carpet-widget.js"></script>
 *
 * O tag deve disparar no trigger "Page View" ou "DOM Ready"
 * da página de produto.
 * ============================================================
 */
(function () {
  'use strict';

  var cfg = Object.assign({
    apiBase:    'https://nexus-ops-hub.netlify.app',
    skuField:   'auto',
    buttonText: 'Ver no ambiente',
  }, window.NexusARConfig || {});

  // ── 1. Extrai SKU do dataLayer ──────────────────────────────────────────────
  function getSku() {
    if (cfg.skuField !== 'auto') {
      return deepGet(window, cfg.skuField.split('.')) || null;
    }

    var dl = window.dataLayer || [];
    for (var i = dl.length - 1; i >= 0; i--) {
      var ev = dl[i];

      // ── VNDA (GA4 enhanced ecommerce) ──
      // item_reference é o código/referência do produto
      var ref = deepGet(ev, ['ecommerce','items','0','item_reference']);
      if (ref) return ref;

      // item_id como fallback VNDA
      var iid = deepGet(ev, ['ecommerce','items','0','item_id']);
      if (iid) return String(iid);

      // ── GA4 genérico ──
      var g4 = deepGet(ev, ['ecommerce','items','0','item_sku'])
            || deepGet(ev, ['ecommerce','items','0','sku']);
      if (g4) return g4;

      // ── Universal Analytics (UA) ──
      var ua = deepGet(ev, ['ecommerce','detail','products','0','id'])
            || deepGet(ev, ['ecommerce','detail','products','0','sku']);
      if (ua) return ua;

      // ── Campos diretos (VTEX / Nuvemshop / Tray) ──
      if (ev.productSku)  return ev.productSku;
      if (ev.productId)   return String(ev.productId);
      if (ev.sku)         return ev.sku;
      if (ev.product_id)  return String(ev.product_id);
    }

    // ── Fallback: meta tags comuns ──
    var meta = document.querySelector(
      'meta[property="product:retailer_item_id"],' +
      'meta[name="product_id"],' +
      'meta[name="sku"]'
    );
    return meta ? meta.content : null;
  }

  function deepGet(obj, keys) {
    return keys.reduce(function (acc, k) {
      return (acc != null && acc[k] !== undefined) ? acc[k] : undefined;
    }, obj);
  }

  // ── 2. Busca modelo na API (XHR para compatibilidade máxima) ────────────────
  function fetchModel(sku, cb) {
    var url = cfg.apiBase +
      '/.netlify/functions/carpet-api?action=by-sku&sku=' +
      encodeURIComponent(sku);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try { cb(JSON.parse(xhr.responseText)); } catch (e) { /* silencioso */ }
      }
    };
    xhr.send();
  }

  // ── 3. Injeta botão na galeria ─────────────────────────────────────────────
  function injectButton(arUrl) {
    if (document.getElementById('nexus-ar-btn')) return;

    var btn = document.createElement('a');
    btn.id       = 'nexus-ar-btn';
    btn.href     = arUrl;
    btn.target   = '_blank';
    btn.rel      = 'noopener noreferrer';
    btn.title    = 'Visualizar tapete no seu ambiente com Realidade Aumentada';

    // ── Ícone AR (cubo 3D simples) ──
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ' +
      'style="flex-shrink:0">' +
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
      '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' +
      '</svg>' +
      '<span>' + cfg.buttonText + '</span>';

    // ── Estilo: pill no canto superior direito ──
    btn.style.cssText = [
      'position:absolute',
      'top:12px',
      'right:12px',
      'z-index:20',
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'padding:7px 13px',
      'background:rgba(0,30,80,0.80)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'color:#ffffff',
      'font-size:12px',
      'font-weight:700',
      'font-family:inherit',
      'letter-spacing:.02em',
      'border-radius:999px',
      'text-decoration:none',
      'box-shadow:0 2px 10px rgba(0,0,0,.30)',
      'transition:opacity .15s,transform .15s',
      'cursor:pointer',
      'user-select:none',
    ].join(';');

    btn.addEventListener('mouseover', function() { btn.style.opacity='.85'; });
    btn.addEventListener('mouseout',  function() { btn.style.opacity='1'; });

    // ── Destino de injeção: primeiro slide da galeria principal ──
    // VNDA: #image-0  |  fallback: primeiro .swiper-slide do main-slider
    var target =
      document.querySelector('#image-0') ||
      document.querySelector('[data-main-slider] .swiper-slide:first-child') ||
      document.querySelector('[data-main-slider] .item-image') ||
      document.querySelector('.main-slider .swiper-slide:first-child') ||
      document.querySelector('.product-images');

    if (target) {
      // Garante position:relative para o absolute funcionar
      var pos = window.getComputedStyle(target).position;
      if (pos === 'static') target.style.position = 'relative';
      target.appendChild(btn);
    } else {
      // Fallback: antes/depois do botão de compra
      var buyBtn = document.querySelector(
        '[class*="buy-button"],[class*="buyButton"],[class*="add-to-cart"],' +
        '#add-to-cart,.vtex-button,.product-form__submit,.js-add-to-cart'
      );
      if (buyBtn) {
        btn.style.position = 'static';   // não é overlay, é inline
        btn.style.display  = 'flex';
        btn.style.marginTop = '12px';
        buyBtn.parentNode.insertBefore(btn, buyBtn.nextSibling);
      } else {
        document.body.appendChild(btn);
      }
    }
  }

  // ── 4. Bootstrap ─────────────────────────────────────────────────────────────
  function boot() {
    var sku = getSku();
    if (!sku) return;

    fetchModel(sku, function (data) {
      if (data && data.found && data.ar_url) {
        injectButton(data.ar_url);
      }
    });
  }

  // Aguarda DOM + dataLayer populado (GTM preenche antes do DOMContentLoaded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 200); // delay mínimo para GTM/VNDA popularem o dataLayer
  }
})();

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   Nexus Ops | Urgency Bar Widget  v1.0                  ║
 * ║   Gerado via Nexus Ops Marketing Hub                    ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * INSTALAÇÃO VIA GOOGLE TAG MANAGER
 * ─────────────────────────────────
 * 1. GTM → Tags → Nova → HTML Personalizado
 * 2. Cole este arquivo inteiro no campo HTML
 * 3. Ajuste o objeto de configuração abaixo (ou use uma
 *    Variável GTM do tipo JavaScript para sobrescrever)
 * 4. Acionador: All Pages (ou por URL condition)
 * 5. Publique e teste com o Preview do GTM
 *
 * CONFIGURAÇÃO VIA VARIÁVEL GTM
 * ─────────────────────────────
 * Antes deste script, crie uma tag que defina:
 *   window.NexusUrgencyBarConfig = { text: '...', ... };
 *
 * As propriedades em NexusUrgencyBarConfig sobrescrevem
 * os valores padrão definidos aqui.
 */

(function () {
  'use strict';

  // ── Prevenção de dupla execução ──────────────────────────
  if (window.__nexusUrgencyBarLoaded) return;
  window.__nexusUrgencyBarLoaded = true;

  // ── Configuração padrão ──────────────────────────────────
  //    Sobrescreva via window.NexusUrgencyBarConfig = { ... }
  var DEFAULTS = {
    /** Texto principal exibido na barra */
    text: '🔥 Frete grátis por tempo limitado!',

    /** Subtexto opcional (string vazia para omitir) */
    subtext: 'Use o cupom FRETEGRATIS',

    /** Label do botão de chamada para ação */
    ctaLabel: 'Aproveitar agora →',

    /** URL de destino ao clicar no CTA */
    ctaUrl: '/',

    /** Posição da barra: 'top' | 'bottom' */
    position: 'top',

    /** Cor de fundo principal (CSS color string) */
    bgColor: '#00327d',

    /**
     * Segunda cor para gradiente (null = cor sólida)
     * Exemplo: '#0047ab'
     */
    bgColorEnd: '#0047ab',

    /** Cor do texto e dos elementos */
    fgColor: '#ffffff',

    /** Mostrar countdown timer */
    showTimer: true,

    /**
     * Data/hora de expiração (ISO 8601 ou Date-parseable).
     * Quando o timer zera, a barra é removida automaticamente.
     * null = sem expiração
     * Exemplo: '2025-12-31T23:59:59'
     */
    expiresAt: null,

    /** Mostrar botão "×" para fechar a barra */
    showClose: true,

    /**
     * Chave de sessionStorage usada para lembrar que o
     * usuário já fechou a barra (dentro da mesma sessão).
     */
    sessionKey: 'nx-ub-dismissed',

    /**
     * Delay em segundos antes de exibir a barra.
     * 0 = exibe imediatamente após o DOM carregar.
     */
    delaySeconds: 0,

    /**
     * Altura que a barra vai adicionar ao body (px).
     * 'auto' = detecta automaticamente após render.
     * 0 = não ajusta o body (pode sobrepor conteúdo).
     */
    bodyOffset: 'auto',

    /**
     * Callback chamado ao clicar no CTA.
     * Assinatura: function(event) {}
     */
    onCtaClick: null,

    /**
     * Callback chamado ao fechar a barra.
     * Assinatura: function() {}
     */
    onDismiss: null,
  };

  // ── Merge configuração do usuário ────────────────────────
  var C = Object.assign({}, DEFAULTS, window.NexusUrgencyBarConfig || {});

  // ── Verificar se já foi dispensada nesta sessão ──────────
  if (C.showClose) {
    try {
      if (sessionStorage.getItem(C.sessionKey)) return;
    } catch (e) { /* sessionStorage pode não estar disponível */ }
  }

  // ── Construção do elemento ───────────────────────────────
  function buildBar() {
    var bg = C.bgColorEnd
      ? 'linear-gradient(135deg,' + C.bgColor + ',' + C.bgColorEnd + ')'
      : C.bgColor;

    var bar = document.createElement('div');
    bar.id = 'nx-urgency-bar';
    bar.setAttribute('role', 'banner');
    bar.setAttribute('aria-label', 'Oferta especial');

    bar.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex-wrap:wrap',
      'gap:10px',
      'padding:9px 20px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
      'font-size:14px',
      'line-height:1.4',
      'background:' + bg,
      'color:' + C.fgColor,
      'position:fixed',
      C.position + ':0',
      'left:0',
      'right:0',
      'z-index:2147483647',
      'box-shadow:0 2px 12px rgba(0,0,0,.18)',
      'transform:translateY(' + (C.position === 'top' ? '-100%' : '100%') + ')',
      'transition:transform .35s cubic-bezier(.34,1.56,.64,1)',
    ].join(';');

    // Texto principal + subtexto
    var textWrap = document.createElement('span');
    textWrap.style.cssText = 'font-weight:600;';
    textWrap.textContent = C.text;
    if (C.subtext) {
      textWrap.innerHTML =
        escapeHtml(C.text) +
        ' <span style="font-weight:400;opacity:.82;">' +
        escapeHtml(C.subtext) +
        '</span>';
    }
    bar.appendChild(textWrap);

    // Timer
    if (C.showTimer && C.expiresAt) {
      var timerEl = document.createElement('span');
      timerEl.id = 'nx-ub-timer';
      timerEl.setAttribute('aria-live', 'polite');
      timerEl.setAttribute('aria-label', 'Tempo restante');
      timerEl.style.cssText = [
        'font-weight:700',
        'font-variant-numeric:tabular-nums',
        'letter-spacing:.04em',
        'font-size:13px',
        'background:rgba(255,255,255,.18)',
        'padding:2px 10px',
        'border-radius:4px',
        'color:' + C.fgColor,
        'white-space:nowrap',
      ].join(';');
      bar.appendChild(timerEl);
    }

    // CTA Button
    if (C.ctaLabel) {
      var cta = document.createElement('a');
      cta.href = C.ctaUrl || '#';
      cta.textContent = C.ctaLabel;
      cta.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'padding:5px 14px',
        'border-radius:5px',
        'background:rgba(255,255,255,.15)',
        'color:' + C.fgColor,
        'font-weight:600',
        'font-size:13px',
        'text-decoration:none',
        'border:1px solid rgba(255,255,255,.35)',
        'cursor:pointer',
        'white-space:nowrap',
        'transition:background .15s',
      ].join(';');

      cta.addEventListener('mouseenter', function () {
        cta.style.background = 'rgba(255,255,255,.28)';
      });
      cta.addEventListener('mouseleave', function () {
        cta.style.background = 'rgba(255,255,255,.15)';
      });

      if (typeof C.onCtaClick === 'function') {
        cta.addEventListener('click', C.onCtaClick);
      }

      bar.appendChild(cta);
    }

    // Close button
    if (C.showClose) {
      var closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Fechar oferta');
      closeBtn.style.cssText = [
        'background:none',
        'border:none',
        'cursor:pointer',
        'color:' + C.fgColor,
        'opacity:.7',
        'font-size:22px',
        'line-height:1',
        'padding:0 4px',
        'display:flex',
        'align-items:center',
        'transition:opacity .15s',
        'flex-shrink:0',
      ].join(';');

      closeBtn.addEventListener('mouseenter', function () { closeBtn.style.opacity = '1'; });
      closeBtn.addEventListener('mouseleave', function () { closeBtn.style.opacity = '.7'; });
      closeBtn.addEventListener('click', dismiss);
      bar.appendChild(closeBtn);
    }

    return bar;
  }

  // ── Dismiss ───────────────────────────────────────────────
  function dismiss() {
    var bar = document.getElementById('nx-urgency-bar');
    if (bar) {
      bar.style.transform = 'translateY(' + (C.position === 'top' ? '-100%' : '100%') + ')';
      setTimeout(function () {
        if (bar.parentNode) bar.parentNode.removeChild(bar);
        // Remove body offset
        if (C.position === 'top') {
          var currentPad = parseInt(document.body.style.paddingTop, 10) || 0;
          document.body.style.paddingTop = Math.max(0, currentPad - _barHeight) + 'px';
        }
      }, 380);
    }
    try { sessionStorage.setItem(C.sessionKey, '1'); } catch (e) {}
    if (typeof C.onDismiss === 'function') C.onDismiss();
  }

  // ── Countdown ─────────────────────────────────────────────
  var _timerInterval = null;
  function startTimer() {
    if (!C.showTimer || !C.expiresAt) return;
    var el = document.getElementById('nx-ub-timer');
    if (!el) return;

    function tick() {
      var diff = new Date(C.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        el.textContent = '00:00:00';
        clearInterval(_timerInterval);
        dismiss();
        return;
      }
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      el.textContent =
        pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    tick();
    _timerInterval = setInterval(tick, 1000);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  // ── Body offset (push content down) ──────────────────────
  var _barHeight = 0;
  function applyBodyOffset(bar) {
    if (C.position !== 'top') return;
    if (C.bodyOffset === 0) return;

    if (C.bodyOffset === 'auto') {
      _barHeight = bar.offsetHeight || 42;
    } else {
      _barHeight = parseInt(C.bodyOffset, 10) || 0;
    }

    var current = parseInt(document.body.style.paddingTop, 10) || 0;
    document.body.style.paddingTop = (current + _barHeight) + 'px';
  }

  // ── Mount ─────────────────────────────────────────────────
  function mount() {
    var bar = buildBar();
    document.body.insertAdjacentElement(
      C.position === 'top' ? 'afterbegin' : 'beforeend',
      bar
    );

    // Animate in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bar.style.transform = 'translateY(0)';
      });
    });

    // Apply body offset after animation settles
    setTimeout(function () { applyBodyOffset(bar); }, 400);

    startTimer();
  }

  // ── Entry point with delay ────────────────────────────────
  function init() {
    var delay = Math.max(0, parseFloat(C.delaySeconds) || 0) * 1000;
    if (delay > 0) {
      setTimeout(function () {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', mount);
        } else {
          mount();
        }
      }, delay);
    } else {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
      } else {
        mount();
      }
    }
  }

  // ── Util ─────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Kick off ─────────────────────────────────────────────
  try {
    init();
  } catch (e) {
    // Fail silently in production — never break the host page
    if (window.console && console.error) {
      console.error('[Nexus Urgency Bar] Erro ao inicializar:', e);
    }
  }

})();

/*
 * ──────────────────────────────────────────────────────────
 * EXEMPLO DE USO CUSTOMIZADO (antes deste script)
 * ──────────────────────────────────────────────────────────
 *
 * window.NexusUrgencyBarConfig = {
 *   text:          'Oferta Flash! Só hoje.',
 *   subtext:       'Desconto de 30% em tapetes selecionados',
 *   ctaLabel:      'Ver promoções',
 *   ctaUrl:        '/promocoes',
 *   position:      'top',
 *   bgColor:       '#651f00',
 *   bgColorEnd:    '#8b2e00',
 *   fgColor:       '#ffffff',
 *   showTimer:     true,
 *   expiresAt:     '2025-12-31T23:59:59',
 *   showClose:     true,
 *   delaySeconds:  3,
 *   onCtaClick:    function(e) { console.log('CTA clicado'); },
 *   onDismiss:     function()  { console.log('Barra fechada'); },
 * };
 *
 * ──────────────────────────────────────────────────────────
 * INTEGRAÇÃO COM GOOGLE ANALYTICS (GA4)
 * ──────────────────────────────────────────────────────────
 *
 * window.NexusUrgencyBarConfig = {
 *   // ... outras configs ...
 *   onCtaClick: function() {
 *     if (window.gtag) {
 *       gtag('event', 'urgency_bar_click', {
 *         event_category: 'marketing',
 *         event_label: 'frete_gratis_bar',
 *       });
 *     }
 *   },
 * };
 *
 */

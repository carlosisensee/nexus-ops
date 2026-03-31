/**
 * Nexus Ops Shell v2.0
 * ─────────────────────────────────────────────────────────
 * Layout: narrow icon-only sidebar (56px, dark) on desktop,
 *         slide-in overlay sidebar (260px) on mobile.
 *
 * Usage:
 *   <script>window.NEXUS_BASE = '../';</script>
 *   <script>window.NEXUS_PAGE = { module: 'marketing' };</script>
 *   <script src="../core/nexus-shell.js"></script>
 *   Page must have <div id="nexus-main"> as content wrapper.
 *
 * Breakpoints:
 *   Desktop ≥ 768px → 56px icon-only sidebar, tooltip on hover
 *   Mobile  < 768px → hamburger + 260px overlay sidebar with labels
 */

(function () {
  'use strict';

  var BASE = window.NEXUS_BASE || './';
  var PAGE = window.NEXUS_PAGE || {};
  var path = window.location.pathname;

  // ── Module registry ──────────────────────────────────────
  var MODULES = [
    { id: 'dashboard',   label: 'Dashboard',   icon: 'grid_view',      href: BASE + 'index.html',            match: ['index.html'], accent: '#4d8eff' },
    { id: 'commercial',  label: 'Comercial',   icon: 'storefront',     href: BASE + 'commercial/index.html', match: ['/commercial/'], accent: '#4d8eff' },
    { id: 'marketing',   label: 'Marketing',   icon: 'campaign',       href: BASE + 'marketing/index.html',  match: ['/marketing/'], accent: '#a78bfa' },
    { id: 'logistics',   label: 'Logística',   icon: 'local_shipping', href: BASE + 'logistics/index.html',  match: ['/logistics/'], accent: '#4ade80' },
    { id: 'warehouse',   label: 'Warehouse',   icon: 'warehouse',      href: BASE + 'warehouse/index.html',  match: ['/warehouse/'], accent: '#fb923c' },
    { id: 'operational', label: 'Operacional', icon: 'tune',           href: BASE + 'operational/index.html',match: ['/operational/'], accent: '#f87171' },
  ];

  // ── Helpers ───────────────────────────────────────────────
  function isActive(mod) {
    if (PAGE.module && PAGE.module === mod.id) return true;
    return mod.match.some(function (m) { return path.indexOf(m) !== -1; });
  }

  // ── Sidebar ───────────────────────────────────────────────
  function buildSidebar() {
    var navItems = MODULES.map(function (mod) {
      var active = isActive(mod);
      return [
        '<a href="' + mod.href + '" class="nexus-nav-item' + (active ? ' nexus-nav-active' : '') + '"',
        ' data-accent="' + mod.accent + '"',
        ' aria-label="' + mod.label + '">',
        // Icon
        '<span class="material-symbols-outlined nexus-nav-icon" style="',
          active
            ? 'color:' + mod.accent + ';font-variation-settings:"FILL" 1,"wght" 400,"GRAD" 0,"opsz" 24;'
            : 'color:rgba(255,255,255,.5);',
        '">' + mod.icon + '</span>',
        // Label (visible on mobile overlay, hidden on desktop)
        '<span class="nexus-nav-label">' + mod.label + '</span>',
        // Tooltip (desktop only)
        '<span class="nexus-tooltip">' + mod.label + '</span>',
        '</a>',
      ].join('');
    }).join('');

    return [
      '<nav id="nexus-sidebar" role="navigation" aria-label="Módulos">',

      // Logo area
      '<div id="nexus-logo-area">',
      '<div id="nexus-logo-icon">',
      '<span class="material-symbols-outlined" style="font-size:16px;color:#fff;font-variation-settings:\'FILL\' 1,\'wght\' 600,\'GRAD\' 0,\'opsz\' 24;">hub</span>',
      '</div>',
      // Mobile: logo text (shown when sidebar is open)
      '<div id="nexus-logo-text">',
      '<div style="font-family:\'Manrope\',sans-serif;font-size:13px;font-weight:700;color:#fff;line-height:1;">Nexus Ops</div>',
      '<div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">Operational Suite</div>',
      '</div>',
      // Close button (mobile only)
      '<button id="nexus-close-btn" aria-label="Fechar menu">',
      '<span class="material-symbols-outlined" style="font-size:20px;color:rgba(255,255,255,.6);">close</span>',
      '</button>',
      '</div>',

      // Nav items
      '<div id="nexus-nav-list">',
      navItems,
      '</div>',

      // Bottom section
      '<div id="nexus-sidebar-bottom">',
      '<a href="' + BASE + 'settings.html" class="nexus-nav-item" aria-label="Settings">',
      '<span class="material-symbols-outlined nexus-nav-icon" style="color:rgba(255,255,255,.4);">settings</span>',
      '<span class="nexus-nav-label">Settings</span>',
      '<span class="nexus-tooltip">Settings</span>',
      '</a>',
      // Avatar
      '<div id="nexus-avatar">',
      '<span style="font-family:\'Manrope\',sans-serif;font-size:11px;font-weight:700;color:#fff;">CA</span>',
      '</div>',
      '</div>',

      '</nav>',
    ].join('');
  }

  // ── Topbar ────────────────────────────────────────────────
  function buildTopbar() {
    return [
      '<header id="nexus-topbar">',

      // Hamburger (mobile only)
      '<button id="nexus-hamburger" aria-label="Abrir menu" aria-expanded="false">',
      '<span class="material-symbols-outlined" style="font-size:22px;color:#434653;">menu</span>',
      '</button>',

      // Mobile logo
      '<div id="nexus-mobile-logo">',
      '<span style="font-family:\'Manrope\',sans-serif;font-size:14px;font-weight:700;color:#191c1d;">Nexus Ops</span>',
      '</div>',

      // Search (desktop)
      '<div id="nexus-search-wrap">',
      '<span class="material-symbols-outlined" style="font-size:18px;color:#737784;flex-shrink:0;">search</span>',
      '<input id="nexus-search" type="text" placeholder="Buscar módulos, dados, SKUs..." />',
      '</div>',

      // Right actions
      '<div id="nexus-topbar-actions">',

      // Notification bell
      '<button class="nexus-icon-btn" aria-label="Notificações" style="position:relative;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;">',
      '<span class="material-symbols-outlined" style="font-size:20px;color:#434653;">notifications</span>',
      '<span style="position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:#ba1a1a;border:1.5px solid #f8f9fa;"></span>',
      '</button>',

      // Quick action (hidden on mobile/small tablet)
      '<button id="nexus-quick-action">',
      '<span class="material-symbols-outlined" style="font-size:16px;color:#fff;">add</span>',
      'Quick Action',
      '</button>',

      // Avatar
      '<div id="nexus-topbar-avatar">CA</div>',

      '</div>',
      '</header>',
    ].join('');
  }

  // ── Backdrop ──────────────────────────────────────────────
  function buildBackdrop() {
    return '<div id="nexus-backdrop" aria-hidden="true"></div>';
  }

  // ── Styles ────────────────────────────────────────────────
  function injectStyles() {
    var css = [

      // ─────────────────────────────────────────────────────────
      // SIDEBAR  (dark, 56px icon-only on desktop)
      // ─────────────────────────────────────────────────────────
      '#nexus-sidebar{',
        'position:fixed;left:0;top:0;height:100%;width:56px;z-index:40;',
        'display:flex;flex-direction:column;align-items:center;',
        'background:#16181d;',
        'padding:8px 0 12px;',
        'overflow:visible;',
      '}',

      // Logo area
      '#nexus-logo-area{',
        'width:100%;display:flex;align-items:center;justify-content:center;',
        'padding:6px 0 12px;border-bottom:1px solid rgba(255,255,255,.07);',
        'margin-bottom:8px;',
      '}',
      '#nexus-logo-icon{',
        'width:32px;height:32px;border-radius:9px;',
        'background:linear-gradient(135deg,#00327d,#0047ab);',
        'display:flex;align-items:center;justify-content:center;',
        'flex-shrink:0;',
      '}',
      '#nexus-logo-text{display:none;}',  // shown on mobile
      '#nexus-close-btn{display:none;}',  // shown on mobile

      // Nav list
      '#nexus-nav-list{',
        'flex:1;display:flex;flex-direction:column;align-items:center;',
        'gap:2px;width:100%;padding:0 8px;overflow:visible;',
      '}',

      // Nav items
      '.nexus-nav-item{',
        'position:relative;',
        'width:40px;height:40px;border-radius:10px;',
        'display:flex;align-items:center;justify-content:center;',
        'text-decoration:none;cursor:pointer;',
        'transition:background .15s;',
        'flex-shrink:0;',
      '}',
      '.nexus-nav-item:hover{background:rgba(255,255,255,.08);}',
      '.nexus-nav-active{background:rgba(255,255,255,.12)!important;}',

      // Icon
      '.nexus-nav-icon{font-size:20px !important;}',

      // Label — hidden on desktop, shown in mobile overlay
      '.nexus-nav-label{display:none;}',

      // Tooltip — shown on desktop hover
      '.nexus-tooltip{',
        'position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);',
        'background:#2d3039;color:#fff;',
        'font-family:\'Inter\',sans-serif;font-size:12px;font-weight:600;',
        'padding:5px 10px;border-radius:6px;',
        'white-space:nowrap;pointer-events:none;',
        'opacity:0;transition:opacity .12s .08s;',
        'box-shadow:0 4px 16px rgba(0,0,0,.4);',
        'z-index:100;',
      '}',
      '.nexus-tooltip::before{',
        'content:"";position:absolute;right:100%;top:50%;transform:translateY(-50%);',
        'border:5px solid transparent;border-right-color:#2d3039;',
      '}',
      '.nexus-nav-item:hover .nexus-tooltip{opacity:1;}',

      // Bottom section
      '#nexus-sidebar-bottom{',
        'width:100%;display:flex;flex-direction:column;align-items:center;',
        'gap:8px;padding:12px 8px 0;',
        'border-top:1px solid rgba(255,255,255,.07);',
      '}',
      '#nexus-avatar{',
        'width:30px;height:30px;border-radius:50%;',
        'background:linear-gradient(135deg,#00327d,#2559bd);',
        'display:flex;align-items:center;justify-content:center;',
      '}',

      // ─────────────────────────────────────────────────────────
      // TOPBAR
      // ─────────────────────────────────────────────────────────
      '#nexus-topbar{',
        'position:fixed;left:56px;right:0;top:0;height:56px;z-index:30;',
        'display:flex;align-items:center;',
        'gap:12px;padding:0 20px;',
        'background:rgba(248,249,250,.96);',
        'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
        'border-bottom:1px solid rgba(195,198,213,.3);',
      '}',

      // Hamburger (hidden desktop)
      '#nexus-hamburger{',
        'display:none;align-items:center;justify-content:center;',
        'width:40px;height:40px;border:none;background:none;cursor:pointer;',
        'border-radius:50%;transition:background .15s;flex-shrink:0;',
      '}',
      '#nexus-hamburger:hover{background:#edeeef;}',

      // Mobile logo (hidden desktop)
      '#nexus-mobile-logo{display:none;flex-shrink:0;}',

      // Search
      '#nexus-search-wrap{',
        'display:flex;align-items:center;gap:8px;',
        'padding:7px 14px;background:#edeeef;border-radius:9999px;',
        'flex:1;max-width:360px;',
      '}',
      '#nexus-search{',
        'background:none;border:none;outline:none;',
        'font-family:\'Inter\',sans-serif;font-size:13px;color:#191c1d;width:100%;',
      '}',

      // Right actions
      '#nexus-topbar-actions{',
        'display:flex;align-items:center;gap:8px;margin-left:auto;',
      '}',

      // Icon button
      '.nexus-icon-btn{background:none;border:none;cursor:pointer;}',
      '.nexus-icon-btn:hover{background:#edeeef;border-radius:50%;}',

      // Quick action button
      '#nexus-quick-action{',
        'display:flex;align-items:center;gap:6px;',
        'padding:6px 16px;border-radius:9999px;border:none;cursor:pointer;',
        'background:linear-gradient(135deg,#00327d,#0047ab);',
        'color:#fff;font-family:\'Inter\',sans-serif;font-size:13px;font-weight:500;',
        'white-space:nowrap;',
      '}',

      // Topbar avatar
      '#nexus-topbar-avatar{',
        'width:32px;height:32px;border-radius:50%;flex-shrink:0;',
        'background:linear-gradient(135deg,#00327d,#2559bd);',
        'display:flex;align-items:center;justify-content:center;',
        'font-family:\'Manrope\',sans-serif;font-size:11px;font-weight:700;color:#fff;',
        'margin-left:4px;',
      '}',

      // ─────────────────────────────────────────────────────────
      // MAIN CONTENT
      // ─────────────────────────────────────────────────────────
      '#nexus-main{',
        'margin-left:56px;padding-top:56px;min-height:100vh;',
        'background:#f8f9fa;',
      '}',

      // ─────────────────────────────────────────────────────────
      // BACKDROP
      // ─────────────────────────────────────────────────────────
      '#nexus-backdrop{',
        'display:none;position:fixed;inset:0;',
        'background:rgba(0,0,0,.55);z-index:39;',
        'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);',
      '}',
      '#nexus-backdrop.nexus-open{display:block;}',

      // ─────────────────────────────────────────────────────────
      // MOBILE  (< 768px)
      // ─────────────────────────────────────────────────────────
      '@media(max-width:767px){',

        // Sidebar: hidden off-screen, 260px overlay with labels
        '#nexus-sidebar{',
          'width:260px;transform:translateX(-100%);',
          'align-items:flex-start;padding:8px 0 12px;',
          'transition:transform .25s cubic-bezier(.4,0,.2,1);',
        '}',
        '#nexus-sidebar.nexus-open{',
          'transform:translateX(0);',
          'box-shadow:8px 0 40px rgba(0,0,0,.35);',
        '}',

        // Logo area in overlay: show full logo + close button
        '#nexus-logo-area{',
          'padding:14px 16px 14px;justify-content:flex-start;gap:12px;',
        '}',
        '#nexus-logo-text{display:block;}',
        '#nexus-close-btn{',
          'display:flex;align-items:center;justify-content:center;',
          'margin-left:auto;width:32px;height:32px;',
          'border:none;background:none;cursor:pointer;border-radius:50%;',
        '}',
        '#nexus-close-btn:hover{background:rgba(255,255,255,.08);}',

        // Nav items in overlay: icon + label side by side
        '#nexus-nav-list{align-items:stretch;padding:0 8px;}',
        '.nexus-nav-item{width:100%;height:auto;padding:10px 12px;justify-content:flex-start;gap:12px;border-radius:8px;}',
        '.nexus-nav-label{display:block;font-family:\'Inter\',sans-serif;font-size:13px;color:rgba(255,255,255,.7);}',
        '.nexus-nav-active .nexus-nav-label{color:#fff;font-weight:600;}',
        '.nexus-tooltip{display:none !important;}',

        // Bottom section
        '#nexus-sidebar-bottom{align-items:flex-start;padding:12px 16px 0;}',
        '#nexus-sidebar-bottom .nexus-nav-item{width:100%;padding:10px 12px;justify-content:flex-start;gap:12px;}',
        '#nexus-avatar{display:none;}',

        // Topbar: full-width, hamburger visible
        '#nexus-topbar{left:0;}',
        '#nexus-hamburger{display:flex;}',
        '#nexus-search-wrap{display:none !important;}',
        '#nexus-quick-action{display:none !important;}',
        '#nexus-mobile-logo{display:flex;align-items:center;}',

        // Main: no left margin
        '#nexus-main{margin-left:0;}',
      '}',

      // ─────────────────────────────────────────────────────────
      // SMALL TABLET  (768px – 1023px): icon sidebar + no quick action
      // ─────────────────────────────────────────────────────────
      '@media(min-width:768px) and (max-width:1023px){',
        '#nexus-quick-action{display:none !important;}',
      '}',

    ].join('');

    var style = document.createElement('style');
    style.id = 'nexus-shell-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Mobile nav interactions ───────────────────────────────
  function initMobileNav() {
    var hamburger = document.getElementById('nexus-hamburger');
    var closeBtn  = document.getElementById('nexus-close-btn');
    var sidebar   = document.getElementById('nexus-sidebar');
    var backdrop  = document.getElementById('nexus-backdrop');

    function openSidebar() {
      sidebar.classList.add('nexus-open');
      backdrop.classList.add('nexus-open');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      sidebar.classList.remove('nexus-open');
      backdrop.classList.remove('nexus-open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', function () {
      sidebar.classList.contains('nexus-open') ? closeSidebar() : openSidebar();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('nexus-open')) closeSidebar();
    });
  }

  // ── Mount ─────────────────────────────────────────────────
  function mount() {
    injectStyles();

    var bd = document.createElement('div');
    bd.innerHTML = buildBackdrop();
    document.body.insertAdjacentElement('afterbegin', bd.firstElementChild);

    var sb = document.createElement('div');
    sb.innerHTML = buildSidebar();
    document.body.insertAdjacentElement('afterbegin', sb.firstElementChild);

    var tb = document.createElement('div');
    tb.innerHTML = buildTopbar();
    document.body.insertAdjacentElement('afterbegin', tb.firstElementChild);

    initMobileNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();

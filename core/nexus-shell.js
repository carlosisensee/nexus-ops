/**
 * Nexus Ops Shell v1.1
 * ─────────────────────────────────────────────────────────
 * Shared sidebar + topbar component for all module pages.
 * Fully responsive: hamburger + overlay on mobile, fixed sidebar on desktop.
 *
 * Usage in any page:
 *   <script>window.NEXUS_BASE = '../';</script>   ← depth relative to root
 *   <script>window.NEXUS_PAGE = { module: 'marketing', title: 'Marketing Hub' };</script>
 *   <script src="../core/nexus-shell.js"></script>
 *
 * The page must have <div id="nexus-main"> as its content wrapper.
 * The shell automatically applies the correct margin offsets.
 *
 * Breakpoints:
 *   Mobile  < 768px  → hamburger button + slide-in overlay sidebar
 *   Desktop ≥ 768px  → always-visible fixed sidebar
 */

(function () {
  'use strict';

  var BASE   = window.NEXUS_BASE   || './';
  var PAGE   = window.NEXUS_PAGE   || {};
  var path   = window.location.pathname;

  // ── Module registry ──────────────────────────────────────
  var MODULES = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'grid_view',
      href: BASE + 'index.html',
      match: ['index.html'],
      accent: '#00327d',
    },
    {
      id: 'commercial',
      label: 'Comercial',
      icon: 'storefront',
      href: BASE + 'commercial/index.html',
      match: ['/commercial/'],
      accent: '#00327d',
    },
    {
      id: 'marketing',
      label: 'Marketing',
      icon: 'campaign',
      href: BASE + 'marketing/index.html',
      match: ['/marketing/'],
      accent: '#6d28d9',
    },
    {
      id: 'logistics',
      label: 'Logística',
      icon: 'local_shipping',
      href: BASE + 'logistics/index.html',
      match: ['/logistics/'],
      accent: '#1b6d24',
    },
    {
      id: 'warehouse',
      label: 'Warehouse',
      icon: 'warehouse',
      href: BASE + 'warehouse/index.html',
      match: ['/warehouse/'],
      accent: '#651f00',
    },
    {
      id: 'operational',
      label: 'Operacional',
      icon: 'tune',
      href: BASE + 'operational/index.html',
      match: ['/operational/'],
      accent: '#651f00',
    },
  ];

  // ── Helpers ───────────────────────────────────────────────
  function isActive(mod) {
    if (PAGE.module && PAGE.module === mod.id) return true;
    return mod.match.some(function (m) { return path.indexOf(m) !== -1; });
  }

  function icon(name, extraStyle) {
    return '<span class="material-symbols-outlined" style="font-size:20px;' +
      (extraStyle || '') + '">' + name + '</span>';
  }

  // ── Sidebar ───────────────────────────────────────────────
  function buildSidebar() {
    var navItems = MODULES.map(function (mod) {
      var active = isActive(mod);
      return [
        '<a href="' + mod.href + '" class="nexus-nav-item flex items-center gap-3 px-3 py-2.5 rounded-full transition-all duration-150 no-underline',
        active ? ' nexus-nav-active' : '',
        '">',
        icon(mod.icon, active
          ? 'color:' + mod.accent + ';font-variation-settings:"FILL" 1,"wght" 400,"GRAD" 0,"opsz" 24;'
          : 'color:#434653;'),
        '<span class="font-body leading-none" style="font-size:13px;font-weight:' + (active ? '600' : '400') + ';color:' + (active ? '#191c1d' : '#434653') + '">',
        mod.label,
        '</span>',
        '</a>',
      ].join('');
    }).join('');

    return [
      '<nav id="nexus-sidebar">',

      // Logo area with close button (mobile)
      '<div class="nexus-logo-area" style="padding:18px 16px 12px; display:flex; align-items:center; justify-content:space-between;">',
      '<div style="display:flex; align-items:center; gap:10px;">',
      '<div class="flex items-center justify-center rounded-lg" style="width:28px;height:28px;background:linear-gradient(135deg,#00327d,#0047ab);">',
      icon('hub', 'font-size:14px;color:#fff;font-variation-settings:"FILL" 1,"wght" 600,"GRAD" 0,"opsz" 24;'),
      '</div>',
      '<div>',
      '<div class="font-headline" style="font-size:13px;font-weight:700;color:#191c1d;line-height:1;">Nexus Ops</div>',
      '<div class="font-body" style="font-size:10px;color:#737784;text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">Operational Suite</div>',
      '</div>',
      '</div>',
      // Close button (mobile only)
      '<button id="nexus-close-btn" aria-label="Fechar menu" style="display:none;align-items:center;justify-content:center;width:32px;height:32px;border:none;background:none;cursor:pointer;border-radius:50%;color:#434653;">',
      '<span class="material-symbols-outlined" style="font-size:20px;">close</span>',
      '</button>',
      '</div>',

      // Nav
      '<div class="flex flex-col" style="padding:4px 12px;gap:2px;flex:1;">',
      navItems,
      '</div>',

      // Bottom
      '<div style="padding:12px;border-top:1px solid rgba(195,198,213,.35);">',
      '<a href="' + BASE + 'settings.html" class="nexus-nav-item flex items-center gap-3 px-3 py-2 rounded-full no-underline">',
      icon('settings', 'font-size:18px;color:#737784;'),
      '<span class="font-body" style="font-size:13px;color:#434653;">Settings</span>',
      '</a>',
      '</div>',
      '</nav>',
    ].join('');
  }

  // ── Topbar ────────────────────────────────────────────────
  function buildTopbar() {
    var pageTitle = PAGE.title || 'Nexus Ops';
    return [
      '<header id="nexus-topbar" class="flex items-center" style="gap:12px;padding:0 16px;">',

      // Hamburger (mobile only)
      '<button id="nexus-hamburger" aria-label="Abrir menu" aria-expanded="false">',
      '<span class="material-symbols-outlined" style="font-size:22px;color:#434653;">menu</span>',
      '</button>',

      // Mobile logo text
      '<div id="nexus-mobile-logo" style="display:none;">',
      '<span class="font-headline" style="font-size:14px;font-weight:700;color:#191c1d;">Nexus Ops</span>',
      '</div>',

      // Search (hidden on mobile)
      '<div id="nexus-search-wrap" class="flex items-center rounded-full" style="gap:8px;padding:6px 14px;background:#edeeef;flex:1;max-width:360px;">',
      icon('search', 'font-size:18px;color:#737784;'),
      '<input id="nexus-search" type="text" placeholder="Buscar módulos, dados, SKUs..." ',
      'style="background:none;border:none;outline:none;font-family:\'Inter\',sans-serif;font-size:13px;color:#191c1d;width:100%;" />',
      '</div>',

      '<div class="flex items-center" style="gap:8px;margin-left:auto;">',

      // Notif bell
      '<button class="nexus-icon-btn flex items-center justify-center rounded-full" style="position:relative;width:36px;height:36px;">',
      icon('notifications', 'font-size:20px;color:#434653;'),
      '<span style="position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:#ba1a1a;border:1.5px solid #f8f9fa;"></span>',
      '</button>',

      // Quick action (hidden on mobile)
      '<button id="nexus-quick-action" class="flex items-center rounded-full font-body" style="gap:6px;padding:6px 16px;background:linear-gradient(135deg,#00327d,#0047ab);color:#fff;font-size:13px;font-weight:500;border:none;cursor:pointer;">',
      icon('add', 'font-size:16px;color:#fff;'),
      'Quick Action',
      '</button>',

      // Avatar
      '<div class="flex items-center justify-center rounded-full font-headline" style="width:36px;height:36px;background:linear-gradient(135deg,#00327d,#2559bd);color:#fff;font-size:13px;font-weight:700;flex-shrink:0;">',
      'CA',
      '</div>',

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
      // ── Core layout ──
      '#nexus-sidebar{',
        'position:fixed;left:0;top:0;height:100%;width:220px;z-index:40;',
        'display:flex;flex-direction:column;',
        'background:rgba(237,238,239,.92);',
        'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);',
      '}',
      '#nexus-topbar{',
        'position:fixed;left:220px;right:0;top:0;height:56px;z-index:30;',
        'background:rgba(248,249,250,.94);',
        'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
        'border-bottom:1px solid rgba(195,198,213,.3);',
      '}',
      '#nexus-main{',
        'margin-left:220px;padding-top:56px;min-height:100vh;',
        'background:#f8f9fa;',
      '}',

      // ── Nav items ──
      '.nexus-nav-item{text-decoration:none;}',
      '.nexus-nav-item:hover{background:rgba(255,255,255,.6);}',
      '.nexus-nav-active{',
        'background:#fff !important;',
        'box-shadow:0 2px 8px rgba(25,28,29,.08);',
      '}',
      '.nexus-icon-btn{background:none;border:none;cursor:pointer;}',
      '.nexus-icon-btn:hover{background:#edeeef;}',

      // ── Hamburger (hidden on desktop) ──
      '#nexus-hamburger{',
        'display:none;',
        'align-items:center;justify-content:center;',
        'width:40px;height:40px;',
        'border:none;background:none;cursor:pointer;',
        'border-radius:50%;flex-shrink:0;',
        'transition:background .15s;',
      '}',
      '#nexus-hamburger:hover{background:#edeeef;}',

      // ── Backdrop ──
      '#nexus-backdrop{',
        'display:none;',
        'position:fixed;inset:0;',
        'background:rgba(25,28,29,.45);',
        'z-index:39;',
        'backdrop-filter:blur(3px);',
        '-webkit-backdrop-filter:blur(3px);',
        'transition:opacity .25s;',
      '}',
      '#nexus-backdrop.nexus-open{display:block;}',

      // ── Mobile breakpoint (< 768px) ──
      '@media(max-width:767px){',
        '#nexus-sidebar{',
          'width:260px;',
          'transform:translateX(-100%);',
          'transition:transform .25s cubic-bezier(.4,0,.2,1);',
          'z-index:40;',
          'box-shadow:none;',
        '}',
        '#nexus-sidebar.nexus-open{',
          'transform:translateX(0);',
          'box-shadow:4px 0 32px rgba(25,28,29,.18);',
        '}',
        '#nexus-topbar{',
          'left:0;',
        '}',
        '#nexus-main{',
          'margin-left:0;',
        '}',
        '#nexus-hamburger{display:flex;}',
        '#nexus-search-wrap{display:none !important;}',
        '#nexus-quick-action{display:none !important;}',
        '#nexus-mobile-logo{display:flex !important;align-items:center;}',
        '#nexus-close-btn{display:flex !important;}',
      '}',

      // ── Small tablet (768px – 1023px): sidebar visible, slightly compact content ──
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
    var hamburger  = document.getElementById('nexus-hamburger');
    var closeBtn   = document.getElementById('nexus-close-btn');
    var sidebar    = document.getElementById('nexus-sidebar');
    var backdrop   = document.getElementById('nexus-backdrop');

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
      if (sidebar.classList.contains('nexus-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    closeBtn.addEventListener('click', closeSidebar);
    backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('nexus-open')) {
        closeSidebar();
      }
    });
  }

  // ── Mount ─────────────────────────────────────────────────
  function mount() {
    injectStyles();

    // Backdrop
    var bd = document.createElement('div');
    bd.innerHTML = buildBackdrop();
    document.body.insertAdjacentElement('afterbegin', bd.firstElementChild);

    // Sidebar
    var sidebar = document.createElement('div');
    sidebar.innerHTML = buildSidebar();
    document.body.insertAdjacentElement('afterbegin', sidebar.firstElementChild);

    // Topbar
    var topbar = document.createElement('div');
    topbar.innerHTML = buildTopbar();
    document.body.insertAdjacentElement('afterbegin', topbar.firstElementChild);

    initMobileNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();

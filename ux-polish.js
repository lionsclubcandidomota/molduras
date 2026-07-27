(() => {
  'use strict';

  const STORAGE_KEY = 'lions-color-theme';
  const root = document.documentElement;
  const isAdmin = Boolean(document.querySelector('.admin-shell, .admin-header, [data-admin-app]')) || location.pathname.endsWith('admin.html');
  const labels = { light: 'Claro', dark: 'Escuro', system: 'Sistema' };
  const icons = { light: '☀', dark: '☾', system: '◐' };
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function preference() {
    try { return localStorage.getItem(STORAGE_KEY) || 'system'; } catch { return 'system'; }
  }

  function resolve(value) {
    return value === 'dark' || (value === 'system' && media.matches) ? 'dark' : 'light';
  }

  function applyTheme(value, announce = false) {
    const safe = ['light', 'dark', 'system'].includes(value) ? value : 'system';
    root.dataset.themePreference = safe;
    root.dataset.theme = resolve(safe);
    root.style.colorScheme = root.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', root.dataset.theme === 'dark' ? '#07152b' : '#073b7a');
    document.querySelectorAll('[data-theme-option]').forEach(button => {
      const active = button.dataset.themeOption === safe;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const toggle = document.getElementById('themeMenuToggle');
    if (toggle) {
      toggle.querySelector('[data-theme-icon]').textContent = icons[safe];
      toggle.querySelector('[data-theme-label]').textContent = labels[safe];
      toggle.setAttribute('aria-label', `Tema: ${labels[safe]}. Alterar tema`);
    }
    if (announce) announceMessage(`Tema ${labels[safe].toLowerCase()} ativado.`);
  }

  function announceMessage(message) {
    let live = document.getElementById('uxPolishLive');
    if (!live) {
      live = document.createElement('div');
      live.id = 'uxPolishLive';
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = message; });
  }

  function buildThemeControl() {
    const host = isAdmin
      ? document.querySelector('.admin-header__actions, .header-actions, .admin-topbar-actions, header .actions')
      : document.querySelector('.site-header nav');
    if (!host || document.getElementById('themeMenuToggle')) return;

    const wrap = document.createElement('div');
    wrap.className = 'theme-control';
    wrap.innerHTML = `
      <button id="themeMenuToggle" class="theme-menu-toggle" type="button" aria-haspopup="menu" aria-expanded="false">
        <span data-theme-icon aria-hidden="true">◐</span>
        <span data-theme-label>Sistema</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
      </button>
      <div class="theme-menu" id="themeMenu" role="menu" hidden>
        <button type="button" role="menuitemradio" data-theme-option="light"><span aria-hidden="true">☀</span><span><b>Claro</b><small>Sempre claro</small></span></button>
        <button type="button" role="menuitemradio" data-theme-option="dark"><span aria-hidden="true">☾</span><span><b>Escuro</b><small>Sempre escuro</small></span></button>
        <button type="button" role="menuitemradio" data-theme-option="system"><span aria-hidden="true">◐</span><span><b>Sistema</b><small>Segue o dispositivo</small></span></button>
      </div>`;
    host.appendChild(wrap);

    const toggle = wrap.querySelector('#themeMenuToggle');
    const menu = wrap.querySelector('#themeMenu');
    const close = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
    const open = () => { menu.hidden = false; toggle.setAttribute('aria-expanded', 'true'); menu.querySelector('.is-active, button')?.focus(); };
    toggle.addEventListener('click', event => { event.stopPropagation(); menu.hidden ? open() : close(); });
    menu.addEventListener('click', event => {
      const option = event.target.closest('[data-theme-option]');
      if (!option) return;
      try { localStorage.setItem(STORAGE_KEY, option.dataset.themeOption); } catch {}
      applyTheme(option.dataset.themeOption, true);
      close(); toggle.focus();
    });
    document.addEventListener('click', event => { if (!wrap.contains(event.target)) close(); });
    wrap.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); toggle.focus(); }
      if (!menu.hidden && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button')];
        const current = buttons.indexOf(document.activeElement);
        buttons[(current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    });
  }

  function enhanceImages(rootNode = document) {
    rootNode.querySelectorAll?.('img').forEach(img => {
      if (img.dataset.uxEnhanced) return;
      img.dataset.uxEnhanced = 'true';
      if (!img.closest('.brand')) img.loading = img.loading || 'lazy';
      img.decoding = 'async';
      const reveal = () => img.classList.add('is-image-ready');
      if (img.complete) reveal(); else img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', () => img.classList.add('is-image-error'), { once: true });
    });
  }

  function markBusyRegions() {
    const gallery = document.getElementById('frameGallery');
    if (!gallery) return;
    const status = document.getElementById('galleryResultCount');
    const update = () => {
      const loading = /carregando/i.test(status?.textContent || '') && !gallery.children.length;
      gallery.classList.toggle('is-gallery-loading', loading);
      gallery.setAttribute('aria-busy', String(loading));
    };
    new MutationObserver(update).observe(gallery, { childList: true, subtree: true });
    if (status) new MutationObserver(update).observe(status, { childList: true, characterData: true, subtree: true });
    update();
  }

  function addConnectionFeedback() {
    const update = () => {
      document.body.classList.toggle('is-offline', !navigator.onLine);
      if (!navigator.onLine) announceMessage('Você está sem conexão. Recursos já carregados continuam disponíveis.');
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  function improveDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.addEventListener('close', () => document.body.classList.remove('has-open-dialog'));
      new MutationObserver(() => document.body.classList.toggle('has-open-dialog', Boolean(document.querySelector('dialog[open]'))))
        .observe(dialog, { attributes: true, attributeFilter: ['open'] });
    });
  }

  function boot() {
    buildThemeControl();
    applyTheme(preference());
    enhanceImages();
    markBusyRegions();
    addConnectionFeedback();
    improveDialogs();

    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) enhanceImages(node);
    })));
    observer.observe(document.body, { childList: true, subtree: true });

    media.addEventListener?.('change', () => { if (preference() === 'system') applyTheme('system'); });
    document.body.classList.add('ux-polish-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

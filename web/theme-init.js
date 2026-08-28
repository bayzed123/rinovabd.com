/* ============================================================
   RINOVA — THEME INIT
   Small progressive-enhancement layer for theme.css.
   Load with `defer` after theme.css on every page.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- 1. HEADER SCROLL STATE -------------------------
     Transparent over the hero, solid with a hairline after 40px.
     rAF-throttled so it never fights the scroll thread.
  ------------------------------------------------------------ */
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const THRESHOLD = 40;
    let ticking = false;

    const sync = () => {
      const scrolled = (window.scrollY || window.pageYOffset || 0) > THRESHOLD;
      header.classList.toggle('is-scrolled', scrolled);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sync);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    sync();
  }

  /* ---------- 2. ACTIVE NAV ----------------------------------
     Marks the current page so the underline rule in theme.css
     has something to hook onto. Uses aria-current, which is the
     accessible signal as well as the styling hook.
  ------------------------------------------------------------ */
  function initActiveNav() {
    const links = document.querySelectorAll('.nav-links a, .mobile-nav-links a');
    if (!links.length) return;

    const normalise = (path) => {
      let value = String(path || '/').split('?')[0].split('#')[0];
      if (value.endsWith('/index.html')) value = value.slice(0, -10);
      if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
      return value || '/';
    };

    const here = normalise(window.location.pathname);

    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      let target;
      try {
        target = normalise(new URL(href, window.location.origin).pathname);
      } catch {
        return;
      }
      if (target === here) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  /* ---------- 3. BOOT ---------------------------------------- */
  function boot() {
    initHeaderScroll();
    initActiveNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

(() => {
  /* Header goes from transparent-over-hero to solid after 40px. */
  const header = document.querySelector('.site-header');
  if (!header) return;
  let ticking = false;
  const sync = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 40);
    ticking = false;
  };
  sync();
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(sync);
  }, { passive: true });

  /* Mark the current page in the nav so the underline state is real. */
  const path = window.location.pathname.replace(/\/index\.html$/, '/');
  document.querySelectorAll('.nav-links a[href]').forEach((link) => {
    const target = new URL(link.getAttribute('href'), window.location.origin)
      .pathname.replace(/\/index\.html$/, '/');
    if (target === path) link.setAttribute('aria-current', 'page');
  });
})();

(() => {
  const excluded = /^(\/checkout(?:\.html)?|\/payment(?:\.html)?)(?:\/|$)/i.test(window.location.pathname);
  if (excluded || window.top !== window.self && document.body?.dataset?.adminPreview !== 'true') return;
  if (document.getElementById('global-mobile-nav')) return;

  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"/></svg>',
    category: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    brand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 14.8 9l6.2.7-4.7 4.2 1.4 6.1L12 17l-5.7 3 1.4-6.1L3 9.7 9.2 9 12 3Z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 11.2a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 1.9-1.4L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/></svg>',
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21c.7-3.6 3.1-5.5 7-5.5s6.3 1.9 7 5.5"/></svg>'
  };

  const nav = document.createElement('nav');
  nav.id = 'global-mobile-nav';
  nav.className = 'global-mobile-nav';
  nav.setAttribute('aria-label', 'Mobile storefront navigation');
  nav.innerHTML = `
    <a href="/" data-mobile-route="home">${icons.home}<span>Home</span></a>
    <a href="/#categories" data-mobile-route="category">${icons.category}<span>Category</span></a>
    <a href="/#shop" data-mobile-route="brand">${icons.brand}<span>Brand</span></a>
    <a href="/checkout.html" data-mobile-route="cart" class="mobile-nav-cart">${icons.cart}<span>Cart</span><b class="mobile-nav-badge" aria-label="0 items">0</b></a>
    <a href="/account.html" data-mobile-route="account">${icons.account}<span>My Account</span></a>`;
  document.body.appendChild(nav);

  const getCount = () => {
    try {
      const bag = JSON.parse(localStorage.getItem('rinova-bag') || '[]');
      return Array.isArray(bag) ? bag.reduce((sum, item) => sum + Number(item?.quantity || 0), 0) : 0;
    } catch { return 0; }
  };
  const updateBadge = () => {
    const badge = nav.querySelector('.mobile-nav-badge');
    if (!badge) return;
    const count = getCount();
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'} in cart`);
    badge.classList.toggle('is-empty', count === 0);
  };
  const active = nav.querySelector(`[data-mobile-route="${location.pathname === '/' ? 'home' : location.pathname.includes('account') ? 'account' : location.hash === '#categories' ? 'category' : 'brand'}"]`);
  active?.classList.add('is-active');
  updateBadge();
  window.addEventListener('storage', updateBadge);
  window.addEventListener('rinova:bag-updated', updateBadge);
  window.setInterval(updateBadge, 500);
})();

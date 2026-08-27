(() => {
  const MEASUREMENT_ID = 'G-6Q9HGJ4LM1';
  const CONSENT_KEY = 'rinova-analytics-consent';
  const dataLayer = window.dataLayer = window.dataLayer || [];
  const gtag = window.gtag = window.gtag || ((...args) => dataLayer.push(args));
  dataLayer.push({ rinova_ga4_measurement_id: MEASUREMENT_ID });
  const consentState = () => localStorage.getItem(CONSENT_KEY);
  const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  const cleanItem = (item = {}, quantity = 1) => ({
    item_id: cleanText(item.id || item.slug || item.productId, 80),
    item_name: cleanText(item.name || item.productName, 120),
    item_category: cleanText(item.categoryName || item.category || item.categorySlug, 80),
    price: safeNumber(item.price ?? item.unitPrice),
    quantity: Math.max(1, safeNumber(quantity || item.quantity || 1)),
  });
  const showConsent = () => {
    if (consentState() || document.querySelector('#analytics-consent')) return;
    const panel = document.createElement('aside');
    panel.id = 'analytics-consent';
    panel.className = 'analytics-consent';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'analytics-consent-title');
    panel.innerHTML = `<div><p class="eyebrow">A softer, smarter shop</p><h2 id="analytics-consent-title">Help us improve Rinova</h2><p>We use privacy-friendly analytics to understand product interest, shopping journeys and site performance. No name, phone or email is sent to Google Analytics.</p></div><div class="analytics-consent-actions"><button type="button" class="button" data-analytics-consent="declined">Not now</button><button type="button" class="button button-dark" data-analytics-consent="granted">Allow analytics</button></div>`;
    document.body.appendChild(panel);
    panel.querySelectorAll('[data-analytics-consent]').forEach((button) => button.addEventListener('click', () => updateConsent(button.dataset.analyticsConsent)));
  };
  const updateConsent = (value) => {
    const next = value === 'granted' ? 'granted' : 'declined';
    localStorage.setItem(CONSENT_KEY, next);
    if (typeof gtag === 'function') gtag('consent', 'update', { analytics_storage: next, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    document.querySelector('#analytics-consent')?.remove();
    if (next === 'granted') { track('consent_update', { consent_status: next }); track('page_view', { page_title: cleanText(document.title, 150), page_location: `${window.location.origin}${window.location.pathname}` }); }
  };
  const track = (name, params = {}) => {
    const payload = { event: cleanText(name, 60), ...params };
    dataLayer.push(payload);
    if (consentState() !== 'granted' || typeof gtag !== 'function' || window.__RINOVA_GTM_ACTIVE__) return payload;
    const { event, ...eventParams } = payload;
    window.gtag('event', event, eventParams);
    return payload;
  };
  const init = () => {
    if (typeof gtag === 'function') {
      gtag('consent', 'default', { analytics_storage: consentState() === 'granted' ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 });
    }
    track('page_view', { page_title: cleanText(document.title, 150), page_location: `${window.location.origin}${window.location.pathname}` });
    if (!consentState()) window.setTimeout(showConsent, 500);
  };
  window.rinovaAnalytics = { MEASUREMENT_ID, track, updateConsent, consentState, item: cleanItem, init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();

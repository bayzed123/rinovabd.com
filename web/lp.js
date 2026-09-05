/**
 * The ad landing page: prices itself from the shop, takes the order on the page, and reports
 * the sale to GA4 and Meta.
 *
 * Two things matter here more than anywhere else on the site. The price shown has to be the
 * price charged — it is read from the shop and confirmed by the server, never typed into the
 * markup and hoped for. And the Purchase event has to reach Meta exactly once: the browser
 * pixel and the Conversions API both send it, so both use the order code as the event id and
 * Meta collapses the pair.
 */
(() => {
  const API_BASE = window.RINOVA_API_BASE || '/api';
  const $ = (selector) => document.querySelector(selector);
  const bn = (value) => Number(value || 0).toLocaleString('bn-BD');
  const taka = (value) => `${bn(value)} ৳`;

  let data = {};
  try { data = JSON.parse(document.getElementById('lp-data')?.textContent || '{}'); } catch { data = {}; }
  const tracking = data.tracking || {};
  const product = data.product || null;
  const sku = product?.sku || 'RNV-LP-COMBO-01';

  /* ---------------------------------------------------------------- tracking */
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args) => window.dataLayer.push(args);
  const track = (name, params) => window.dataLayer.push({ event: name, ...params });

  function loadTagManager(id) {
    if (!id) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  }
  function loadGa4(measurementId) {
    if (!measurementId) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
    gtag('js', new Date());
    gtag('config', measurementId, { send_page_view: true });
  }
  function loadPixel(pixelId) {
    if (!pixelId || window.fbq) return;
    /* Meta's standard snippet, written out rather than eval'd from a string. */
    const fbq = function (...args) { fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args); };
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    window.fbq = window._fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }
  /** Meta is told the same event twice — pixel and server — so both must carry one event id. */
  const pixel = (name, params, eventId) => {
    if (!window.fbq) return;
    if (eventId) window.fbq('track', name, params, { eventID: eventId });
    else window.fbq('track', name, params);
  };

  loadTagManager(tracking.tracking_gtm_id);
  loadGa4(tracking.tracking_ga4_measurement_id);
  loadPixel(tracking.tracking_meta_pixel_id);

  /* ------------------------------------------------------------------ pricing */
  // The markup carries a price so the page reads correctly before any script runs; the shop is
  // the authority, so anything it says overrides that.
  const state = { price: Number(product?.salePrice ?? product?.price ?? 850), delivery: 0, name: product?.name || '' };

  function renderTotals() {
    const total = Math.max(0, state.price) + Math.max(0, state.delivery);
    $('#lp-pick-price').textContent = taka(state.price);
    $('#lp-subtotal').textContent = taka(state.price);
    $('#lp-total').textContent = taka(total);
    $('#lp-submit-price').textContent = taka(total);
    const sticky = document.querySelector('#lp-sticky .cta');
    if (sticky) sticky.textContent = `অর্ডার করতে ক্লিক করুন — ${taka(total)}`;
    const delivery = $('#lp-delivery');
    if (delivery) {
      delivery.textContent = state.delivery > 0 ? taka(state.delivery) : 'ফ্রি ডেলিভারি';
      delivery.classList.toggle('free', state.delivery <= 0);
    }
    const band = $('#lp-free-band');
    if (band && state.delivery > 0) band.hidden = true;
  }

  /**
   * Confirms the price and the free delivery with the shop before the customer commits.
   *
   * The free delivery is a real offer on this product, not wording: asking the server means the
   * page cannot promise something the order will then charge for.
   */
  async function priceFromShop() {
    try {
      const response = await fetch(`${API_BASE}/offers/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryFee: 0, code: '', items: [{ sku, quantity: 1 }] }),
      });
      const payload = await response.json();
      if (response.ok && payload.ok && Number(payload.subtotal) > 0) {
        state.price = Number(payload.subtotal);
        state.delivery = Number(payload.deliveryFee || 0);
        renderTotals();
      }
    } catch { /* the printed price stands */ }
  }

  renderTotals();
  priceFromShop();

  const viewItem = { currency: 'BDT', value: state.price, items: [{ item_id: sku, item_name: state.name, price: state.price, quantity: 1 }] };
  track('view_item', { ecommerce: viewItem });
  pixel('ViewContent', { content_ids: [sku], content_type: 'product', value: state.price, currency: 'BDT' });

  /* Every "order" button is a step towards checkout, and worth counting once. */
  let reachedForm = false;
  document.querySelectorAll('a.cta[href="#order"]').forEach((button) => button.addEventListener('click', () => {
    if (reachedForm) return;
    reachedForm = true;
    track('begin_checkout', { ecommerce: viewItem });
    pixel('InitiateCheckout', { content_ids: [sku], content_type: 'product', value: state.price, currency: 'BDT' });
  }));
  $('#lp-whatsapp')?.addEventListener('click', () => { track('contact', { method: 'whatsapp' }); pixel('Contact', { method: 'whatsapp' }); });
  $('#lp-call')?.addEventListener('click', () => { track('contact', { method: 'phone' }); pixel('Contact', { method: 'phone' }); });

  /* -------------------------------------------------------------------- order */
  const form = $('#lp-form');
  const errorBox = $('#lp-error');
  const submit = $('#lp-submit');

  /* Paying for a click that lands on a form the shop cannot fulfil is worse than saying so. */
  if (product && product.inStock === false) {
    form.hidden = true;
    $('#lp-sticky').hidden = true;
    $('#lp-soldout').hidden = false;
    document.querySelectorAll('a.cta[href="#order"]').forEach((button) => { button.textContent = 'স্টক শেষ — কল করুন'; button.setAttribute('href', 'tel:+8801738745949'); });
  }

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /** A Bangladeshi mobile number, the shape the courier will actually be able to call. */
  const cleanPhone = (value) => String(value || '').replace(/[^0-9]/g, '').replace(/^88/, '');
  const phoneLooksReal = (value) => /^01[3-9]\d{8}$/.test(cleanPhone(value));

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const name = $('#lp-name').value.trim();
    const phone = cleanPhone($('#lp-phone').value);
    const address = $('#lp-address').value.trim();

    if (name.length < 2) return showError('অনুগ্রহ করে আপনার সম্পূর্ণ নাম লিখুন।');
    if (!phoneLooksReal(phone)) return showError('সঠিক মোবাইল নাম্বার লিখুন — যেমন ০১৭XXXXXXXX।');
    if (address.length < 10) return showError('ডেলিভারির জন্য সম্পূর্ণ ঠিকানা লিখুন (গ্রাম/বাসা, থানা, জেলা)।');

    // A second tap must not place a second order.
    submit.disabled = true;
    const wording = submit.innerHTML;
    submit.textContent = 'অর্ডার পাঠানো হচ্ছে…';

    try {
      const response = await fetch(`${API_BASE}/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, phone, address,
          // The address is one free-text field on purpose: an ad landing page that asks for
          // district and upazila separately loses orders. The courier reads the line.
          district: address, upazila: address,
          paymentMethod: 'cod', specialNote: 'Ad landing page — Silky Beauty Combo',
          items: [{ sku, quantity: 1 }],
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'অর্ডারটি নেওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।');

      const order = payload.order || {};
      form.hidden = true;
      $('#lp-sticky').hidden = true;
      $('#lp-order-code').textContent = order.invoiceNumber || order.orderCode || '';
      $('#lp-done').hidden = false;
      $('#lp-done').scrollIntoView({ behavior: 'smooth', block: 'center' });

      const value = Number(order.total ?? state.price);
      track('purchase', { ecommerce: { transaction_id: order.orderCode, currency: 'BDT', value, items: viewItem.items } });
      // The Conversions API sends this same Purchase from the Worker with the order code as its
      // event id; matching it here is what stops Meta counting the sale twice.
      pixel('Purchase', { content_ids: [sku], content_type: 'product', value, currency: 'BDT', num_items: 1 }, order.orderCode);
    } catch (error) {
      submit.disabled = false;
      submit.innerHTML = wording;
      showError(error.message || 'কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
    }
  });
})();

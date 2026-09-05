/**
 * The engine behind every ad landing page: pricing, the order form, and the reporting.
 *
 * The built-in landing pages and the campaign pages the owner builds in Campaign Studio both
 * run this, because these are the parts that must not differ between them. Three things matter
 * here more than anywhere else on the site:
 *
 *  - The price shown is the price charged. It is read from the shop and confirmed by the server
 *    before the customer commits, never typed into the markup and hoped for.
 *  - The order is placed here, on the page. An ad click that has to travel to a second page to
 *    become an order mostly does not become one.
 *  - The Purchase reaches Meta exactly once. The browser pixel and the Conversions API both send
 *    it, so both carry the order code as the event id and Meta collapses the pair. Without that
 *    every reported cost per purchase is half what it really is.
 *
 * A page hands over its ids and its wording; everything below is the same for all of them.
 */
window.RinovaLanding = (() => {
  const API_BASE = window.RINOVA_API_BASE || '/api';
  const $ = (selector) => document.querySelector(selector);
  const bn = (value) => Number(value || 0).toLocaleString('bn-BD');
  const taka = (value) => `${bn(value)} ৳`;

  /* ---------------------------------------------------------------- tracking */
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args) => window.dataLayer.push(args);
  const track = (name, params) => window.dataLayer.push({ event: name, ...params });

  function loadTagManager(id) {
    if (!id || document.querySelector(`[data-lp-gtm="${id}"]`)) return;
    const script = document.createElement('script');
    script.async = true;
    script.dataset.lpGtm = id;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  }
  function loadGa4(measurementId) {
    if (!measurementId || document.querySelector(`[data-lp-ga4="${measurementId}"]`)) return;
    const script = document.createElement('script');
    script.async = true;
    script.dataset.lpGa4 = measurementId;
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

  /** A Bangladeshi mobile number, the shape the courier will actually be able to call. */
  const cleanPhone = (value) => String(value || '').replace(/[^0-9]/g, '').replace(/^88/, '');
  const phoneLooksReal = (value) => /^01[3-9]\d{8}$/.test(cleanPhone(value));

  /**
   * Starts a landing page.
   *
   * `options.products` is what the page can sell, cheapest information first: sku, name and a
   * printed price. When there is more than one the page lets the customer choose; the summary
   * and every reported event follow whichever is selected.
   */
  function start(options = {}) {
    const tracking = options.tracking || {};
    const products = (options.products || []).filter((product) => product && product.sku);
    const callNumber = options.callNumber || '';
    const note = options.note || 'Ad landing page';

    loadTagManager(tracking.tracking_gtm_id);
    loadGa4(tracking.tracking_ga4_measurement_id);
    loadPixel(tracking.tracking_meta_pixel_id);

    const form = $('#lp-form');
    const errorBox = $('#lp-error');
    const submit = $('#lp-submit');
    if (!products.length) return;

    const chosen = () => {
      const picked = document.querySelector('[data-lp-pick]:checked');
      const sku = picked ? picked.value : products[0].sku;
      return products.find((product) => product.sku === sku) || products[0];
    };
    // The markup carries a price so the page reads correctly before any script runs; the shop is
    // the authority, so anything it says overrides that.
    const state = { price: Number(chosen().price || 0), delivery: 0 };

    function renderTotals() {
      const total = Math.max(0, state.price) + Math.max(0, state.delivery);
      const pickPrice = $('#lp-pick-price');
      if (pickPrice) pickPrice.textContent = taka(state.price);
      if ($('#lp-subtotal')) $('#lp-subtotal').textContent = taka(state.price);
      if ($('#lp-total')) $('#lp-total').textContent = taka(total);
      if ($('#lp-submit-price')) $('#lp-submit-price').textContent = taka(total);
      const sticky = document.querySelector('#lp-sticky .cta');
      if (sticky) sticky.textContent = `অর্ডার করতে ক্লিক করুন — ${taka(total)}`;
      const delivery = $('#lp-delivery');
      if (delivery) {
        delivery.textContent = state.delivery > 0 ? taka(state.delivery) : 'ফ্রি ডেলিভারি';
        delivery.classList.toggle('free', state.delivery <= 0);
      }
      // The free-delivery promise is only made when the shop is really waiving it.
      const band = $('#lp-free-band');
      if (band) band.hidden = state.delivery > 0;
    }

    /**
     * Confirms the price, and whether delivery is free, with the shop.
     *
     * Asking the server means the page cannot promise something the order will then charge for —
     * the offer that waives delivery is a real record, and this is what reads it.
     */
    async function priceFromShop() {
      const product = chosen();
      try {
        const response = await fetch(`${API_BASE}/offers/validate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deliveryFee: Number(options.deliveryFee || 0), code: '', items: [{ sku: product.sku, quantity: 1 }] }),
        });
        const payload = await response.json();
        if (response.ok && payload.ok && Number(payload.subtotal) > 0) {
          state.price = Number(payload.subtotal);
          state.delivery = Number(payload.deliveryFee || 0);
        } else {
          state.price = Number(product.price || 0);
        }
      } catch {
        state.price = Number(product.price || 0);
      }
      renderTotals();
    }

    renderTotals();
    priceFromShop();

    const itemsFor = (product) => [{ item_id: product.sku, item_name: product.name, price: state.price, quantity: 1 }];
    const viewed = chosen();
    track('view_item', { ecommerce: { currency: 'BDT', value: state.price, items: itemsFor(viewed) } });
    pixel('ViewContent', { content_ids: [viewed.sku], content_type: 'product', value: state.price, currency: 'BDT' });

    document.querySelectorAll('[data-lp-pick]').forEach((input) => input.addEventListener('change', priceFromShop));

    /* Every "order" button is a step towards checkout, and worth counting once. */
    let reachedForm = false;
    document.querySelectorAll('a.cta[href="#order"]').forEach((button) => button.addEventListener('click', () => {
      if (reachedForm) return;
      reachedForm = true;
      const product = chosen();
      track('begin_checkout', { ecommerce: { currency: 'BDT', value: state.price, items: itemsFor(product) } });
      pixel('InitiateCheckout', { content_ids: [product.sku], content_type: 'product', value: state.price, currency: 'BDT' });
    }));
    $('#lp-whatsapp')?.addEventListener('click', () => { track('contact', { method: 'whatsapp' }); pixel('Contact', { method: 'whatsapp' }); });
    $('#lp-call')?.addEventListener('click', () => { track('contact', { method: 'phone' }); pixel('Contact', { method: 'phone' }); });

    /* Paying for a click that lands on a form the shop cannot fill is worse than saying so. */
    if (options.soldOut) {
      if (form) form.hidden = true;
      if ($('#lp-sticky')) $('#lp-sticky').hidden = true;
      if ($('#lp-soldout')) $('#lp-soldout').hidden = false;
      document.querySelectorAll('a.cta[href="#order"]').forEach((button) => {
        button.textContent = 'স্টক শেষ — কল করুন';
        if (callNumber) button.setAttribute('href', `tel:${callNumber}`);
      });
      return;
    }

    const showError = (message) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

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
      const product = chosen();

      try {
        const response = await fetch(`${API_BASE}/orders`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, phone, address,
            // The address is one free-text field on purpose: an ad landing page that asks for
            // district and upazila separately loses orders. The courier reads the line.
            district: address, upazila: address,
            paymentMethod: 'cod', specialNote: note,
            items: [{ sku: product.sku, quantity: 1 }],
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'অর্ডারটি নেওয়া যায়নি। একটু পরে আবার চেষ্টা করুন।');

        const order = payload.order || {};
        form.hidden = true;
        if ($('#lp-sticky')) $('#lp-sticky').hidden = true;
        if ($('#lp-order-code')) $('#lp-order-code').textContent = order.invoiceNumber || order.orderCode || '';
        $('#lp-done').hidden = false;
        $('#lp-done').scrollIntoView({ behavior: 'smooth', block: 'center' });

        const value = Number(order.total ?? state.price);
        track('purchase', { ecommerce: { transaction_id: order.orderCode, currency: 'BDT', value, items: itemsFor(product) } });
        // The Conversions API sends this same Purchase from the Worker with the order code as its
        // event id; matching it here is what stops Meta counting the sale twice.
        pixel('Purchase', { content_ids: [product.sku], content_type: 'product', value, currency: 'BDT', num_items: 1 }, order.orderCode);
      } catch (error) {
        submit.disabled = false;
        submit.innerHTML = wording;
        showError(error.message || 'কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      }
    });
  }

  return { start, taka, bn, track, pixel, phoneLooksReal, cleanPhone };
})();

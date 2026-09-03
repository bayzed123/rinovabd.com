(() => {
  const root = document.getElementById('campaign-data');
  let data = {};
  try { data = JSON.parse(root?.textContent || '{}'); } catch { data = {}; }
  const previewRequested = new URLSearchParams(location.search).get('preview') === '1';
  // Two different things share the word "preview": the standalone demo page with no server
  // data, and a real but paused campaign the owner is checking before publishing.
  const demo = previewRequested && !data.campaign;
  if (demo) data = { campaign: { slug: 'preview-rinova-ads', title: 'The Pink Edit', eyebrow: 'RINOVA BD · AD PREVIEW', description: 'A focused campaign experience designed for high-intent beauty traffic, with one clear path from story to shop.', imageUrl: '/assets/rinova-bd-hero-pink.png', ctaLabel: 'Shop the edit', ctaUrl: '/#shop' }, products: [{ id: 'preview-1', name: 'Radiance Serum', sku: 'PREVIEW-SERUM', price: 890, imageUrl: '/assets/rinova-bd-hero-pink.png', slug: 'preview-radiance-serum' }, { id: 'preview-2', name: 'Soft Glow SPF 50', sku: 'PREVIEW-SPF', price: 780, imageUrl: '/assets/rinova-bd-hero-pink.png', slug: 'preview-soft-glow-spf' }, { id: 'preview-3', name: 'Hydrating Cleanser', sku: 'PREVIEW-CLEAN', price: 650, imageUrl: '/assets/rinova-bd-hero-pink.png', slug: 'preview-hydrating-cleanser' }], tracking: {} };
  const campaign = data.campaign || {};
  const products = Array.isArray(data.products) ? data.products : [];
  const tracking = data.tracking || {};
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const trackingGtm = tracking.tracking_gtm_id || '';
  const ga4Id = tracking.tracking_ga4_measurement_id || '';
  const pixelId = tracking.tracking_meta_pixel_id || '';
  window.dataLayer = window.dataLayer || [];
  if (trackingGtm && !document.querySelector(`[data-campaign-gtm="${CSS.escape(trackingGtm)}"]`)) { window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }); const script = document.createElement('script'); script.async = true; script.dataset.campaignGtm = trackingGtm; script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(trackingGtm)}`; document.head.appendChild(script); }
  if (ga4Id && !document.querySelector(`[data-campaign-ga4="${CSS.escape(ga4Id)}"]`)) { const script = document.createElement('script'); script.async = true; script.dataset.campaignGa4 = ga4Id; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`; document.head.appendChild(script); window.gtag = window.gtag || function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', ga4Id, { page_title: campaign.title || 'Rinova BD Campaign', page_location: location.href }); }
  if (pixelId && !window.fbq) { ((f,b,e,v,n,t,s) => { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js'); window.fbq('init', pixelId); window.fbq('track', 'PageView'); }
  const campaignUrl = location.href;
  const paused = Boolean(campaign.preview);
  window.dataLayer.push({ event: 'campaign_view', campaign_slug: campaign.slug, campaign_title: campaign.title, page_location: campaignUrl, preview_mode: demo || paused });
  if (demo || paused) {
    const banner = document.createElement('div');
    banner.className = 'campaign-preview-banner';
    banner.textContent = demo ? 'Demo preview — this is sample content, not a saved campaign.' : 'Preview only — this campaign is paused, so customers cannot open this link yet.';
    document.body.prepend(banner);
  }
  const hero = document.getElementById('campaign-hero');
  if (hero) hero.innerHTML = `<div class="campaign-copy"><div class="campaign-eyebrow">${esc(campaign.eyebrow || 'Rinova BD campaign edit')}</div><h1 class="campaign-title">${esc(campaign.title || 'Thoughtful beauty, made simple.')}</h1><p class="campaign-description">${esc(campaign.description || 'A focused campaign experience for this seasonal edit.')}</p><a class="campaign-cta" href="${esc(campaign.ctaUrl || '/#shop')}">${esc(campaign.ctaLabel || 'Shop the edit')} <span aria-hidden="true">↗</span></a></div><div class="campaign-image">${campaign.imageUrl ? `<img src="${esc(campaign.imageUrl)}" alt="${esc(campaign.title || 'Rinova BD campaign')}" />` : '<div class="campaign-empty">Campaign image coming soon.</div>'}</div>`;
  const grid = document.getElementById('campaign-product-grid');
  if (grid) grid.innerHTML = products.length ? products.map((product) => `<article class="campaign-product"><a href="${demo ? '/?preview_product=' + encodeURIComponent(product.slug) : '/products/' + encodeURIComponent(product.slug)}" data-campaign-product="${esc(product.id)}"><div class="campaign-product-image">${product.imageUrl ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.name)}" loading="lazy" />` : ''}</div><h3>${esc(product.name)}</h3><p class="campaign-price">৳${Number(product.salePrice ?? product.price ?? 0).toLocaleString('en-BD')}${Number(product.wasPrice || product.compareAtPrice || 0) > Number(product.salePrice ?? product.price ?? 0) ? ` <del>৳${Number(product.wasPrice || product.compareAtPrice).toLocaleString('en-BD')}</del>` : ''}${Number(product.discountPercent || 0) ? ` <span class="campaign-price-off">${Number(product.discountPercent)}% off</span>` : ''}</p></a></article>`).join('') : '<p class="campaign-empty">Products will appear here when the campaign is connected.</p>';
  grid?.querySelectorAll('[data-campaign-product]').forEach((card) => card.addEventListener('click', () => { const product = products.find((item) => String(item.id) === card.dataset.campaignProduct); if (!product) return; window.dataLayer.push({ event: 'view_item', ecommerce: { currency: 'BDT', value: Number(product.price || 0), items: [{ item_id: product.sku || String(product.id), item_name: product.name, item_variant: product.slug, price: Number(product.price || 0), quantity: 1 }] } }); if (window.gtag) window.gtag('event', 'view_item', { currency: 'BDT', value: Number(product.price || 0), items: [{ item_id: product.sku || String(product.id), item_name: product.name, item_variant: product.slug, price: Number(product.price || 0), quantity: 1 }] }); if (window.fbq) window.fbq('track', 'ViewContent', { content_ids: [product.sku || String(product.id)], content_name: product.name, content_type: 'product', value: Number(product.price || 0), currency: 'BDT' }); }));
})();

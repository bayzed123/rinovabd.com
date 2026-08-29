(() => {
  const root = document.getElementById('campaign-data');
  let data = {};
  try { data = JSON.parse(root?.textContent || '{}'); } catch { data = {}; }
  const campaign = data.campaign || {};
  const products = Array.isArray(data.products) ? data.products : [];
  const tracking = data.tracking || {};
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const trackingGtm = tracking.tracking_gtm_id || '';
  if (trackingGtm && !document.querySelector(`[data-campaign-gtm="${CSS.escape(trackingGtm)}"]`)) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script'); script.async = true; script.dataset.campaignGtm = trackingGtm; script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(trackingGtm)}`; document.head.appendChild(script);
  }
  window.dataLayer = window.dataLayer || [];
  const campaignUrl = location.href;
  window.dataLayer.push({ event: 'campaign_view', campaign_slug: campaign.slug, campaign_title: campaign.title, page_location: campaignUrl });
  const hero = document.getElementById('campaign-hero');
  if (hero) hero.innerHTML = `<div class="campaign-copy"><div class="campaign-eyebrow">${esc(campaign.eyebrow || 'Rinova BD campaign edit')}</div><h1 class="campaign-title">${esc(campaign.title || 'Thoughtful beauty, made simple.')}</h1><p class="campaign-description">${esc(campaign.description || 'A focused campaign experience for this seasonal edit.')}</p><a class="campaign-cta" href="${esc(campaign.ctaUrl || '/#shop')}">${esc(campaign.ctaLabel || 'Shop the edit')} <span aria-hidden="true">↗</span></a></div><div class="campaign-image">${campaign.imageUrl ? `<img src="${esc(campaign.imageUrl)}" alt="${esc(campaign.title || 'Rinova BD campaign')}" />` : '<div class="campaign-empty">Campaign image coming soon.</div>'}</div>`;
  const grid = document.getElementById('campaign-product-grid');
  if (grid) grid.innerHTML = products.length ? products.map((product) => `<article class="campaign-product"><a href="/products/${encodeURIComponent(product.slug)}" data-campaign-product="${esc(product.id)}"><div class="campaign-product-image">${product.imageUrl ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.name)}" loading="lazy" />` : ''}</div><h3>${esc(product.name)}</h3><p class="campaign-price">৳${Number(product.price || 0).toLocaleString('en-BD')}</p></a></article>`).join('') : '<p class="campaign-empty">Products will appear here when the campaign is connected.</p>';
  grid?.querySelectorAll('[data-campaign-product]').forEach((card) => card.addEventListener('click', () => { const product = products.find((item) => String(item.id) === card.dataset.campaignProduct); if (!product) return; window.dataLayer.push({ event: 'view_item', ecommerce: { currency: 'BDT', value: Number(product.price || 0), items: [{ item_id: product.sku || String(product.id), item_name: product.name, item_variant: product.slug, price: Number(product.price || 0), quantity: 1 }] } }); }));
})();

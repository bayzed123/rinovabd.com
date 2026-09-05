/**
 * A campaign page the owner built in Campaign Studio.
 *
 * It is the same page as the built-in ad landing pages — same layout, same order form, same
 * reporting — with the parts the owner controls filled in from what they typed: the headline,
 * the picture, the selling copy, and the products the campaign sells. Everything that has to be
 * right about taking money lives in lp-order.js, shared with those pages, so a campaign made in
 * the dashboard behaves exactly like one built by hand.
 *
 * The page used to be a grid of cards linking to the shop. An ad click that has to travel to a
 * second page to become an order mostly does not become one, so the order is taken here.
 */
(() => {
  const root = document.getElementById('campaign-data');
  let data = {};
  try { data = JSON.parse(root?.textContent || '{}'); } catch { data = {}; }

  const previewRequested = new URLSearchParams(location.search).get('preview') === '1';
  // Two different things share the word "preview": the standalone demo page with no server data,
  // and a real but paused campaign the owner is checking before publishing.
  const demo = previewRequested && !data.campaign;
  if (demo) {
    data = {
      campaign: { slug: 'preview-rinova-ads', title: 'আপনার ক্যাম্পেইনের শিরোনাম এখানে দেখাবে', eyebrow: 'এটি শুধু একটি নমুনা পেজ', description: 'Campaign Studio-তে যা লিখবেন তা এখানে দেখাবে।\nপ্রতিটি লাইন আলাদা প্যারাগ্রাফ হয়ে আসবে।', imageUrl: '/assets/rinova-bd-hero-pink.png' },
      products: [{ id: 'preview-1', name: 'Radiance Serum', sku: 'PREVIEW-SERUM', price: 890, imageUrl: '/assets/rinova-bd-hero-pink.png' }],
      tracking: {},
    };
  }

  const campaign = data.campaign || {};
  const products = (Array.isArray(data.products) ? data.products : []).filter((product) => product && product.sku);
  const shop = data.shop || {};
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const show = (id, on = true) => { const node = document.getElementById(id); if (node) node.hidden = !on; };
  const priceOf = (product) => Number(product.salePrice ?? product.price ?? 0);

  const paused = Boolean(campaign.preview);
  if (demo || paused) {
    const banner = document.createElement('div');
    banner.className = 'campaign-paused';
    banner.textContent = demo
      ? 'নমুনা পেজ — এটি সংরক্ষিত কোনো ক্যাম্পেইন নয়।'
      : 'প্রিভিউ — ক্যাম্পেইনটি এখনো বন্ধ, তাই কাস্টমার এই লিংক খুলতে পারবে না।';
    document.body.prepend(banner);
  }

  /* ---- What the owner wrote -------------------------------------------------------------- */
  document.title = `${campaign.title || 'Rinova BD'} · Rinova BD`;
  document.getElementById('campaign-title').textContent = campaign.title || 'Rinova BD';
  if (campaign.eyebrow) {
    document.getElementById('campaign-eyebrow').textContent = campaign.eyebrow;
    show('campaign-eyebrow');
  }
  if (campaign.imageUrl) {
    document.getElementById('campaign-media').innerHTML = `<img src="${esc(campaign.imageUrl)}" alt="${esc(campaign.title || 'Rinova BD')}" fetchpriority="high">`;
    show('campaign-media');
  }
  // The owner types plain lines in a textarea, so each line becomes its own paragraph. Anything
  // they write is escaped: a campaign description is not a place to accept markup.
  const lines = String(campaign.description || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length) {
    document.getElementById('campaign-description').innerHTML = lines.map((line) => `<p>${esc(line)}</p>`).join('');
    show('campaign-story');
    show('campaign-story-cta');
  }

  /* ---- The price, from the first product the campaign sells ------------------------------- */
  const lead = products[0];
  if (lead) {
    const price = priceOf(lead);
    const was = Number(lead.compareAtPrice || lead.wasPrice || 0);
    document.getElementById('campaign-price-now').textContent = `আজকের অফার মূল্য ${window.RinovaLanding.bn(price)} টাকা`;
    if (was > price) {
      document.getElementById('campaign-price-old').innerHTML = `রেগুলার মূল্য <s>${window.RinovaLanding.bn(was)} টাকা</s>`;
      show('campaign-price-old');
      document.getElementById('campaign-price-save').textContent = `${window.RinovaLanding.bn(was - price)} টাকা সাশ্রয়`;
      show('campaign-price-save');
    }
    show('campaign-price');
  }

  /* ---- What the customer is buying -------------------------------------------------------- */
  // One product is simply shown; several become a choice, because a campaign that sells a range
  // still has to end in one order the courier can carry.
  const picks = document.getElementById('campaign-picks');
  picks.innerHTML = products.map((product, index) => {
    const priceLabel = window.RinovaLanding.taka(priceOf(product));
    const image = product.imageUrl ? `<img src="${esc(product.imageUrl)}" alt="" width="74" height="74">` : '';
    const chooser = products.length > 1
      ? `<input type="radio" name="campaign-pick" data-lp-pick value="${esc(product.sku)}"${index === 0 ? ' checked' : ''}>`
      : '';
    const body = `${image}<div><strong>${esc(product.name)}</strong>${product.shortDescription ? `<small>${esc(product.shortDescription)}</small>` : ''}</div><span class="pick-price"${products.length > 1 ? '' : ' id="lp-pick-price"'}>${priceLabel}</span>`;
    return products.length > 1
      ? `<label class="pick choice">${chooser}${body}</label>`
      : `<div class="pick">${body}</div>`;
  }).join('');

  if (!products.length) {
    // A campaign with nothing to sell must not show a form that cannot place an order.
    document.getElementById('lp-form').hidden = true;
    document.getElementById('lp-sticky').hidden = true;
    picks.innerHTML = '<p class="cta-note">এই ক্যাম্পেইনে এখনো কোনো প্রোডাক্ট যোগ করা হয়নি। Campaign Studio-তে গিয়ে প্রোডাক্ট বেছে দিন।</p>';
  }

  /* ---- How to reach the shop --------------------------------------------------------------- */
  const phone = String(shop.phone || '').replace(/\s+/g, '');
  const whatsapp = String(shop.whatsapp || '').replace(/[^0-9]/g, '');
  if (phone) {
    const call = document.getElementById('lp-call');
    call.href = `tel:${phone}`;
    call.textContent = phone;
    call.hidden = false;
    document.getElementById('campaign-head-call').href = `tel:${phone}`;
    document.getElementById('campaign-foot-call').innerHTML = `📞 <a href="tel:${esc(phone)}">${esc(phone)}</a> · সারা বাংলাদেশে ক্যাশ অন ডেলিভারি`;
  }
  if (whatsapp) {
    const chat = document.getElementById('lp-whatsapp');
    chat.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`আমি ${campaign.title || 'এই পণ্যটি'} অর্ডার করতে চাই`)}`;
    chat.hidden = false;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: 'campaign_view', campaign_slug: campaign.slug, campaign_title: campaign.title, page_location: location.href, preview_mode: demo || paused });

  // The demo page has no shop behind it, so it shows the layout and stops short of taking orders.
  window.RinovaLanding.start({
    tracking: data.tracking || {},
    products: demo ? [] : products.map((product) => ({ sku: product.sku, name: product.name, price: priceOf(product) })),
    deliveryFee: Number(data.deliveryFee || 0),
    soldOut: Boolean(products.length) && products.every((product) => Number(product.stock ?? 1) <= 0),
    callNumber: phone,
    note: `Campaign page — ${campaign.title || campaign.slug || 'Rinova BD'}`,
  });
})();

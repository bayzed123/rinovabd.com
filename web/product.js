const API_BASE = window.RINOVA_API_BASE || (window.location.hostname.includes('localhost') ? 'http://localhost:8787/api' : '/api');
const state = { bag: JSON.parse(localStorage.getItem('rinova-bag') || '[]'), media: [], mediaIndex: 0, rating: 0, variants: [], activePrice: null, delivery: null };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD')}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const icon = (name, className = '') => window.RinovaIcons?.svg(name, className) || '';
function safeMediaUrl(value) { const url = String(value ?? '').trim(); return /^(https:\/\/|\/assets\/|\/media\/)/i.test(url) ? url : ''; }
function productSlugFromLocation() { const match = window.location.pathname.match(/^\/products\/([^/]+)\/?$/i); return match ? decodeURIComponent(match[1]) : new URLSearchParams(window.location.search).get('slug') || ''; }
function productUrl(slug) { return `${window.location.origin}/products/${encodeURIComponent(slug)}`; }
function setProductMeta(product, ratingSummary) { const title = `${product.name} · Rinova BD`; const description = String(product.shortDescription || product.description || `Shop ${product.name} from Rinova BD.`).slice(0, 158); const canonical = productUrl(product.slug); document.title = title; document.querySelector('meta[name="description"]')?.setAttribute('content', description); document.querySelector('meta[name="robots"]')?.setAttribute('content', 'index,follow'); document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical); document.querySelector('meta[property="og:title"]')?.setAttribute('content', title); document.querySelector('meta[property="og:description"]')?.setAttribute('content', description); const image = safeMediaUrl(product.imageUrl); if (image) document.querySelector('meta[property="og:image"]')?.setAttribute('content', image.startsWith('/') ? `${window.location.origin}${image}` : image); const existing = document.querySelector('#product-jsonld'); if (existing) existing.remove(); const schema = { '@context': 'https://schema.org', '@type': 'Product', name: product.name, description, url: canonical, ...(image ? { image: [image.startsWith('/') ? `${window.location.origin}${image}` : image] } : {}), offers: { '@type': 'Offer', url: canonical, priceCurrency: 'BDT', price: Number(product.price || 0), availability: Number(product.stock || 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: 'Rinova BD' } }, ...(Number(ratingSummary?.count || 0) > 0 && Number(ratingSummary?.average || 0) > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(ratingSummary.average), reviewCount: Number(ratingSummary.count) } } : {}) }; const script = document.createElement('script'); script.id = 'product-jsonld'; script.type = 'application/ld+json'; script.textContent = JSON.stringify(schema); document.head.appendChild(script); }
function parseMedia(product) { let parsed = []; try { parsed = JSON.parse(product.mediaJson || '[]'); } catch {} const unique = []; const seen = new Set(); const add = (item) => { const type = item?.type === 'video' ? 'video' : 'image'; const url = safeMediaUrl(typeof item === 'string' ? item : item?.url); if (!url) return; const key = `${type}:${url.toLowerCase()}`; if (seen.has(key)) return; seen.add(key); unique.push({ type, url, alt: item?.alt || product.name }); }; const primary = safeMediaUrl(product.imageUrl); if (primary) add({ type: 'image', url: primary, alt: product.name }); (Array.isArray(parsed) ? parsed : []).forEach(add); return unique.length ? unique : [{ type: 'image', url: '/assets/beauty-flatlay.jpg', alt: product.name }]; }
async function api(path, options = {}) { const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }; const token = localStorage.getItem('rinova-customer-token'); if (token) headers.Authorization = `Bearer ${token}`; const response = await fetch(`${API_BASE}${path}`, { ...options, headers }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Request failed'); return data; }
function track(name, params = {}) { return window.rinovaAnalytics?.track ? window.rinovaAnalytics.track(name, params) : (window.dataLayer = window.dataLayer || [], window.dataLayer.push({ event: name, ...params })); }
function itemPayload(product, quantity = 1) { return window.rinovaAnalytics?.item ? window.rinovaAnalytics.item(product, quantity) : { item_id: product.slug || product.id, item_name: product.name, item_category: product.categoryName || product.categorySlug, price: Number(product.price || 0), quantity: Number(quantity || 1) }; }
function updateBagCount() { $('#detail-bag-count').textContent = state.bag.reduce((sum, item) => sum + Number(item.quantity || 0), 0); }
function addToBag(product, quantity, options = {}) { const optionKey = JSON.stringify(options); const existing = state.bag.find((item) => Number(item.id) === Number(product.id) && JSON.stringify(item.options || {}) === optionKey); if (existing && !existing.sku && product.sku) existing.sku = String(product.sku).trim(); const maximum = Number(product.stock || 0); if (existing) existing.quantity = Math.min(maximum || existing.quantity + quantity, existing.quantity + quantity); else state.bag.push({ id: product.id, sku: String(product.sku || '').trim(), slug: product.slug, name: product.name, price: product.price, imageUrl: product.imageUrl || state.media[0]?.url, quantity, stock: maximum, minOrderQty: Number(product.minOrderQty || 1), categoryName: product.categoryName, categorySlug: product.categorySlug, options }); localStorage.setItem('rinova-bag', JSON.stringify(state.bag)); updateBagCount(); $('#detail-status').textContent = `${product.name} added to your bag.`; track('add_to_cart', { currency: 'BDT', value: Number(product.price || 0) * Number(quantity || 1), items: [itemPayload(product, quantity)] }); }
function mediaStage(item) { if (item.type === 'video') return `<video controls playsinline preload="metadata" poster="${escapeHtml(state.media.find((media) => media.type === 'image')?.url || '')}"><source src="${escapeHtml(item.url)}">Your browser does not support this video.</video>`; return `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || 'Product media')}" />`; }
function selectMedia(index) { const item = state.media[index]; if (!item) return; state.mediaIndex = index; $('#detail-media-stage').innerHTML = `${mediaStage(item)}<span class="media-stage-hint"><span>Tap to enlarge</span>${icon('arrowUpRight')}</span>`; document.querySelectorAll('.media-thumb').forEach((button, buttonIndex) => { const active = buttonIndex === index; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); }); }
function stars(value, empty = false) { const rating = Math.max(0, Math.min(5, Number(value || 0))); const rounded = Math.round(rating); return Array.from({ length: 5 }, (_, index) => icon('star', index < rounded ? 'is-filled' : 'is-empty')).join(''); }
function parseProductBadges(value) { let parsed = []; try { parsed = Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch {} return Array.isArray(parsed) ? parsed.map((item) => String(item).toLowerCase()).filter((item) => ['hot', 'new', 'stockout', 'out', 'instock'].includes(item)) : []; }
function productBadges(product) { const labels = { hot: 'Hot', new: 'New', out: 'Stock Out' }; const selected = parseProductBadges(product.badgesJson || product.badges).map((badge) => badge === 'stockout' ? 'out' : badge).filter((badge) => badge !== 'instock' && labels[badge]); return Array.from(new Set(selected)).map((badge) => `<span class="product-badge badge-${badge}">${labels[badge]}</span>`).join(''); }
function parseProductSpecs(product) { try { const value = JSON.parse(product.specsJson || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function isClothingProduct(product) { return /clothing|dress|apparel|fashion/i.test(`${product.categoryName || ''} ${product.categorySlug || ''}`); }
/** Extra details the owner typed for this product (fabric, fit, skin type…). */
function productDetailFacts(product) {
  return parseProductSpecs(product)
    .filter((spec) => spec && !Array.isArray(spec.values) && String(spec.value ?? '').trim())
    .slice(0, 4)
    .map((spec) => `<div>${escapeHtml(spec.name || spec.key)}<strong>${escapeHtml(spec.value)}</strong></div>`)
    .join('');
}
/** The price the shop set for one size, or null when that size uses the base price. */
function variantPriceFor(label) {
  const match = state.variants.find((variant) => variant.kind === 'size' && String(variant.label).toLowerCase() === String(label).toLowerCase());
  return match && match.price !== null && match.price !== undefined ? Number(match.price) : null;
}

function productOptionsMarkup(product) {
  const specs = parseProductSpecs(product);
  const key = (item) => String(item?.key || item?.name || '').toLowerCase();
  const sizeSpec = specs.find((item) => key(item) === 'size');
  const colorSpec = specs.find((item) => key(item) === 'color' || key(item) === 'colour');
  // Sizes saved as priced variants count even when specs_json has not caught up.
  const variantSizes = state.variants.filter((variant) => variant.kind === 'size').map((variant) => variant.label);
  const variantColors = state.variants.filter((variant) => variant.kind === 'color').map((variant) => variant.label);
  const sizes = [...new Set([...(Array.isArray(sizeSpec?.values) ? sizeSpec.values : []), ...variantSizes])];
  const colors = [...new Set([...(Array.isArray(colorSpec?.values) ? colorSpec.values : []), ...variantColors])];
  if (!sizes.length && !colors.length) return '';
  const sizeLabel = isClothingProduct(product) ? 'Size' : 'Size / amount';
  // Showing the price on the option itself answers "what does the 100g cost?" before choosing.
  const sizeOption = (size) => { const price = variantPriceFor(size); return `<option value="${escapeHtml(size)}">${escapeHtml(size)}${price !== null ? ` — ${money(price)}` : ''}</option>`; };
  return `<div class="product-options" aria-label="Product options">${sizes.length ? `<label>${sizeLabel}<select id="detail-size" name="size" required><option value="">Choose ${sizeLabel.toLowerCase()}</option>${sizes.map(sizeOption).join('')}</select></label>` : ''}${colors.length ? `<label>Colour<select id="detail-color" name="color" required><option value="">Choose colour</option>${colors.map((color) => `<option value="${escapeHtml(color)}">${escapeHtml(color)}</option>`).join('')}</select></label>` : ''}</div>`;
}
function selectedProductOptions() { return Object.fromEntries([['size', $('#detail-size')?.value || ''], ['color', $('#detail-color')?.value || '']].filter(([, value]) => value)); }
function renderReviews(summary, reviews) { const average = Number(summary?.average || 0); const count = Number(summary?.count || 0); const reviewCards = (reviews || []).map((review) => `<article class="review-card"><div class="review-card-head"><strong>${escapeHtml(review.reviewerName || 'Verified buyer')}</strong><span class="review-stars">${stars(review.rating)}</span></div><p>${escapeHtml(review.reviewText)}</p><small>Verified buyer · ${escapeHtml(String(review.createdAt || '').slice(0, 10))}</small></article>`).join(''); const signedIn = Boolean(localStorage.getItem('rinova-customer-token')); return `<section class="reviews-section"><div class="reviews-heading"><div><p class="eyebrow">REAL CUSTOMER FEEDBACK</p><h2>Ratings &amp; reviews</h2></div><div class="rating-summary"><strong>${average ? average.toFixed(1) : '—'}</strong><span class="review-stars">${stars(average)}</span><small>${count} customer review${count === 1 ? '' : 's'}</small></div></div><div class="review-list">${reviewCards || ''}</div><section class="review-write" aria-labelledby="review-write-title">
      <div class="review-write-head">
        <span class="review-write-mark" aria-hidden="true">${icon('star')}</span>
        <div><h3 id="review-write-title">${signedIn ? 'আপনার অভিজ্ঞতা লিখুন' : 'কেনাকাটার অভিজ্ঞতা শেয়ার করুন'}</h3><p>${signedIn ? 'আপনার অ্যাকাউন্ট থেকে অর্ডার যাচাই হবে।' : 'শুধু shipped বা delivered অর্ডারের ক্রেতা রিভিউ দিতে পারবেন।'}</p></div>
      </div>
      <form id="review-form" class="review-write-form">
        <fieldset class="review-rating-field">
          <legend>আপনার রেটিং <span class="review-required">*</span></legend>
          <div class="star-picker" role="radiogroup" aria-label="Choose rating">${[1,2,3,4,5].map((value) => `<button type="button" class="star-choice" data-rating-choice="${value}" aria-label="${value} star" aria-pressed="false">${icon('star')}</button>`).join('')}</div>
          <span id="review-rating-label" class="review-rating-label">তারায় চাপ দিন</span>
          <input type="hidden" name="rating" value="">
        </fieldset>
        <div class="review-write-grid">
          <label class="review-field"><span>আপনার নাম</span><input name="reviewerName" placeholder="যেমন রুমানা আক্তার" autocomplete="name"></label>
          <label class="review-field"><span>মোবাইল নাম্বার ${signedIn ? '' : '<i class="review-required">*</i>'}</span><input name="phone" inputmode="tel" placeholder="01XXXXXXXXX" autocomplete="tel" ${signedIn ? '' : 'required'}></label>
          <label class="review-field"><span>অর্ডার নাম্বার ${signedIn ? '' : '<i class="review-required">*</i>'}</span><input name="orderCode" placeholder="RNV-XXXXXXXX" autocomplete="off" ${signedIn ? '' : 'required'}></label>
          <label class="review-field"><span>ইনভয়েস নাম্বার <em>(না দিলেও চলবে)</em></span><input name="invoiceNumber" placeholder="INV-000123" autocomplete="off"></label>
        </div>
        <label class="review-field review-field-wide"><span>আপনার রিভিউ <i class="review-required">*</i></span><textarea name="reviewText" rows="5" minlength="3" maxlength="1200" placeholder="পণ্যটি কেমন লাগল, কতদিনে পেলেন, আবার কিনবেন কি না — সংক্ষেপে লিখুন।" required></textarea></label>
        <div class="review-write-actions">
          <button class="button button-dark" type="submit">রিভিউ পাঠান ${icon('arrowRight')}</button>
          <p id="review-status" class="review-status" role="status"></p>
        </div>
        <p class="review-write-note">রিভিউ প্রকাশের আগে দোকান থেকে যাচাই করা হয়। আপনার নাম্বার কখনো সাইটে দেখানো হয় না।</p>
      </form>
    </section></section>`; }
function renderRelated(product, products) { const root = $('#related-root'); if (!root) return; const candidates = (Array.isArray(products) ? products : []).filter((item) => String(item.slug || item.id) !== String(product.slug || product.id)); const sameCategory = candidates.filter((item) => item.categorySlug && item.categorySlug === product.categorySlug); const related = [...sameCategory, ...candidates.filter((item) => !sameCategory.includes(item))].slice(0, 10); if (!related.length) { root.innerHTML = ''; return; } root.innerHTML = `<section class="related-section" aria-labelledby="related-title"><div class="related-heading"><div><p class="eyebrow">COMPLETE YOUR RITUAL</p><h2 id="related-title">More to explore.</h2></div></div><div class="related-row" data-related-row>${related.map((item) => `<a class="related-card" href="${productUrl(item.slug || item.id)}"><img src="${escapeHtml(safeMediaUrl(item.imageUrl) || '/assets/beauty-flatlay.jpg')}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async"><span class="related-card-copy"><small>${escapeHtml(item.categoryName || 'Rinova edit')}</small><strong>${escapeHtml(item.name)}</strong><span>${money(item.price)}</span></span></a>`).join('')}</div></section>`; }
async function loadRelatedProducts(product) { try { const data = await api('/products'); renderRelated(product, data.products); } catch { renderRelated(product, []); } }
const RATING_WORDS = ['', 'খুব খারাপ', 'খারাপ', 'মোটামুটি', 'ভালো', 'দারুণ'];
function selectRating(value) {
  state.rating = value;
  const field = $('#review-form [name="rating"]');
  if (field) field.value = value;
  document.querySelectorAll('.star-choice').forEach((button) => {
    const on = Number(button.dataset.ratingChoice) <= value;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', String(on));
  });
  const label = $('#review-rating-label');
  if (label) label.textContent = `${value} / 5 · ${RATING_WORDS[value] || ''}`;
}
async function submitReview(event, slug) { event.preventDefault(); const form = event.target; const status = $('#review-status'); if (!state.rating) { status.textContent = 'Please choose a star rating first.'; return; } const data = Object.fromEntries(new FormData(form).entries()); data.productSlug = slug; data.rating = Number(data.rating); try { const response = await api('/reviews', { method: 'POST', body: JSON.stringify(data) }); status.textContent = response.message || 'Review submitted for admin approval.'; form.reset(); state.rating = 0; selectRating(0); } catch (error) { status.textContent = error.message; } }
function render(product, ratingSummary, reviews, slug) { state.media = parseMedia(product); state.mediaIndex = 0; const adminPreview = new URLSearchParams(window.location.search).get('admin_preview') === '1' && Boolean(sessionStorage.getItem('rinova-admin-token')); const adminEditLink = adminPreview ? `<a class="admin-preview-edit" target="_parent" href="/admin/?view=products&edit=${encodeURIComponent(product.id)}">Edit this product in Admin Dashboard ${icon('arrowRight')}</a>` : ''; const tiers = (() => { try { return JSON.parse(product.volumeTiersJson || '[]'); } catch { return []; } })(); const tierText = tiers.length ? `<div class="detail-note"><strong>Volume pricing available.</strong><br>${tiers.map((tier) => `${tier.minQty}+ units · ${money(tier.price)} each`).join(' · ')}</div>` : ''; const faqAnswer = escapeHtml(product.shortDescription || product.description || 'Please follow the instructions on the product packaging and choose what feels right for your routine.');
  // The owner's own questions when they have written any; otherwise the general fallback.
  const ownFaq = Array.isArray(product.faq) ? product.faq.filter((row) => row && row.question && row.answer) : [];
  const faqEntries = ownFaq.length ? ownFaq.map((row, index) => `<details${index === 0 ? ' open' : ''}><summary>${escapeHtml(row.question)}</summary><p>${escapeHtml(row.answer)}</p></details>`).join('')
    : `<details open><summary>What should I know about ${escapeHtml(product.name)}?</summary><p>${faqAnswer}</p></details><details><summary>How should I use it?</summary><p>Apply or use as directed on the packaging. If you are trying a new skincare product, patch-test first and stop use if irritation occurs.</p></details><details><summary>What if the item arrives damaged?</summary><p>Contact Rinova BD through WhatsApp as soon as possible with your order details so our support team can review the issue.</p></details>`;
  const faqText = `<section class="detail-faq" aria-labelledby="faq-title"><p class="eyebrow">NEED TO KNOW</p><h2 id="faq-title">Product FAQ</h2><div class="faq-list">${faqEntries}</div></section>`; const editorNote = String(product.editorNote || '').trim(); const editorNoteText = editorNote ? `<section class="editor-note"><h2>Editor's Note</h2><p>${escapeHtml(editorNote)}</p></section>` : ''; const thumbnails = state.media.map((item, index) => `<button class="media-thumb ${index === 0 ? 'active' : ''}" type="button" data-media-index="${index}" aria-current="${index === 0 ? 'true' : 'false'}" aria-label="Show ${item.type} ${index + 1}">${item.type === 'video' ? icon('play', 'media-play-icon') : `<img src="${escapeHtml(item.url)}" alt="" loading="lazy">`}</button>`).join(''); $('#detail-root').innerHTML = `<div class="detail-grid"><div class="detail-media"><div id="detail-media-stage" class="detail-media-stage" role="button" tabindex="0" aria-label="Open images for ${escapeHtml(product.name)}">${mediaStage(state.media[0])}<span class="media-stage-hint"><span>Tap to enlarge</span>${icon('arrowUpRight')}</span></div>${state.media.length > 1 ? `<div class="media-thumbs" aria-label="Product gallery">${thumbnails}</div>` : ''}</div><section class="detail-copy"><p class="eyebrow">${escapeHtml(product.categoryName || 'Rinova edit')}</p><div class="detail-badges">${productBadges(product)}</div><h1>${escapeHtml(product.name)}</h1><p class="detail-description">${escapeHtml(product.description || product.shortDescription || 'A thoughtful choice for your everyday ritual.')}</p><div class="detail-price"><strong id="detail-price-value">${money(product.price)}</strong>${product.compareAtPrice ? `<del>${money(product.compareAtPrice)}</del>` : ''}</div>${productOptionsMarkup(product)}<div class="detail-rating"><span class="review-stars">${stars(ratingSummary?.average || product.rating)}</span><strong>${Number(ratingSummary?.average || product.rating || 0) ? Number(ratingSummary?.average || product.rating).toFixed(1) : 'New'}</strong><span>(${Number(ratingSummary?.count || product.reviewCount || 0)} reviews)</span></div><div class="detail-controls"><div class="quantity-stepper" aria-label="Quantity"><button id="detail-minus" type="button" aria-label="Decrease quantity">${icon('minus')}</button><input id="detail-quantity" type="number" min="${Math.max(1, Number(product.minOrderQty || 1))}" max="${Math.max(1, Number(product.stock || 0))}" value="${Math.max(1, Number(product.minOrderQty || 1))}" aria-label="Quantity"><button id="detail-plus" type="button" aria-label="Increase quantity">${icon('plus')}</button></div><button id="detail-add" class="button button-dark" ${product.stock < 1 ? 'disabled' : ''}>Add to bag ${icon('plus')}</button><button id="detail-buy" class="button" ${product.stock < 1 ? 'disabled' : ''}>Buy now ${icon('arrowRight')}</button></div><p id="detail-status" class="detail-status"></p>${adminEditLink}<div class="detail-facts">${productDetailFacts(product)}${isClothingProduct(product) ? '' : `<div>Weight<strong>${Number(product.weightGrams || 0) ? `${product.weightGrams}g` : '—'}</strong></div>`}${Number(product.stock || 0) <= 0 ? '<div>Availability<strong class="stock-out-text">Stock out</strong></div>' : ''}<div>Delivery<strong id="detail-delivery-fact">Calculated at checkout</strong></div><div>Support<strong><a href="https://wa.me/8801738745949">WhatsApp us</a></strong></div></div>${editorNoteText}${tierText}${faqText}</section></div>${renderReviews(ratingSummary || { average: product.rating, count: product.reviewCount }, reviews)}<div id="related-root"></div>`; document.querySelectorAll('[data-media-index]').forEach((button) => button.addEventListener('click', () => selectMedia(Number(button.dataset.mediaIndex)))); const openViewer = (event) => { if (event.target.closest('video')) return; window.RinovaMediaViewer?.open(state.media, state.mediaIndex, product.name); }; $('#detail-media-stage')?.addEventListener('click', openViewer); $('#detail-media-stage')?.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openViewer(event); } }); document.querySelectorAll('[data-rating-choice]').forEach((button) => button.addEventListener('click', () => selectRating(Number(button.dataset.ratingChoice)))); $('#review-form')?.addEventListener('submit', (event) => submitReview(event, slug)); const minimum = Math.max(1, Number(product.minOrderQty || 1)); const maximum = Math.max(minimum, Number(product.stock || 0)); const setDetailQuantity = (value) => { const field = $('#detail-quantity'); if (!field) return; field.value = Math.max(minimum, Math.min(maximum, Number(value || minimum))); }; $('#detail-minus')?.addEventListener('click', () => setDetailQuantity(Number($('#detail-quantity').value) - 1)); $('#detail-plus')?.addEventListener('click', () => setDetailQuantity(Number($('#detail-quantity').value) + 1)); const quantity = () => Math.max(minimum, Math.min(Number(product.stock || 0), Number($('#detail-quantity').value || minimum))); const chooseOptions = () => { const missing = [...document.querySelectorAll('.product-options select[required]')].find((field) => !field.value); if (missing) { missing.focus(); $('#detail-status').textContent = `Please choose ${missing.name === 'size' ? 'a size' : 'a colour'} first.`; return null; } return selectedProductOptions(); }; // Before a size is chosen the headline shows the cheapest one, prefixed "From". A shop that
  // lets the size decide the price may well leave the base price at zero, and printing that as
  // the product's price would be worse than useless.
  const pricedSizes = state.variants.filter((variant) => variant.kind === 'size' && variant.price !== null && variant.price !== undefined).map((variant) => Number(variant.price));
  const lowest = pricedSizes.length ? Math.min(...pricedSizes) : null;
  const applySizePrice = () => {
    const chosen = $('#detail-size')?.value || '';
    const price = chosen ? variantPriceFor(chosen) : null;
    state.activePrice = price;
    const node = $('#detail-price-value');
    if (!node) return;
    if (price !== null) { node.textContent = money(price); return; }
    if (lowest !== null && (!Number(product.price) || lowest < Number(product.price))) { node.textContent = `From ${money(lowest)}`; return; }
    node.textContent = money(product.price);
  };
  $('#detail-size')?.addEventListener('change', applySizePrice);
  applySizePrice();
  const priced = () => ({ ...product, price: state.activePrice === null ? (Number(product.price) || lowest || 0) : state.activePrice });
  $('#detail-add')?.addEventListener('click', () => { const options = chooseOptions(); if (options) addToBag(priced(), quantity(), options); }); $('#detail-buy')?.addEventListener('click', () => { const options = chooseOptions(); if (!options) return; addToBag(priced(), quantity(), options); window.location.href = '/checkout.html'; }); applyDeliveryFact(); setProductMeta(product, ratingSummary); track('view_item', { currency: 'BDT', value: Number(product.price || 0), items: [itemPayload(product, 1)] }); }
(async function boot() { updateBagCount(); try { const slug = productSlugFromLocation(); if (!slug) throw new Error('Product not found'); const data = await api(`/products/${encodeURIComponent(slug)}`); state.variants = data.variants || []; render(data.product, data.ratingSummary, data.reviews, data.product.slug); loadRelatedProducts(data.product); } catch (error) { $('#detail-root').innerHTML = `<div class="loading">${escapeHtml(error.message)}<br><a class="detail-back" href="/#shop">Return to shop ${icon('arrowRight')}</a></div>`; } }());


/**
 * The delivery line used to quote fixed prices that ignored Settings. Fetching the charges as
 * a top-level IIFE raced the product render: when the config won, #detail-delivery-fact did
 * not exist yet and the line stayed "Calculated at checkout" for good. The fetch is started
 * once and applied whenever the element appears, so neither order of arrival can lose.
 */
let deliveryFactPromise = null;
function applyDeliveryFact() {
  const node = document.getElementById('detail-delivery-fact');
  if (!node) return;
  deliveryFactPromise = deliveryFactPromise || fetch(`${API_BASE}/config`).then((response) => (response.ok ? response.json() : null)).catch(() => null);
  deliveryFactPromise.then((payload) => {
    if (!payload) return;
    const inside = Number(payload.delivery?.dhaka || 0);
    const outside = Number(payload.delivery?.outsideDhaka || 0);
    const target = document.getElementById('detail-delivery-fact');
    if (target && (inside || outside)) target.textContent = `${money(inside)} Dhaka · ${money(outside)} outside`;
  });
}

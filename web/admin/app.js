const API_BASE = window.RINOVA_API_BASE || '/api';
const state = { token: sessionStorage.getItem('rinova-admin-token') || '', storeConfig: null, products: [], catalogue: [], orders: [], categories: [], settings: {}, days: 30, posProducts: [], posCart: [], barcodeLabels: [], offlineLabels: (() => { try { const value = JSON.parse(localStorage.getItem('rinova-offline-barcode-labels') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } })(), adminChat: [], marketingBanners: [], newsletterLeads: [], analyticsSummary: null, notifications: [], adminMode: sessionStorage.getItem('rinova-admin-mode') === 'edit' ? 'edit' : 'view', editRouteHandled: false };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD')}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const optionalNumber = (value) => value === '' ? null : Number(value);
/** Public store config (courier partner, delivery amounts) so panels can name what the customer sees. */
async function loadStoreConfig() {
  try {
    const response = await fetch(`${API_BASE}/config`);
    if (response.ok) state.storeConfig = await response.json();
  } catch {
    // Panels fall back to the default partner name.
  }
}
const deliveryPartnerName = () => state.storeConfig?.delivery?.partner || 'Steadfast';

function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2400); }
/** navigator.clipboard is unavailable on insecure origins, so keep a selection-based fallback. */
async function copyToClipboard(text, successMessage = 'Copied to clipboard') {
  const value = String(text || '');
  if (!value) return toast('Nothing to copy.');
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return toast(successMessage); }
    throw new Error('clipboard unavailable');
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand?.('copy');
    area.remove();
    toast(copied ? successMessage : 'Copy failed; select the text manually.');
  }
}
// ---------------------------------------------------------------------------
// Product editor helpers: gallery tiles, bulk-price rows and category-aware
// option fields. The owner never sees or types JSON — hidden inputs carry it.
// ---------------------------------------------------------------------------
const editorState = { media: [], tiers: [], options: { size: [], color: [] }, details: {}, variantPrices: {}, variantStock: {}, faq: [] };

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free size'];
const CLOTHING_COLORS = ['Black', 'White', 'Red', 'Maroon', 'Pink', 'Blue', 'Navy', 'Green', 'Yellow', 'Beige', 'Brown', 'Grey', 'Golden', 'Multicolour'];
const CLOTHING_DETAILS = [
  { key: 'fabric', label: 'Fabric · কাপড়', placeholder: 'Cotton, Georgette, Linen…' },
  { key: 'fit', label: 'Fit · ফিটিং', placeholder: 'Regular, Slim, Loose…' },
  { key: 'sleeve', label: 'Sleeve · হাতা', placeholder: 'Full sleeve, Half sleeve…' },
  { key: 'occasion', label: 'Occasion · উপলক্ষ', placeholder: 'Casual, Party, Eid…' },
  { key: 'wash_care', label: 'Wash care · ধোয়ার নিয়ম', placeholder: 'Hand wash, Dry clean only…' },
];
const BEAUTY_DETAILS = [
  { key: 'skin_type', label: 'Skin type · ত্বকের ধরন', placeholder: 'Oily, Dry, All skin types…' },
  { key: 'shade', label: 'Shade · শেড', placeholder: 'Natural, Warm beige…' },
  { key: 'ingredients', label: 'Key ingredients · উপাদান', placeholder: 'Neem, Vitamin C…' },
];

/** Clothing needs sizes and colours; grams mean nothing for a dress. */
function isClothingCategory(categoryId) {
  const category = state.categories.find((item) => String(item.id) === String(categoryId));
  return /clothing|dress|apparel|fashion|garment|saree|panjabi/i.test(`${category?.name || ''} ${category?.slug || ''}`);
}

// ---------- gallery ----------
function renderGalleryManager() {
  const node = $('#gallery-manager');
  const field = $('#product-media-json');
  if (!node || !field) return;
  field.value = JSON.stringify(editorState.media);
  node.innerHTML = editorState.media.length ? editorState.media.map((item, index) => `<figure class="gallery-tile" data-gallery-index="${index}">${item.type === 'video' ? '<span class="gallery-tile-video">▶ Video</span>' : `<img src="${escapeHtml(item.url)}" alt="" loading="lazy" />`}<figcaption>${index === 0 ? 'প্রধান' : `#${index + 1}`}</figcaption><div class="gallery-tile-actions"><button type="button" class="gallery-tile-button" data-gallery-move="${index}" data-direction="-1" aria-label="Move earlier" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" class="gallery-tile-button" data-gallery-move="${index}" data-direction="1" aria-label="Move later" ${index === editorState.media.length - 1 ? 'disabled' : ''}>→</button><button type="button" class="gallery-tile-button remove" data-gallery-remove="${index}" aria-label="Remove">✕</button></div></figure>`).join('') : '<p class="muted">এখনো কোনো ছবি যোগ করা হয়নি।</p>';
  node.querySelectorAll('[data-gallery-remove]').forEach((button) => button.addEventListener('click', () => { editorState.media.splice(Number(button.dataset.galleryRemove), 1); renderGalleryManager(); }));
  node.querySelectorAll('[data-gallery-move]').forEach((button) => button.addEventListener('click', () => {
    const from = Number(button.dataset.galleryMove);
    const to = from + Number(button.dataset.direction);
    if (to < 0 || to >= editorState.media.length) return;
    const [moved] = editorState.media.splice(from, 1);
    editorState.media.splice(to, 0, moved);
    renderGalleryManager();
  }));
}

function setEditorMedia(value) {
  try { editorState.media = parseEditorMedia(value); } catch { editorState.media = []; }
  renderGalleryManager();
}

function addEditorMedia(entries) {
  for (const entry of entries) {
    const url = String(entry?.url || '').trim();
    if (!url || editorState.media.some((item) => item.url.toLowerCase() === url.toLowerCase())) continue;
    editorState.media.push({ type: entry.type === 'video' ? 'video' : 'image', url });
  }
  renderGalleryManager();
}

function addGalleryVideo() {
  const input = $('#gallery-video-url');
  const message = $('#upload-message');
  const url = String(input?.value || '').trim();
  if (!url) return toast('ভিডিও লিংক দিন।');
  if (!/^https:\/\//i.test(url)) { if (message) message.textContent = 'ভিডিও লিংক https:// দিয়ে শুরু হতে হবে।'; return; }
  addEditorMedia([{ type: 'video', url }]);
  input.value = '';
  if (message) message.textContent = 'ভিডিও যোগ হয়েছে। Save করলে সাইটে দেখাবে।';
}

// ---------- bulk pricing ----------
function renderTierRows() {
  const node = $('#tier-rows');
  const field = $('#product-volume-tiers');
  if (!node || !field) return;
  const clean = editorState.tiers.filter((tier) => Number(tier.minQty) > 0 && Number(tier.price) > 0).map((tier) => ({ minQty: Math.floor(Number(tier.minQty)), price: Number(tier.price) }));
  field.value = JSON.stringify(clean);
  node.innerHTML = editorState.tiers.length ? editorState.tiers.map((tier, index) => `<div class="tier-row" data-tier-index="${index}"><span>কমপক্ষে</span><input type="number" min="2" step="1" value="${Number(tier.minQty) || ''}" data-tier-qty="${index}" aria-label="Minimum quantity" /><span>টি কিনলে প্রতিটি</span><input type="number" min="0" step="1" value="${Number(tier.price) || ''}" data-tier-price="${index}" aria-label="Unit price" /><span>৳</span><button type="button" class="icon-action" data-tier-remove="${index}">Remove</button></div>`).join('') : '<p class="muted">কোনো বাল্ক দাম নেই।</p>';
  node.querySelectorAll('[data-tier-qty]').forEach((input) => input.addEventListener('input', () => { editorState.tiers[Number(input.dataset.tierQty)].minQty = input.value; renderTierField(); }));
  node.querySelectorAll('[data-tier-price]').forEach((input) => input.addEventListener('input', () => { editorState.tiers[Number(input.dataset.tierPrice)].price = input.value; renderTierField(); }));
  node.querySelectorAll('[data-tier-remove]').forEach((button) => button.addEventListener('click', () => { editorState.tiers.splice(Number(button.dataset.tierRemove), 1); renderTierRows(); }));
}

/** Update the hidden field without re-rendering, so typing does not lose focus. */
function renderTierField() {
  const field = $('#product-volume-tiers');
  if (!field) return;
  field.value = JSON.stringify(editorState.tiers.filter((tier) => Number(tier.minQty) > 0 && Number(tier.price) > 0).map((tier) => ({ minQty: Math.floor(Number(tier.minQty)), price: Number(tier.price) })));
}

function setEditorTiers(value) {
  let parsed = [];
  try { parsed = JSON.parse(value || '[]'); } catch { parsed = []; }
  editorState.tiers = Array.isArray(parsed) ? parsed.map((tier) => ({ minQty: Number(tier?.minQty) || '', price: Number(tier?.price) || '' })) : [];
  renderTierRows();
}

// ---------- category-aware options ----------
function chipRow(group, title, hint, presets, selected) {
  const custom = selected.filter((value) => !presets.includes(value));
  return `<div class="option-group" data-option-group="${group}"><div class="option-group-head"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(hint)}</small></div><div class="option-chips">${[...presets, ...custom].map((value) => `<label class="option-chip${selected.includes(value) ? ' selected' : ''}"><input type="checkbox" value="${escapeHtml(value)}" data-option-value="${group}" ${selected.includes(value) ? 'checked' : ''} />${escapeHtml(value)}</label>`).join('')}</div><div class="option-add"><input type="text" data-option-custom="${group}" placeholder="নিজের অপশন লিখুন" /><button type="button" class="icon-action" data-option-add="${group}">যোগ করুন</button></div></div>`;
}

function detailRows(fields) {
  return `<div class="option-details">${fields.map((field) => `<label>${escapeHtml(field.label)}<input type="text" data-option-detail="${escapeHtml(field.key)}" value="${escapeHtml(editorState.details[field.key] || '')}" placeholder="${escapeHtml(field.placeholder)}" /></label>`).join('')}</div>`;
}

function renderProductOptions() {
  const body = $('#product-options-body');
  const hint = $('#product-options-hint');
  const weightLabel = $('#weight-label');
  if (!body) return;
  const categoryId = $('#product-form')?.elements.namedItem('categoryId')?.value;
  const clothing = isClothingCategory(categoryId);
  if (hint) hint.textContent = clothing
    ? 'পোশাকের জন্য সাইজ ও রঙ বাছাই করুন। কাস্টমার এগুলো থেকে বেছে নেবে।'
    : 'প্রয়োজন হলে সাইজ/ভ্যারিয়েন্ট ও রঙ যোগ করুন। খালি রাখলে কাস্টমার কিছু বাছবে না।';
  if (weightLabel) weightLabel.textContent = clothing ? 'কুরিয়ার ওজন (Courier weight in grams)' : 'ওজন (Weight in Grams)';
  body.innerHTML = clothing
    ? chipRow('size', 'সাইজ (Size)', 'কাস্টমার অবশ্যই একটি সাইজ বাছবে।', CLOTHING_SIZES, editorState.options.size)
      + chipRow('color', 'রঙ (Colour)', 'কাস্টমার অবশ্যই একটি রঙ বাছবে।', CLOTHING_COLORS, editorState.options.color)
      + detailRows(CLOTHING_DETAILS)
    : chipRow('size', 'সাইজ / পরিমাণ (Size or variant)', 'যেমন 50ml, 150ml, 100g। প্রযোজ্য না হলে খালি রাখুন।', [], editorState.options.size)
      + chipRow('color', 'শেড / রঙ (Shade or colour)', 'প্রযোজ্য না হলে খালি রাখুন।', [], editorState.options.color)
      + detailRows(BEAUTY_DETAILS);

  body.querySelectorAll('[data-option-value]').forEach((box) => box.addEventListener('change', () => {
    const group = box.dataset.optionValue;
    const values = new Set(editorState.options[group]);
    if (box.checked) values.add(box.value); else values.delete(box.value);
    editorState.options[group] = [...values];
    box.closest('.option-chip')?.classList.toggle('selected', box.checked);
    renderVariantPrices();
  }));
  body.querySelectorAll('[data-option-add]').forEach((button) => button.addEventListener('click', () => {
    const group = button.dataset.optionAdd;
    const input = body.querySelector(`[data-option-custom="${group}"]`);
    const value = String(input?.value || '').trim();
    if (!value) return;
    if (!editorState.options[group].includes(value)) editorState.options[group].push(value);
    if (input) input.value = '';
    renderProductOptions();
    renderVariantPrices();
  }));
  body.querySelectorAll('[data-option-detail]').forEach((input) => input.addEventListener('input', () => { editorState.details[input.dataset.optionDetail] = input.value; }));
}

function setEditorOptions(specsJson) {
  let specs = [];
  try { specs = JSON.parse(specsJson || '[]'); } catch { specs = []; }
  if (!Array.isArray(specs)) specs = [];
  const pick = (names) => {
    const entry = specs.find((item) => names.includes(String(item?.key || item?.name || '').toLowerCase()));
    return Array.isArray(entry?.values) ? entry.values.map(String) : [];
  };
  editorState.options = { size: pick(['size']), color: pick(['color', 'colour']) };
  editorState.details = {};
  for (const item of specs) {
    const key = String(item?.key || '').toLowerCase();
    if (!key || ['size', 'color', 'colour'].includes(key) || Array.isArray(item?.values)) continue;
    editorState.details[key] = String(item.value ?? '');
  }
  renderProductOptions();
}

/** Turn the option UI back into the specs array the API stores. */
function editorSpecsPayload() {
  const specs = [];
  if (editorState.options.size.length) specs.push({ key: 'size', name: 'Size', values: editorState.options.size });
  if (editorState.options.color.length) specs.push({ key: 'color', name: 'Colour', values: editorState.options.color });
  for (const [key, value] of Object.entries(editorState.details)) {
    const text = String(value || '').trim();
    if (!text) continue;
    const known = [...CLOTHING_DETAILS, ...BEAUTY_DETAILS].find((field) => field.key === key);
    specs.push({ key, name: known ? known.label.split(' · ')[0] : key, value: text });
  }
  return specs;
}

/**
 * A size used to be a bare label, so "50ml or 150ml" carried one price and the shop had no way
 * to charge more for the larger jar — the product page then had no price to show when a size
 * was picked. Every chosen size now gets its own price box. Leave one empty and that size sells
 * at the product's base price.
 */
function renderVariantPrices() {
  const host = document.getElementById('variant-price-body');
  if (!host) return;
  const sizes = editorState.options.size || [];
  if (!sizes.length) {
    host.innerHTML = '<p class="muted">সাইজ যোগ করলে এখানে প্রতিটি সাইজের দাম ও স্টক বসানোর ঘর আসবে। (Add a size above to set its price and stock.)</p>';
    return;
  }
  const base = Number(document.querySelector('#product-form [name="price"]')?.value || 0);
  host.innerHTML = `<div class="variant-price-grid variant-price-grid-stock"><span class="variant-price-head">সাইজ</span><span class="variant-price-head">দাম (৳)</span><span class="variant-price-head">স্টক (Qty)</span>${sizes.map((label) => {
    const price = editorState.variantPrices[label];
    const stock = editorState.variantStock[label];
    return `<span class="variant-price-label">${escapeHtml(label)}</span><input type="number" min="0" step="1" inputmode="numeric" data-variant-price="${escapeHtml(label)}" aria-label="Price for ${escapeHtml(label)}" value="${price === undefined || price === null || price === '' ? '' : Number(price)}" placeholder="${base || 'দাম'}" /><input type="number" min="0" step="1" inputmode="numeric" data-variant-stock="${escapeHtml(label)}" aria-label="Stock for ${escapeHtml(label)}" value="${stock === undefined || stock === null || stock === '' ? '' : Number(stock)}" placeholder="0" />`;
  }).join('')}</div><p class="muted">দাম খালি রাখলে প্রোডাক্টের মূল দাম প্রযোজ্য হবে। স্টক দিলে সেই সাইজ শেষ হলে কাস্টমার আর অর্ডার দিতে পারবে না; সব সাইজ ০ রাখলে শুধু মূল স্টক গোনা হবে। (Empty price = the base price. Enter stock to count each size on its own.)</p>`;
  host.querySelectorAll('[data-variant-price]').forEach((input) => input.addEventListener('input', () => {
    const label = input.dataset.variantPrice;
    const raw = input.value.trim();
    if (raw === '') delete editorState.variantPrices[label];
    else editorState.variantPrices[label] = Math.max(0, Number(raw) || 0);
  }));
  host.querySelectorAll('[data-variant-stock]').forEach((input) => input.addEventListener('input', () => {
    const label = input.dataset.variantStock;
    const raw = input.value.trim();
    if (raw === '') delete editorState.variantStock[label];
    else editorState.variantStock[label] = Math.max(0, Math.floor(Number(raw) || 0));
  }));
}

/** What the API stores: one row per size (with its price and stock) and one per colour. */
function editorVariantsPayload() {
  const sizes = (editorState.options.size || []).map((label) => ({ kind: 'size', label, price: editorState.variantPrices[label] ?? null, stock: editorState.variantStock[label] ?? 0 }));
  const colors = (editorState.options.color || []).map((label) => ({ kind: 'color', label, price: null, stock: 0 }));
  return [...sizes, ...colors];
}

/**
 * Shows what the offer does to the price before it is saved. A percentage the owner cannot see
 * the effect of is a percentage they will get wrong once.
 */
function renderOfferPreview() {
  const node = document.getElementById('product-offer-preview');
  if (!node) return;
  const percent = Math.max(0, Math.min(99, Math.round(Number(document.getElementById('product-discount-percent')?.value || 0))));
  const price = Math.max(0, Number(document.querySelector('#product-form [name="price"]')?.value || 0));
  const ends = String(document.getElementById('product-discount-ends')?.value || '').trim();
  if (!percent) { node.textContent = 'অফার বন্ধ আছে। (No offer — the product sells at its normal price.)'; node.className = 'offer-preview muted'; return; }
  const now = Math.max(0, Math.round((price * (100 - percent)) / 100));
  const expired = ends && Date.parse(`${ends}T23:59:59Z`) < Date.now();
  node.textContent = expired
    ? `এই তারিখ পেরিয়ে গেছে, তাই অফারটি এখন বন্ধ। (The end date has passed, so this offer is not running.)`
    : `কাস্টমার দেখবে ${money(now)} (আগের দাম ${money(price)}), ${percent}% ছাড়${ends ? `, ${ends} পর্যন্ত` : ''}।`;
  node.className = expired ? 'offer-preview warn' : 'offer-preview ok';
}
['product-discount-percent', 'product-discount-label', 'product-discount-ends'].forEach((id) => document.getElementById(id)?.addEventListener('input', renderOfferPreview));
document.querySelector('#product-form [name="price"]')?.addEventListener('input', renderOfferPreview);

/** The product FAQ used to be the same four hard-coded questions on every product. */
function renderFaqRows() {
  const host = document.getElementById('product-faq-body');
  if (!host) return;
  host.innerHTML = (editorState.faq.length ? editorState.faq : []).map((row, index) => `<div class="faq-row" data-faq-row="${index}"><label>প্রশ্ন (Question)<input data-faq-question="${index}" value="${escapeHtml(row.question || '')}" placeholder="এই প্রোডাক্ট কিভাবে ব্যবহার করব?" /></label><label>উত্তর (Answer)<textarea rows="2" data-faq-answer="${index}" placeholder="সংক্ষেপে উত্তর লিখুন।">${escapeHtml(row.answer || '')}</textarea></label><button type="button" class="icon-action" data-faq-remove="${index}">Remove</button></div>`).join('')
    || '<p class="muted">কোনো প্রশ্ন যোগ করা হয়নি। খালি রাখলে প্রোডাক্ট পেজে সাধারণ তথ্য দেখাবে। (None yet — the page falls back to general information.)</p>';
  host.querySelectorAll('[data-faq-question]').forEach((input) => input.addEventListener('input', () => { editorState.faq[Number(input.dataset.faqQuestion)].question = input.value; }));
  host.querySelectorAll('[data-faq-answer]').forEach((input) => input.addEventListener('input', () => { editorState.faq[Number(input.dataset.faqAnswer)].answer = input.value; }));
  host.querySelectorAll('[data-faq-remove]').forEach((button) => button.addEventListener('click', () => { editorState.faq.splice(Number(button.dataset.faqRemove), 1); renderFaqRows(); }));
}

document.getElementById('faq-add')?.addEventListener('click', () => { editorState.faq.push({ question: '', answer: '' }); renderFaqRows(); });
document.querySelector('#product-form [name="price"]')?.addEventListener('input', renderVariantPrices);

/** Pull saved variants and FAQ back when an existing product is opened. */
async function loadEditorExtras(sku) {
  editorState.variantPrices = {};
  editorState.variantStock = {};
  editorState.faq = [];
  if (sku) {
    try {
      const data = await api(`/admin/products/sku/${encodeURIComponent(sku)}/detail`);
      for (const variant of data.variants || []) {
        const group = variant.kind === 'color' ? 'color' : 'size';
        // A size saved as a priced variant might never have reached specs_json. The storefront
        // already merges both lists; without this the editor showed no row for it, so its price
        // and stock were invisible and a save would have deleted them.
        if (variant.label && !editorState.options[group].includes(variant.label)) editorState.options[group].push(variant.label);
        if (variant.kind !== 'size') continue;
        if (variant.price !== null && variant.price !== undefined) editorState.variantPrices[variant.label] = Number(variant.price);
        if (Number(variant.stock || 0) > 0) editorState.variantStock[variant.label] = Number(variant.stock);
      }
      renderProductOptions();
      editorState.faq = (data.faq || []).map((row) => ({ question: row.question || '', answer: row.answer || '' }));
    } catch {
      // A new product, or the detail call failed; the editor still opens with empty extras.
    }
  }
  renderVariantPrices();
  renderFaqRows();
}

function parseEditorMedia(value) { const raw = String(value || '').trim(); if (!raw) return []; const parsed = JSON.parse(raw); if (!Array.isArray(parsed)) throw new Error('Media must be a JSON array.'); const seen = new Set(); return parsed.map((item) => { const entry = typeof item === 'string' ? { type: 'image', url: item } : item; const url = String(entry?.url || '').trim(); if (!/^(https:\/\/|\/assets\/|\/media\/)/i.test(url)) throw new Error('Media URLs must start with https://, /assets/ or /media/.'); return { type: entry?.type === 'video' ? 'video' : 'image', url, ...(entry?.alt ? { alt: String(entry.alt).slice(0, 160) } : {}) }; }).filter((item) => { const key = `${item.type}:${item.url.toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function updateImagePreview() { const input = document.querySelector('#product-form [name="imageUrl"]'); const preview = $('#image-preview'); const url = input?.value?.trim() || ''; if (!url) { preview.classList.add('hidden'); preview.removeAttribute('src'); } else { preview.src = url; preview.classList.remove('hidden'); preview.onerror = () => preview.classList.add('hidden'); } }
function setAdminMode(mode) { state.adminMode = mode === 'edit' ? 'edit' : 'view'; sessionStorage.setItem('rinova-admin-mode', state.adminMode); document.body.dataset.adminMode = state.adminMode; document.querySelectorAll('[data-admin-mode]').forEach((button) => button.classList.toggle('active', button.dataset.adminMode === state.adminMode)); const hint = $('#mode-hint'); if (hint) hint.textContent = state.adminMode === 'edit' ? 'Edit Mode: live changes are enabled.' : 'View Mode: inspect the live shop, then choose Quick edit when needed.'; const previewStatus = $('#admin-preview-status'); if (previewStatus) previewStatus.textContent = state.adminMode === 'edit' ? 'Edit mode: choose Edit product from the live preview or use the catalogue table.' : 'View mode: inspect the same live storefront customers see. Switch to Edit when you want to change a product.'; $('#admin-preview-frame')?.contentWindow?.postMessage({ type: 'rinova-admin-preview-mode', mode: state.adminMode }, window.location.origin); if (state.products.length) renderProducts(); }
const morningTasks = [{ id: 'overview', label: 'Dashboard numbers', detail: 'Revenue, orders, stock এবং restock দেখুন।', view: 'overview' }, { id: 'orders', label: 'Pending orders', detail: 'নতুন order, payment এবং customer তথ্য মিলান।', view: 'orders' }, { id: 'inventory', label: 'Low stock', detail: 'যে product threshold-এর নিচে আছে তা দেখুন।', view: 'inventory' }, { id: 'returns', label: 'Return requests', detail: 'নতুন return request approve বা review করুন।', view: 'returns' }, { id: 'pos', label: 'Yesterday POS', detail: 'গতকালের দোকানের sale ও receipt record দেখুন।', view: 'pos' }, { id: 'storefront', label: 'Live storefront', detail: 'দাম, image, stock এবং visible product একবার দেখুন।', href: '/?admin_preview=1' }];
function morningStorageKey() { return `rinova-morning-check-${new Date().toISOString().slice(0, 10)}`; }
function morningChecked() { try { return JSON.parse(localStorage.getItem(morningStorageKey()) || '{}'); } catch { return {}; } }
function renderMorningChecklist() { const node = $('#morning-checklist-list'); if (!node) return; const checked = morningChecked(); node.innerHTML = morningTasks.map((task) => `<div class="morning-check-item ${checked[task.id] ? 'done' : ''}"><button class="morning-check-toggle" type="button" data-morning-toggle="${task.id}" aria-label="${checked[task.id] ? 'Uncheck' : 'Complete'} ${escapeHtml(task.label)}">${checked[task.id] ? '✓' : ''}</button><span class="morning-check-copy"><strong>${escapeHtml(task.label)}</strong><small>${escapeHtml(task.detail)}</small></span>${task.href ? `<a class="icon-action morning-open" href="${task.href}" target="${task.id === 'storefront' ? '_self' : '_blank'}" rel="noopener">Open</a>` : `<button class="icon-action morning-open" type="button" data-morning-view="${task.view}">Open</button>`}</div>`).join(''); }
function toggleMorningTask(id) { const checked = morningChecked(); checked[id] = !checked[id]; localStorage.setItem(morningStorageKey(), JSON.stringify(checked)); renderMorningChecklist(); }
async function api(path, options = {}) { const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }; if (state.token) headers.Authorization = `Bearer ${state.token}`; const response = await fetch(`${API_BASE}${path}`, { ...options, headers }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Request failed'); return data; }
async function uploadProductImage(file) { const headers = {}; if (state.token) headers.Authorization = `Bearer ${state.token}`; const form = new FormData(); form.append('file', file); const response = await fetch(`${API_BASE}/admin/product-media`, { method: 'POST', headers, body: form }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Image upload failed.'); return data.media; }
async function uploadPrimaryImage() { const input = $('#primary-image-file'); const file = input?.files?.[0]; if (!file) return toast('Choose a primary image first.'); const message = $('#upload-message'); message.textContent = 'Uploading primary image…'; try { const media = await uploadProductImage(file); const field = $('#product-form').elements.namedItem('imageUrl'); field.value = media.url; updateImagePreview(); message.textContent = 'Primary image uploaded. Save the product to apply it.'; input.value = ''; } catch (error) { message.textContent = error.message; } }
async function uploadGalleryImages() {
  const input = $('#gallery-image-files');
  const button = $('#upload-gallery-images');
  const files = Array.from(input?.files || []);
  if (!files.length) return toast('আগে এক বা একাধিক ছবি বাছাই করুন।');
  if (button?.disabled) return;
  const message = $('#upload-message');
  if (button) button.disabled = true;
  if (message) message.textContent = `${files.length} টি ছবি আপলোড হচ্ছে…`;
  const uploaded = [];
  const failed = [];
  for (const file of files) {
    try { const media = await uploadProductImage(file); uploaded.push({ type: 'image', url: media.url }); }
    catch (error) { failed.push(`${file.name}: ${error.message}`); }
  }
  addEditorMedia(uploaded);
  // The first upload doubles as the primary image when none is set yet.
  const primary = $('#product-form')?.elements.namedItem('imageUrl');
  if (primary && !primary.value.trim() && uploaded[0]) { primary.value = uploaded[0].url; updateImagePreview(); }
  if (input) input.value = '';
  if (button) button.disabled = false;
  if (message) message.textContent = failed.length ? `${uploaded.length} টি যোগ হয়েছে। সমস্যা: ${failed.join(' · ')}` : `${uploaded.length} টি ছবি যোগ হয়েছে। Save করলে সাইটে দেখাবে।`;
}
function showApp(username) { loadStoreConfig(); $('#login-screen').classList.add('hidden'); $('#app-shell').classList.remove('hidden'); $('#signed-in-user').textContent = username || 'Admin'; setAdminMode(state.adminMode); renderMorningChecklist(); loadNotifications(); const params = new URLSearchParams(window.location.search); const allowedViews = ['overview', 'products', 'categories', 'orders', 'inventory', 'settings', 'returns', 'reviews', 'pos', 'barcode-generator', 'cms', 'marketing', 'traffic', 'assistant', 'campaigns', 'team']; const requestedView = allowedViews.includes(params.get('view')) ? params.get('view') : 'overview'; loadView(requestedView); }
function showLogin() { $('#login-screen').classList.remove('hidden'); $('#app-shell').classList.add('hidden'); }
async function login(event) { event.preventDefault(); $('#login-error').textContent = ''; try { const data = await api('/admin/login', { method: 'POST', body: JSON.stringify({ username: $('#login-username').value, password: $('#login-password').value }) }); state.token = data.token; sessionStorage.setItem('rinova-admin-token', state.token); showApp(data.username); } catch (error) { $('#login-error').textContent = error.message; } }
async function boot() { if (!state.token) return showLogin(); try { const session = await api('/admin/session'); showApp(session.username); } catch { sessionStorage.removeItem('rinova-admin-token'); state.token = ''; showLogin(); } }
function closeMobileNav() { const sidebar = $('.sidebar'); const backdrop = $('#sidebar-backdrop'); sidebar?.classList.remove('open'); backdrop?.classList.remove('open'); backdrop?.setAttribute('aria-hidden', 'true'); $('#mobile-menu')?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open'); }
function toggleMobileNav(open) { const sidebar = $('.sidebar'); const backdrop = $('#sidebar-backdrop'); if (open) toggleNotificationPanel(false); sidebar?.classList.toggle('open', open); backdrop?.classList.toggle('open', open); backdrop?.setAttribute('aria-hidden', String(!open)); $('#mobile-menu')?.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('nav-open', open); }
function openAdminPreview() { const panel = $('#admin-preview-panel'); if (!panel) return; panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); document.body.classList.add('preview-open'); $('#admin-preview-frame')?.contentWindow?.postMessage({ type: 'rinova-admin-preview-mode', mode: state.adminMode }, window.location.origin); panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function closeAdminPreview() { const panel = $('#admin-preview-panel'); if (!panel) return; panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); document.body.classList.remove('preview-open'); }
function refreshAdminPreview() { const frame = $('#admin-preview-frame'); if (frame) frame.src = `/?admin_preview=1&admin_embed=1&refresh=${Date.now()}`; }
function loadView(view) { $('#view-assistant')?.classList.remove('assistant-popover'); $('#assistant-fab')?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('assistant-open'); closeMobileNav(); closeAdminPreview(); document.querySelectorAll('.view').forEach((node) => node.classList.toggle('hidden', node.id !== `view-${view}`)); document.querySelectorAll('.nav-item[data-view]').forEach((node) => node.classList.toggle('active', node.dataset.view === view)); const url = new URL(window.location.href); if (view === 'overview') url.searchParams.delete('view'); else url.searchParams.set('view', view); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`); $('#view-title').textContent = ({ overview: 'Dashboard', products: 'Products', categories: 'Categories', orders: 'Orders', inventory: 'Inventory', settings: 'Settings', returns: 'Returns', reviews: 'Reviews', pos: 'POS & Barcodes', cms: 'Content CMS', marketing: 'Marketing & banners', traffic: 'Traffic & SEO', 'barcode-generator': 'Barcode Generator', assistant: 'Admin Assistant', campaigns: 'Campaign Studio', team: 'Team & support' })[view] || 'Dashboard'; if (view === 'overview') loadOverview(); if (view === 'categories') loadCategories(); if (view === 'products' || view === 'inventory') { loadCategories(); loadProducts(); } if (view === 'orders') loadOrders(); if (view === 'settings') loadSettings(); if (view === 'returns') loadReturns(); if (view === 'reviews') loadReviews(); if (view === 'pos') loadPosProducts(); if (view === 'barcode-generator') { loadProducts(); loadBarcodeGenerator(); } if (view === 'cms' || view === 'marketing') loadCms(); if (view === 'traffic') loadAnalytics(); if (view === 'assistant') renderAdminChat(); if (view === 'team') loadTeamView(); }
function openAssistantPopup() { loadView('assistant'); const assistant = $('#view-assistant'); assistant.classList.add('assistant-popover'); assistant.setAttribute('aria-hidden', 'false'); $('#assistant-fab')?.setAttribute('aria-expanded', 'true'); document.body.classList.add('assistant-open'); renderAdminChat(); $('#admin-chat-input')?.focus(); }
function renderAnalyticsSummary(data) { state.analyticsSummary = data; const chip = $('#traffic-status-chip'); const banner = $('#ga4-status-banner'); const metrics = $('#ga4-summary-grid'); const events = $('#ga4-event-list'); const pages = $('#ga4-page-list'); if (!chip || !banner || !metrics || !events || !pages) return; if (!data?.configured) { chip.textContent = 'Needs access'; chip.className = 'privacy-chip'; banner.innerHTML = `<strong>GA4 report is not available yet.</strong><span>${escapeHtml(data?.reason || 'Add the service-account access and enable the Analytics Data API.')}</span>`; metrics.innerHTML = ''; events.innerHTML = '<p class="muted">Connect the GA4 service account to load event activity.</p>'; pages.innerHTML = '<p class="muted">Connect the GA4 service account to load top pages.</p>'; return; } chip.textContent = `Live · ${data.days}d`; chip.className = 'privacy-chip analytics-ready-chip'; banner.innerHTML = `<strong>Live GA4 report connected.</strong><span>Property ${escapeHtml(data.propertyId)} · ${data.days}-day window · refreshed ${new Date().toLocaleTimeString('en-BD', { hour: 'numeric', minute: '2-digit' })}</span>`; const overview = data.overview || []; const sum = (key) => overview.reduce((total, row) => total + Number(row[key] || 0), 0); metrics.innerHTML = [['Active users', sum('activeUsers').toLocaleString('en-BD')], ['Sessions', sum('sessions').toLocaleString('en-BD')], ['Events', sum('eventCount').toLocaleString('en-BD')], ['Purchase revenue', `৳${sum('purchaseRevenue').toLocaleString('en-BD')}`], ['Transactions', sum('transactions').toLocaleString('en-BD')], ['Purchase rate', `${sum('sessions') ? ((sum('transactions') / sum('sessions')) * 100).toFixed(2) : '0.00'}%`]].map(([label, value]) => `<article class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>`).join(''); events.innerHTML = (data.events || []).length ? data.events.map((row) => `<div class="list-row"><span><strong>${escapeHtml(row.eventName || 'Unknown event')}</strong><small>GA4 event</small></span><strong>${Number(row.eventCount || 0).toLocaleString('en-BD')}</strong></div>`).join('') : '<p class="muted">No events in this period.</p>'; pages.innerHTML = (data.pages || []).length ? data.pages.map((row) => `<div class="list-row"><span><strong>${escapeHtml(row.pagePath || '/')}</strong><small>${Number(row.activeUsers || 0).toLocaleString('en-BD')} active users</small></span><strong>${Number(row.screenPageViews || 0).toLocaleString('en-BD')}</strong></div>`).join('') : '<p class="muted">No page views in this period.</p>'; }
async function loadAnalytics() { const chip = $('#traffic-status-chip'); if (chip) chip.textContent = 'Loading GA4'; try { const data = await api(`/admin/analytics/summary?days=${state.days}`); renderAnalyticsSummary(data); } catch (error) { renderAnalyticsSummary({ configured: false, reason: error.message }); } }
function renderNotifications() { const list = $('#notification-list'); const count = $('#notification-count'); if (!list || !count) return; const notifications = state.notifications || []; const unread = notifications.filter((item) => Number(item.isRead) === 0).length; count.textContent = String(unread); count.classList.toggle('hidden', unread === 0); list.innerHTML = notifications.length ? notifications.map((item) => `<button type="button" class="notification-row ${Number(item.isRead) ? 'is-read' : 'is-unread'}" data-notification-id="${item.id}" data-notification-type="${escapeHtml(item.type || 'info')}" data-notification-entity-type="${escapeHtml(item.entityType || '')}" data-notification-entity="${escapeHtml(item.entityId || '')}"><span class="notification-dot notification-${escapeHtml(item.type || 'info')}" aria-hidden="true"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small><em>${escapeHtml(item.createdAt || '')}</em></span></button>`).join('') : '<p class="muted">No notifications yet.</p>'; }
async function loadNotifications() { try { const data = await api('/admin/notifications'); state.notifications = data.notifications || []; renderNotifications(); } catch {} }
function toggleNotificationPanel(open) { const panel = $('#notification-panel'); if (!panel) return; const next = typeof open === 'boolean' ? open : panel.classList.contains('hidden'); if (next) closeMobileNav(); panel.classList.toggle('hidden', !next); panel.setAttribute('aria-hidden', String(!next)); }
function openNotificationTarget(button) { const id = Number(button.dataset.notificationId); markNotificationRead(id); const type = String(button.dataset.notificationType || ''); const entityType = String(button.dataset.notificationEntityType || ''); const entity = String(button.dataset.notificationEntity || ''); toggleNotificationPanel(false); if (type === 'order' || type === 'sale' || type === 'pos_sale') { loadView('orders'); if (entity) { const search = $('#order-search'); if (search) { search.value = entity; loadOrders(); } } } else if (type === 'return') loadView('returns'); else if (type === 'lead' || type === 'newsletter' || type === 'newsletter_lead') loadView('marketing'); else if (type === 'integration') { if (entityType === 'order' || entityType === 'sale' || entityType === 'pos_sale') { loadView('orders'); if (entity) { const search = $('#order-search'); if (search) { search.value = entity; loadOrders(); } } } else if (entityType === 'return') loadView('returns'); else loadView('settings'); } else loadView('overview'); }
async function markNotificationRead(id) { try { await api(`/admin/notifications/${id}/read`, { method: 'PATCH' }); const item = state.notifications.find((notification) => Number(notification.id) === Number(id)); if (item) item.isRead = 1; renderNotifications(); } catch (error) { toast(error.message); } }
async function markAllNotificationsRead() { try { await api('/admin/notifications/read-all', { method: 'POST' }); state.notifications = state.notifications.map((item) => ({ ...item, isRead: 1 })); renderNotifications(); } catch (error) { toast(error.message); } }
function formatPercent(value) { return `${Number(value || 0).toFixed(1)}%`; }
function renderOverviewAlerts(data, insights) {
  const node = $('#overview-alerts'); if (!node) return;
  const restock = Number(data?.stock?.needsRestock || 0);
  const districtCount = Number(insights?.districts?.length || 0);
  const orders = Number(data?.revenue?.orders || 0);
  const alerts = [];
  if (restock > 0) alerts.push({ type: 'warning', label: 'Warning Alert · সতর্কতা', title: `${restock} product${restock === 1 ? '' : 's'} need restocking`, detail: 'Low-stock items are below their alert level.', action: 'Open inventory', view: 'inventory' });
  else alerts.push({ type: 'success', label: 'Success Alert · সফল', title: 'Stock levels look healthy', detail: 'No active product is below its low-stock alert level.', action: 'View inventory', view: 'inventory' });
  if (!orders) alerts.push({ type: 'info', label: 'Info Alert · তথ্য', title: 'No completed orders in this period', detail: 'Try a longer period or review pending orders.', action: 'Open orders', view: 'orders' });
  else if (!districtCount) alerts.push({ type: 'info', label: 'Info Alert · তথ্য', title: 'Customer locations are not mapped yet', detail: 'District insight will appear when orders include location data.', action: 'Open orders', view: 'orders' });
  else alerts.push({ type: 'info', label: 'Info Alert · তথ্য', title: `${districtCount} customer areas are active`, detail: 'District shares are calculated from customers with orders.', action: 'View orders', view: 'orders' });
  node.innerHTML = alerts.map((item) => `<button class="overview-alert overview-alert-${item.type}" type="button" data-overview-alert-view="${item.view}"><span class="overview-alert-icon" aria-hidden="true">${item.type === 'success' ? '✓' : item.type === 'warning' ? '!' : 'i'}</span><span class="overview-alert-copy"><small>${item.label}</small><strong>${escapeHtml(item.title)}</strong><em>${escapeHtml(item.detail)}</em></span><span class="overview-alert-action">${item.action} →</span></button>`).join('');
}
function renderOverviewTrend(insights) {
  const node = $('#overview-trend'); if (!node) return;
  const rows = insights?.trend || []; const width = 640; const height = 190; const pad = 24;
  if (!rows.length) { node.innerHTML = '<div class="insight-empty"><strong>No trend data yet</strong><span>Daily revenue and orders will appear here after sales are recorded.</span></div>'; return; }
  const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1); const points = rows.map((row, index) => { const x = pad + (index / Math.max(rows.length - 1, 1)) * (width - pad * 2); const y = height - pad - (Number(row.revenue || 0) / maxRevenue) * (height - pad * 2); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
  const area = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;
  const first = rows[0]?.day || ''; const last = rows[rows.length - 1]?.day || ''; const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0); const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  node.innerHTML = `<div class="trend-summary"><span><strong>৳${totalRevenue.toLocaleString('en-BD')}</strong><small>Revenue in period</small></span><span><strong>${totalOrders.toLocaleString('en-BD')}</strong><small>Completed orders</small></span></div><svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue trend from ${escapeHtml(first)} to ${escapeHtml(last)}"><defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7257d8" stop-opacity=".24"/><stop offset="1" stop-color="#7257d8" stop-opacity="0"/></linearGradient></defs><path class="trend-area" d="M ${area}"/><polyline class="trend-line" points="${points}"/><line class="trend-axis" x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}"/></svg><div class="trend-foot"><span>${escapeHtml(first)}</span><span>${escapeHtml(last)}</span></div>`;
}
function renderDistrictInsights(insights) {
  const rows = (insights?.districts || []).map((row) => ({ ...row, customers: Number(row.customers || 0), orders: Number(row.orders || 0), revenue: Number(row.revenue || 0) })); const total = Number(insights?.totals?.customers || rows.reduce((sum, row) => sum + row.customers, 0));
  const totalNode = $('#district-total'); if (totalNode) totalNode.textContent = `${rows.length} districts`;
  const list = $('#district-list'); const map = $('#district-map'); const cards = $('#district-cards');
  if (!rows.length) { const empty = '<div class="insight-empty"><strong>No district data yet</strong><span>Customer locations will appear after orders include a district.</span></div>'; if (list) list.innerHTML = empty; if (map) map.innerHTML = '<div class="district-map-empty">MAP<br><small>Waiting for customer locations</small></div>'; if (cards) cards.innerHTML = empty; return; }
  const top = rows.slice(0, 8); const share = (row) => total ? row.customers / total * 100 : 0;
  if (map) map.innerHTML = `<div class="district-map-grid">${top.slice(0, 12).map((row, index) => `<div class="district-map-tile district-level-${Math.min(5, index + 1)}"><span>${escapeHtml(row.district)}</span><strong>${formatPercent(share(row))}</strong></div>`).join('')}</div><div class="district-map-legend"><span><i class="legend-low"></i> Lower share</span><span><i class="legend-high"></i> Higher share</span></div>`;
  if (list) list.innerHTML = top.slice(0, 5).map((row, index) => `<div class="district-row"><span class="district-rank">${String(index + 1).padStart(2, '0')}</span><span class="district-row-copy"><strong>${escapeHtml(row.district)}</strong><small>${row.customers.toLocaleString('en-BD')} customers · ${row.orders.toLocaleString('en-BD')} orders</small></span><span class="district-share"><strong>${formatPercent(share(row))}</strong><i><b style="width:${Math.min(100, share(row))}%"></b></i></span></div>`).join('');
  if (cards) cards.innerHTML = top.slice(0, 3).map((row, index) => `<article class="district-card district-card-${index + 1}"><span class="district-card-index">0${index + 1}</span><strong>${escapeHtml(row.district)}</strong><b>${formatPercent(share(row))}</b><small>${row.customers.toLocaleString('en-BD')} customers · ৳${row.revenue.toLocaleString('en-BD')} revenue</small></article>`).join('');
}
function renderClientList(node, rows, mode) { if (!node) return; if (!rows?.length) { node.innerHTML = '<div class="insight-empty compact"><strong>No client records in this period</strong><span>New records will appear here automatically.</span></div>'; return; } node.innerHTML = rows.map((row) => `<div class="client-row"><span class="client-avatar">${escapeHtml(String(row.name || '?').slice(0, 1).toUpperCase())}</span><span class="client-copy"><strong>${escapeHtml(row.name || 'Unknown client')}</strong><small>${escapeHtml(row.phone || row.email || row.district || 'Contact unavailable')}</small></span><b>${mode === 'returns' ? `${row.returns} return${Number(row.returns) === 1 ? '' : 's'}` : `${row.cancelledOrders} cancelled`}</b></div>`).join(''); }
function renderProductTrend(data) { const node = $('#overview-product-trend'); if (!node) return; const rows = (data?.topProducts || []).slice(0, 5); if (!rows.length) { node.innerHTML = '<div class="insight-empty compact"><strong>No product trend yet</strong><span>Product movement will appear after sales are recorded.</span></div>'; return; } const max = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1); node.innerHTML = rows.map((row, index) => `<div class="product-trend-row"><span class="product-trend-index">0${index + 1}</span><span class="product-trend-copy"><strong>${escapeHtml(row.productName)}</strong><small>${Number(row.units || 0).toLocaleString('en-BD')} units</small></span><span class="product-trend-value"><b>৳${Number(row.revenue || 0).toLocaleString('en-BD')}</b><i><em style="width:${Math.min(100, Number(row.revenue || 0) / max * 100)}%"></em></i></span></div>`).join(''); }
function renderOverviewSearchResults(rows) { const node = $('#overview-search-results'); if (!node) return; if (!rows?.length) { node.innerHTML = '<p class="muted">No matching invoice or client found.</p>'; return; } node.innerHTML = rows.map((row) => `<button class="search-result-row" type="button" data-search-order="${escapeHtml(row.orderCode)}"><span><strong>${escapeHtml(row.invoiceNumber || row.orderCode)}</strong><small>${escapeHtml(row.name || '')} · ${escapeHtml(row.phone || row.email || '')}</small></span><b>${money(row.total)}</b><em>${escapeHtml(row.status || '')}</em></button>`).join(''); }
function bindOverviewSearch() { const form = $('#overview-search-form'); if (!form || form.dataset.bound) return; form.dataset.bound = 'true'; form.addEventListener('submit', async (event) => { event.preventDefault(); const query = $('#overview-search-input')?.value.trim(); if (!query) return; const node = $('#overview-search-results'); if (node) node.innerHTML = '<p class="muted">Searching verified orders…</p>'; try { const result = await api(`/admin/overview-search?q=${encodeURIComponent(query)}`); renderOverviewSearchResults(result.results || []); } catch (error) { if (node) node.innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`; } }); }
function renderFinanceCourier(insights) { const financeNode = $('#overview-finance-cards'); const courierNode = $('#overview-courier-chart'); const finance = insights?.finance || {}; if (financeNode) financeNode.innerHTML = [['Product revenue', finance.productRevenue, 'Price collected from products'], ['Product cost', finance.productCost, 'Cost basis from product records'], ['Delivery charges', finance.deliveryCharges, 'Courier/delivery charge collected']].map(([label, value, note]) => `<article class="finance-composition-card"><span class="metric-label">${label}</span><strong>${money(value)}</strong><small>${note}</small></article>`).join(''); const rows = insights?.courier || []; if (!courierNode) return; if (!rows.length) { courierNode.innerHTML = '<div class="insight-empty compact"><strong>No courier mapping yet</strong><span>Provider and zone details will appear when orders include them.</span></div>'; return; } const max = Math.max(...rows.map((row) => Number(row.orders || 0)), 1); courierNode.innerHTML = rows.map((row) => `<div class="courier-chart-row"><div class="courier-chart-label"><strong>${escapeHtml(row.courierProvider)}</strong><small>${escapeHtml(row.deliveryZone)} · ${Number(row.orders || 0).toLocaleString('en-BD')} orders · ${money(row.deliveryCharges)}</small></div><div class="courier-chart-track"><i style="width:${Math.min(100, Number(row.orders || 0) / max * 100)}%"></i></div></div>`).join(''); }
function renderOverviewInsights(data, insights) { renderOverviewAlerts(data, insights); renderOverviewTrend(insights); renderDistrictInsights(insights); renderProductTrend(data); renderClientList($('#return-client-list'), insights?.returnClients || [], 'returns'); renderClientList($('#cancel-client-list'), insights?.cancelClients || [], 'cancel'); renderFinanceCourier(insights); bindOverviewSearch(); }
async function loadOverview() { try { const data = await api(`/admin/overview?days=${state.days}`); const s = data.stock || {}; $('#metric-grid').innerHTML = [['Revenue', money(data.revenue?.revenue)], ['Gross profit', money(data.grossProfit)], ['Orders', Number(data.revenue?.orders || 0).toLocaleString('en-BD')], ['Avg order value', money(data.revenue?.orders ? data.revenue.revenue / data.revenue.orders : 0)], ['Stock on hand', Number(s.units || 0).toLocaleString('en-BD')], ['Stock at cost', money(s.costValue)], ['Unrealised profit', money((s.retailValue || 0) - (s.costValue || 0))], ['Needs restocking', Number(s.needsRestock || 0).toLocaleString('en-BD')]].map(([label, value]) => `<article class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>`).join(''); const max = Math.max(...(data.pipeline || []).map((item) => Number(item.orders)), 1); $('#pipeline').innerHTML = (data.pipeline || []).length ? data.pipeline.map((item) => `<div class="pipeline-row"><span>${escapeHtml(item.status)}</span><div class="bar"><i style="width:${Math.round(Number(item.orders) / max * 100)}%"></i></div><strong>${item.orders}</strong></div>`).join('') : '<p class="muted">No orders in this period.</p>'; $('#top-products').innerHTML = (data.topProducts || []).length ? data.topProducts.map((item) => `<div class="list-row"><span><strong>${escapeHtml(item.productName)}</strong><small>${item.units} units</small></span><strong>${money(item.revenue)}</strong></div>`).join('') : '<p class="muted">No product sales in this period.</p>'; try { const insights = await api(`/admin/overview-insights?days=${state.days}`); renderOverviewInsights(data, insights); } catch { renderOverviewInsights(data, null); } } catch (error) { toast(error.message); } }
async function loadCategories() { try { const data = await api('/admin/categories'); state.categories = data.categories || []; renderCategoryOptions(); renderCategoryTable(); } catch (error) { toast(error.message); } }
function renderCategoryOptions() { const productSelect = $('#product-category'); const marketingSelect = $('#marketing-category-select'); if (productSelect) { const selected = productSelect.value; productSelect.innerHTML = '<option value="">Uncategorized</option>' + state.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}${Number(category.active) ? '' : ' (Archived)'}</option>`).join(''); if (selected) productSelect.value = selected; } if (marketingSelect) { const selected = marketingSelect.value; marketingSelect.innerHTML = '<option value="">All categories</option>' + state.categories.filter((category) => Number(category.active)).map((category) => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`).join(''); if (selected) marketingSelect.value = selected; } }
function renderCategoryTable() { const node = $('#categories-table'); if (!node) return; const categories = state.categories || []; $('#category-count').textContent = String(categories.length); node.innerHTML = categories.map((category) => `<tr><td><strong>${escapeHtml(category.name)}</strong><small>${category.imageUrl ? 'Image linked' : 'No image'}</small></td><td><code>${escapeHtml(category.slug)}</code></td><td>${Number(category.productCount || 0).toLocaleString('en-BD')}</td><td><span class="status-pill ${Number(category.active) ? 'active' : 'archived'}">${Number(category.active) ? 'Active' : 'Archived'}</span></td><td><button class="icon-action" data-edit-category="${category.id}">Edit</button> <button class="icon-action" data-toggle-category="${category.id}" data-category-active="${Number(category.active) ? '0' : '1'}">${Number(category.active) ? 'Archive' : 'Restore'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No categories yet. Create the first category to organise products.</td></tr>'; }
function resetCategoryForm() { const form = $('#category-form'); if (!form) return; form.reset(); delete form.dataset.id; form.elements.namedItem('active').checked = true; $('#category-heading').textContent = 'Create a category'; $('#category-submit').innerHTML = 'Create category <span>→</span>'; $('#category-form-message').textContent = ''; }
function openCategoryEditor(category) { const form = $('#category-form'); if (!form) return; form.reset(); form.dataset.id = category?.id || ''; $('#category-heading').textContent = category ? 'Edit category' : 'Create a category'; $('#category-submit').innerHTML = category ? 'Save changes <span>→</span>' : 'Create category <span>→</span>'; $('#category-form-message').textContent = ''; if (category) { for (const [key, value] of Object.entries({ name: category.name, slug: category.slug, imageUrl: category.imageUrl, sortOrder: category.sortOrder })) { const field = form.elements.namedItem(key); if (field) field.value = value ?? ''; } form.elements.namedItem('active').checked = Boolean(Number(category.active)); } else { form.elements.namedItem('active').checked = true; } form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function saveCategory(event) { event.preventDefault(); const form = event.target; const values = Object.fromEntries(new FormData(form).entries()); values.sortOrder = Number(values.sortOrder || 0); values.active = form.elements.namedItem('active').checked; const id = form.dataset.id; try { if (id) await api(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(values) }); else await api('/admin/categories', { method: 'POST', body: JSON.stringify(values) }); $('#category-form-message').textContent = id ? 'Category updated successfully.' : 'Category created successfully.'; toast(id ? 'Category updated' : 'Category created'); await loadCategories(); if (!id) resetCategoryForm(); } catch (error) { $('#category-form-message').textContent = error.message; } }
async function toggleCategory(id, active) { try { await api(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }); toast(active ? 'Category restored' : 'Category archived'); await loadCategories(); } catch (error) { toast(error.message); } }
function renderBarcodeProductOptions() { const select = $('#barcode-product-sku'); if (!select) return; const selected = select.value; select.innerHTML = '<option value="">Choose a product</option>' + state.products.filter((product) => product.sku).map((product) => `<option value="${escapeHtml(product.sku)}">${escapeHtml(product.name)} · ${escapeHtml(product.sku)}</option>`).join(''); if (selected) select.value = selected; }
function selectedBarcodeProduct() { const sku = $('#barcode-product-sku')?.value || ''; return state.products.find((product) => String(product.sku || '') === String(sku)); }
function renderBarcodePreview() { const product = selectedBarcodeProduct(); const input = $('#product-barcode'); const format = $('#barcode-format')?.value || 'CODE128'; const preview = $('#barcode-preview'); const download = $('#barcode-download-svg'); const offline = $('#barcode-add-offline'); const title = $('#barcode-preview-title'); const formatChip = $('#barcode-preview-format'); if (!input || !preview) return; const barcode = String(input.value || '').trim(); if (title) title.textContent = product ? product.name : 'No product selected'; if (formatChip) formatChip.textContent = format; state.barcodePreview = product && barcode ? { productId: product.id, productName: product.name, sku: product.sku, barcode, format } : null; if (!product || !barcode) { preview.innerHTML = '<p class="muted">Select a product and enter or generate a barcode to preview it here.</p>'; if (download) download.disabled = true; if (offline) offline.disabled = true; return; } preview.innerHTML = '<svg id="barcode-preview-svg" role="img" aria-label="Product barcode preview"></svg>'; try { if (!window.JsBarcode) throw new Error('Barcode preview library is still loading.'); window.JsBarcode('#barcode-preview-svg', barcode, { format, displayValue: true, height: 64, width: 2, margin: 12, fontSize: 14 }); if (download) download.disabled = false; if (offline) offline.disabled = false; } catch (error) { preview.innerHTML = `<p class="form-message">${escapeHtml(error.message || 'This barcode value is not valid for the selected format.')}</p>`; if (download) download.disabled = true; if (offline) offline.disabled = true; } }
function persistOfflineLabels() { localStorage.setItem('rinova-offline-barcode-labels', JSON.stringify(state.offlineLabels)); }
function renderOfflineLabels() { const node = $('#offline-label-list'); const count = $('#offline-label-count'); if (!node || !count) return; const labels = state.offlineLabels || []; count.textContent = `${labels.reduce((sum, item) => sum + Number(item.quantity || 1), 0)} labels`; node.innerHTML = labels.length ? labels.map((item) => `<div class="offline-label-row"><div><strong>${escapeHtml(item.productName || 'Product')}</strong><small>SKU: ${escapeHtml(item.sku || '—')} · ${escapeHtml(item.format || 'CODE128')} · ${escapeHtml(item.barcode || '')}</small></div><div class="offline-label-row-actions"><input type="number" min="1" value="${Math.max(1, Number(item.quantity || 1))}" data-offline-quantity="${escapeHtml(item.key)}" aria-label="Quantity for ${escapeHtml(item.productName || 'label')}" /><button class="icon-action" type="button" data-offline-remove="${escapeHtml(item.key)}">Remove</button></div></div>`).join('') : '<p class="muted">No offline labels queued yet.</p>'; }
function addOfflineLabel() { const preview = state.barcodePreview; if (!preview) return; const key = `${preview.sku}:${preview.barcode}:${preview.format}`; const existing = state.offlineLabels.find((item) => item.key === key); if (existing) existing.quantity = Number(existing.quantity || 1) + 1; else state.offlineLabels.push({ ...preview, key, quantity: 1, createdAt: new Date().toISOString() }); persistOfflineLabels(); renderOfflineLabels(); toast('Added to offline queue'); }
function removeOfflineLabel(key) { state.offlineLabels = state.offlineLabels.filter((item) => item.key !== key); persistOfflineLabels(); renderOfflineLabels(); }
function updateOfflineQuantity(key, value) { const item = state.offlineLabels.find((entry) => entry.key === key); if (!item) return; item.quantity = Math.max(1, Number(value) || 1); persistOfflineLabels(); renderOfflineLabels(); }
function downloadBlob(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function downloadOfflineLabels(format) { if (!state.offlineLabels.length) return toast('Offline queue is empty'); if (format === 'json') return downloadBlob(JSON.stringify(state.offlineLabels, null, 2), `rinova-offline-labels-${new Date().toISOString().slice(0, 10)}.json`, 'application/json'); const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`; const rows = [['Product', 'SKU', 'Barcode', 'Format', 'Quantity', 'Created at'], ...state.offlineLabels.map((item) => [item.productName, item.sku, item.barcode, item.format, item.quantity, item.createdAt])]; downloadBlob(rows.map((row) => row.map(csvEscape).join(',')).join('\n'), `rinova-offline-labels-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8'); }
function printOfflineLabels() { if (!state.offlineLabels.length) return toast('Offline queue is empty'); const popup = window.open('', '_blank', 'width=800,height=900'); if (!popup) return toast('Allow pop-ups to print offline labels.'); const labels = state.offlineLabels.flatMap((item) => Array.from({ length: Math.max(1, Number(item.quantity || 1)) }, () => `<article class="label"><strong>${escapeHtml(item.productName || 'Product')}</strong><small>${escapeHtml(item.sku || '')}</small><svg data-barcode="${escapeHtml(item.barcode || '')}" data-format="${escapeHtml(item.format || 'CODE128')}"></svg><code>${escapeHtml(item.barcode || '')}</code></article>`)).join(''); popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Rinova offline labels</title><style>body{font:12px Arial;color:#2b1724;padding:20px}.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.label{min-height:120px;border:1px dashed #b9a1aa;padding:10px;text-align:center;display:grid;place-items:center;gap:4px}.label strong{font-size:12px}.label small,.label code{display:block;color:#6f5a66;font-size:9px}.label svg{width:180px;height:56px}@media print{body{padding:0}.label{break-inside:avoid}}</style></head><body><div class="sheet">${labels}</div><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\\/script><script>window.addEventListener('load',()=>{document.querySelectorAll('svg[data-barcode]').forEach((svg)=>{try{JsBarcode(svg,svg.dataset.barcode,{format:svg.dataset.format||'CODE128',displayValue:false,height:46,width:1.4,margin:2});}catch(e){}});window.print();});<\\/script></body></html>`); popup.document.close(); }
async function saveBarcodeToProduct() { const product = selectedBarcodeProduct(); const value = String($('#product-barcode')?.value || '').trim(); if (!product || !value) return toast('Select a product and provide a barcode first.'); const message = $('#barcode-form-message'); try { await api(`/admin/products/sku/${encodeURIComponent(product.sku)}`, { method: 'PATCH', body: JSON.stringify({ barcode: value }) }); product.barcode = value; message.textContent = 'Barcode saved to the product.'; toast('Product barcode saved'); renderBarcodePreview(); } catch (error) { message.textContent = error.message; } }
function loadBarcodeGenerator() { renderBarcodeProductOptions(); renderOfflineLabels(); const product = selectedBarcodeProduct(); if (product && $('#product-barcode') && !$('#product-barcode').value) $('#product-barcode').value = product.barcode || ''; renderBarcodePreview(); }
async function queryInvoiceByNumber(event) { event.preventDefault(); const invoiceNumber = String($('#invoice-query')?.value || '').trim().toUpperCase(); const message = $('#invoice-query-message'); const result = $('#invoice-query-result'); if (!invoiceNumber) return; message.textContent = 'Looking up invoice…'; result.innerHTML = '<p class="muted">Loading client and order items…</p>'; try { const data = await api(`/admin/invoices/${encodeURIComponent(invoiceNumber)}`); const invoice = data.invoice || {}; const items = data.items || []; const address = [invoice.address, invoice.upazila, invoice.district].filter(Boolean).join(', '); result.innerHTML = `<div class="invoice-query-card"><div class="invoice-query-customer"><div><p class="eyebrow">CLIENT</p><h4>${escapeHtml(invoice.name || 'Unnamed client')}</h4><p>${escapeHtml(invoice.phone || '')}${invoice.email ? ` · ${escapeHtml(invoice.email)}` : ''}</p><p class="muted">${escapeHtml(address || 'Address not provided')}</p></div><div class="invoice-query-meta"><strong>${escapeHtml(invoice.invoiceNumber || invoiceNumber)}</strong><small>Order ${escapeHtml(invoice.orderCode || '')}</small><small>${escapeHtml(invoice.status || '')} · ${escapeHtml(invoice.createdAt || '')}</small></div></div><div class="invoice-query-summary"><strong>Order summary</strong>${items.length ? items.map((item) => `<div class="invoice-query-item"><span>${escapeHtml(item.productName || 'Product')}<small>SKU: ${escapeHtml(item.sku || 'Unavailable')}</small></span><strong>${Number(item.quantity || 0)} × ${money(item.unitPrice)}</strong></div>`).join('') : '<p class="muted">No order items found.</p>'}<div class="invoice-query-total"><span>Total</span><strong>${money(invoice.total)}</strong></div></div><a class="button button-dark" target="_blank" rel="noopener" href="/invoice.html?invoice=${encodeURIComponent(invoice.invoiceNumber || invoiceNumber)}">Open printable invoice ↗</a></div>`; message.textContent = `Invoice ${invoice.invoiceNumber || invoiceNumber} found.`; } catch (error) { message.textContent = error.message; result.innerHTML = '<p class="muted">No invoice result.</p>'; } }
async function loadProducts() { try { const data = await api(`/admin/products?q=${encodeURIComponent($('#product-search')?.value || '')}&status=${encodeURIComponent($('#product-status')?.value || '')}`); state.products = data.products || []; renderProducts(); renderBarcodeProductOptions(); if (!state.editRouteHandled) { const editSku = new URLSearchParams(window.location.search).get('editSku') || ''; const product = state.products.find((item) => String(item.sku) === editSku); if (editSku && product) { state.editRouteHandled = true; openProductEditor(product); } } } catch (error) { toast(error.message); } }
function margin(product) { return Number(product.price) ? Math.round((Number(product.price) - Number(product.costPrice || 0)) / Number(product.price) * 100) : 0; }
function renderProducts() { const rows = state.products.map((product) => { const actions = state.adminMode === 'edit' ? `<button class="icon-action" data-edit-sku="${escapeHtml(product.sku)}">Edit</button> <button class="icon-action" data-stock-sku="${escapeHtml(product.sku)}" data-stock-name="${escapeHtml(product.name)}">Stock</button> <a class="icon-action" href="/products/${encodeURIComponent(product.slug || product.id)}?admin_preview=1">View live</a>` : `<a class="icon-action" href="/products/${encodeURIComponent(product.slug || product.id)}?admin_preview=1">View live</a> <button class="icon-action" data-quick-edit-sku="${escapeHtml(product.sku)}">Quick edit</button>`; return `<tr><td><a class="admin-product-link" href="/products/${encodeURIComponent(product.slug || product.id)}?admin_preview=1">${escapeHtml(product.name)}</a><small>${escapeHtml(product.categoryName || 'Uncategorised')}</small></td><td>${escapeHtml(product.sku)}</td><td>${money(product.price)}</td><td>${money(product.costPrice)}</td><td>${margin(product)}%</td><td><strong>${product.stock}</strong><small>threshold ${product.lowStockThreshold}</small></td><td><span class="status-pill ${escapeHtml(product.status)}">${escapeHtml(product.status)}</span></td><td>${actions}</td></tr>`; }).join(''); $('#products-table').innerHTML = rows || '<tr><td colspan="8" class="muted">No products found.</td></tr>'; $('#inventory-table').innerHTML = state.products.map((product) => `<tr><td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)}</small></td><td><strong>${product.stock}</strong></td><td>${product.lowStockThreshold}</td><td>${money(product.stock * (product.costPrice || 0))}</td><td>${state.adminMode === 'edit' ? `<button class="icon-action" data-stock-sku="${escapeHtml(product.sku)}" data-stock-name="${escapeHtml(product.name)}">Adjust stock</button>` : '<span class="muted">View only</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No products found.</td></tr>'; }
const ORDER_STATUS_LOOK = {
  pending: { label: 'Pending', tone: 'wait' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  processing: { label: 'Processing', tone: 'work' },
  shipped: { label: 'Shipped', tone: 'ship' },
  delivered: { label: 'Delivered', tone: 'done' },
  returned: { label: 'Returned', tone: 'warn' },
  customer_cancelled: { label: 'Cancelled by customer', tone: 'stop' },
  admin_cancelled: { label: 'Cancelled by shop', tone: 'stop' },
};

/** A colour-coded pill, because a row of identical grey words is unreadable at a glance. */
function orderStatusPill(status) {
  const look = ORDER_STATUS_LOOK[status] || { label: status || 'unknown', tone: 'info' };
  return `<span class="order-pill order-pill-${look.tone}">${escapeHtml(look.label)}</span>`;
}

// Long lists slow the page and bury today's work, so only the newest few show until the
// owner searches or filters. Searching still reaches every order.
const ORDER_PAGE_SIZE = 15;

async function loadOrders() {
  try {
    const query = $('#order-search')?.value || '';
    const status = $('#order-status')?.value || '';
    const data = await api(`/admin/orders?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`);
    const all = data.orders || [];
    state.orders = all;
    const narrowed = Boolean(query.trim() || status);
    const shown = narrowed ? all : all.slice(0, ORDER_PAGE_SIZE);
    const statuses = Object.keys(ORDER_STATUS_LOOK);
    $('#orders-table').innerHTML = shown.map((order) => `<tr><td><button type="button" class="order-invoice-button" data-order-copy="${escapeHtml(order.orderCode)}" title="Show customer details to copy"><strong>${escapeHtml(order.invoiceNumber || order.orderCode)}</strong><span class="order-invoice-hint">tap to copy details</span></button><small>Order ${escapeHtml(order.orderCode)}</small><small>${escapeHtml(order.createdAt)}</small></td><td><strong>${escapeHtml(order.name)}</strong><small>${escapeHtml(order.phone)}</small></td><td>${money(Math.max(0, Number(order.subtotal) - Number(order.discount || 0)) + Number(order.deliveryFee))}${Number(order.discount || 0) ? `<small>after -${money(order.discount)}${order.offerCode ? ` ${escapeHtml(order.offerCode)}` : ''}</small>` : ''}</td><td>${escapeHtml(order.paymentMethod)}<small>${escapeHtml(order.paymentStatus)}</small></td><td>${escapeHtml(order.courierStatus || 'not booked')}</td><td><div class="order-status-cell">${orderStatusPill(order.status)}<select class="order-status-select" data-order-code="${escapeHtml(order.orderCode)}" aria-label="Change status for ${escapeHtml(order.orderCode)}">${statuses.map((value) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${escapeHtml(ORDER_STATUS_LOOK[value].label)}</option>`).join('')}</select></div></td><td>${escapeHtml(order.address || order.district || '')}${order.customerNote ? `<small>Note: ${escapeHtml(order.customerNote)}</small>` : ''}<div class="order-row-actions"><button class="icon-action" type="button" data-order-details="${escapeHtml(order.orderCode)}">Edit / details</button><button class="icon-action" type="button" data-print-order="${escapeHtml(order.orderCode)}">Print invoice</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No orders found.</td></tr>';
    const hint = $('#orders-hint');
    if (hint) {
      hint.textContent = narrowed
        ? `${all.length} order${all.length === 1 ? '' : 's'} match your search.`
        : all.length > ORDER_PAGE_SIZE
          ? `Showing the latest ${ORDER_PAGE_SIZE} orders. Search by order number, invoice, name or phone to find any other.`
          : `${all.length} order${all.length === 1 ? '' : 's'}.`;
    }
  } catch (error) { toast(error.message); } }
function orderAddress(order) { return [order.address, order.upazila, order.district].filter(Boolean).join(', '); }
function productSelectOptions(selectedSku) { return state.catalogue.filter((product) => product.status === 'active' || String(product.sku) === String(selectedSku)).map((product) => `<option value="${escapeHtml(product.sku)}" ${String(product.sku) === String(selectedSku) ? 'selected' : ''}>${escapeHtml(product.name)} · ${escapeHtml(product.sku)} · ${money(product.price)}</option>`).join(''); }
function orderRowUnitPrice(row) {
  const sku = row.querySelector('[data-order-item-sku]')?.value;
  const product = state.catalogue.find((item) => String(item.sku) === String(sku));
  // The catalogue list can be filtered or stale, so fall back to the price stored on the order line.
  if (product) return Number(product.price || 0);
  return Number(row.dataset.unitPrice || 0);
}

function refreshOrderDraftTotals() {
  const form = $('#order-items-form');
  if (!form || !state.selectedOrder?.order) return;
  const subtotal = [...form.querySelectorAll('[data-order-item-row]')].reduce((sum, row) => {
    const quantity = Math.max(0, Number(row.querySelector('[data-order-item-quantity]')?.value || 0));
    return sum + orderRowUnitPrice(row) * quantity;
  }, 0);
  const delivery = Number(state.selectedOrder.order.deliveryFee || 0);
  if ($('#order-detail-subtotal')) $('#order-detail-subtotal').textContent = money(subtotal);
  if ($('#order-detail-total')) $('#order-detail-total').textContent = money(subtotal + delivery);
}

function paymentSummaryMarkup(order) {
  const method = String(order.paymentMethod || 'cod').toLowerCase();
  const advance = method !== 'cod';
  const label = method === 'cod' ? 'Cash on delivery · ক্যাশ অন ডেলিভারি' : method === 'bkash' ? 'bKash advance (Send Money) · বিকাশ অ্যাডভান্স' : method;
  const trx = escapeHtml(order.trxId || '');
  return `<div class="order-detail-card order-payment-card"><h4>Payment</h4><div class="order-payment-rows"><div><small>Method</small><strong>${escapeHtml(label)}</strong></div><div><small>Status</small><strong class="status-pill ${escapeHtml(order.paymentStatus || 'pending')}">${escapeHtml(order.paymentStatus || 'pending')}</strong></div><div><small>Transaction ID</small><strong>${trx || '—'}</strong></div></div>${advance ? `<p class="muted">Advance payments are manual bKash Send Money transfers. Check this transaction ID in your bKash statement before shipping.</p>${trx ? `<button class="button" type="button" data-copy-value="${trx}">Copy transaction ID</button>` : '<p class="order-detail-message">No transaction ID was submitted with this order.</p>'}` : '<p class="muted">Collect the full amount from the customer at delivery.</p>'}</div>`;
}

function renderOrderDetails(data) {
  const order = data.order || {};
  const items = data.items || [];
  const panel = $('#order-detail-content');
  if (!panel) return;
  const copyText = [order.name, order.phone, `${order.address || ''}, ${order.upazila || ''}, ${order.district || ''}`].map((line) => String(line || '').trim()).filter(Boolean).join('\n');
  const orderCode = escapeHtml(order.orderCode || '');
  panel.innerHTML = `<div class="order-detail-header"><div><p class="eyebrow">ORDER DETAILS</p><h3>${orderCode} · ${money(order.total)}</h3><p class="muted">${escapeHtml(order.invoiceNumber || '')} · ${escapeHtml(order.createdAt || '')}</p></div><button class="icon-action" type="button" data-close-order-details>Close</button></div>`
    + `<div class="order-detail-layout">`
    + `<div class="order-detail-card"><h4>Edit customer information</h4><p class="muted">Fix typos in the name, phone or address. Changing the district re-prices the delivery charge.</p><form id="order-customer-form" class="order-detail-form" data-order-code="${orderCode}"><label>Name<input name="name" value="${escapeHtml(order.name || '')}" required></label><label>Phone<input name="phone" value="${escapeHtml(order.phone || '')}" inputmode="tel" required></label><label>Email<input name="email" value="${escapeHtml(order.email || '')}" type="email"></label><label>District<input name="district" value="${escapeHtml(order.district || '')}" required></label><label>Upazila<input name="upazila" value="${escapeHtml(order.upazila || '')}" required></label><label>Shipping address<textarea name="address" required>${escapeHtml(order.address || '')}</textarea></label><div class="order-detail-actions"><button class="button button-dark" type="submit">Save customer details</button><span id="order-customer-message" class="order-detail-message"></span></div></form></div>`
    + `<div class="order-detail-side">`
    + `<div class="order-detail-card"><h4>Courier copy block</h4><p class="muted">Copy the customer’s formatted phone and shipping address for ${escapeHtml(deliveryPartnerName())} entry.</p><div id="order-copy-text" class="order-copy-block">${escapeHtml(copyText)}</div><button class="button" type="button" data-copy-customer="${orderCode}">Copy to Clipboard</button></div>`
    + paymentSummaryMarkup(order)
    + `</div></div>`
    + `<div class="order-detail-card order-items-card"><div class="panel-heading"><div><h4>Modify order items</h4><p class="muted">Change quantities or add products. Subtotal and total recalculate automatically after saving.</p></div></div><form id="order-items-form" class="order-detail-form" data-order-code="${orderCode}"><div id="order-item-editor" class="order-item-editor">${items.map((item) => `<div class="order-item-editor-row" data-order-item-row data-unit-price="${Number(item.unitPrice || 0)}"><label>Product<select data-order-item-sku>${productSelectOptions(item.sku)}</select></label><label>Qty<input data-order-item-quantity type="number" min="1" step="1" value="${Number(item.quantity || 1)}"></label><input type="hidden" data-order-item-details value="${escapeHtml(item.productName || '')}"><button class="icon-action" type="button" data-remove-order-item>Remove</button></div>`).join('')}</div><div class="order-detail-actions"><button class="button" type="button" data-add-order-item>Add product</button><button class="button button-dark" type="submit">Save items &amp; recalculate</button><span id="order-items-message" class="order-detail-message"></span></div><div class="summary-line"><span>Subtotal</span><strong id="order-detail-subtotal">${money(order.subtotal)}</strong></div><div class="summary-line"><span>Shipping · ${escapeHtml(deliveryPartnerName())}${order.deliveryZone ? ` (${escapeHtml(order.deliveryZone)})` : ''}</span><strong id="order-detail-delivery">${money(order.deliveryFee)}</strong></div><div class="summary-line total"><span>Total order amount</span><strong id="order-detail-total">${money(order.total)}</strong></div></form></div>`;
  refreshOrderDraftTotals();
}

async function loadOrderDetails(orderCode) { try { if (!state.catalogue.length) { const products = await api('/admin/products?status=active'); state.catalogue = products.products || []; } const data = await api(`/admin/orders/${encodeURIComponent(orderCode)}`); state.selectedOrder = data; renderOrderDetails(data); $('#order-detail-panel')?.classList.remove('hidden'); $('#order-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (error) { toast(error.message); } }
async function saveOrderCustomer(form) { const message = $('#order-customer-message'); try { const values = Object.fromEntries(new FormData(form).entries()); await api(`/admin/orders/${encodeURIComponent(form.dataset.orderCode)}`, { method: 'PATCH', body: JSON.stringify(values) }); if (message) message.textContent = 'Customer details saved.'; toast('Customer information updated'); await loadOrderDetails(form.dataset.orderCode); await loadOrders(); } catch (error) { if (message) message.textContent = error.message; } }
async function saveOrderItems(form) { const message = $('#order-items-message'); const items = [...form.querySelectorAll('[data-order-item-row]')].map((row) => ({ sku: row.querySelector('[data-order-item-sku]')?.value, quantity: Number(row.querySelector('[data-order-item-quantity]')?.value || 0), details: row.querySelector('[data-order-item-details]')?.value || '' })).filter((item) => item.sku && item.quantity > 0); try { const data = await api(`/admin/orders/${encodeURIComponent(form.dataset.orderCode)}`, { method: 'PATCH', body: JSON.stringify({ items }) }); if (message) message.textContent = `Saved. New total: ${money(data.total)}`; toast('Order items and totals updated'); await loadOrderDetails(form.dataset.orderCode); await loadOrders(); } catch (error) { if (message) message.textContent = error.message; } }
function addOrderItemRow() { const editor = $('#order-item-editor'); if (!editor) return; const row = document.createElement('div'); row.className = 'order-item-editor-row'; row.dataset.orderItemRow = ''; row.innerHTML = `<label>Product<select data-order-item-sku>${productSelectOptions('')}</select></label><label>Qty<input data-order-item-quantity type="number" min="1" step="1" value="1"></label><input type="hidden" data-order-item-details value=""><button class="icon-action" type="button" data-remove-order-item>Remove</button>`; editor.appendChild(row); }

const SETTINGS_GROUPS = [
  { title: 'Store identity', titleBn: 'দোকানের পরিচয়', hint: 'Shown on the storefront, invoices and receipts.', fields: [
    { key: 'store_name', label: 'Store name', labelBn: 'দোকানের নাম' },
    { key: 'tagline', label: 'Tagline', labelBn: 'ট্যাগলাইন' },
    { key: 'support_phone', label: 'Support phone', labelBn: 'সাপোর্ট নাম্বার' },
    { key: 'support_email', label: 'Support email', labelBn: 'সাপোর্ট ইমেইল' },
    { key: 'order_whatsapp_number', label: 'Order WhatsApp number', labelBn: 'হোয়াটসঅ্যাপ নাম্বার' },
    { key: 'site_description', label: 'Site description', labelBn: 'সাইটের বর্ণনা', wide: true, type: 'textarea' },
    { key: 'site_logo_url', label: 'Logo URL', labelBn: 'লোগো লিংক' },
    { key: 'favicon_url', label: 'Favicon URL', labelBn: 'ফেভিকন লিংক' },
  ] },
  { title: 'Delivery & courier', titleBn: 'ডেলিভারি ও কুরিয়ার', hint: 'Pick the courier that carries every order. Customers see it locked on the checkout page and cannot change it. These charges are applied automatically.', fields: [
    { key: 'delivery_partner', label: 'Delivery partner', labelBn: 'ডেলিভারি পার্টনার', wide: true, type: 'choice', fallback: 'steadfast', options: [
      { value: 'steadfast', label: 'Steadfast' },
      { value: 'pathao', label: 'Pathao' },
      { value: 'redx', label: 'RedX' },
      { value: 'paperfly', label: 'Paperfly' },
      { value: 'sundarban', label: 'Sundarban Courier' },
      { value: 'local', label: 'Local delivery / pickup' },
    ] },
    { key: 'delivery_inside_dhaka', label: 'Inside Dhaka (৳)', labelBn: 'ঢাকার ভিতরে', type: 'number' },
    { key: 'delivery_outside_dhaka', label: 'Outside Dhaka (৳)', labelBn: 'ঢাকার বাইরে', type: 'number' },
    { key: 'delivery_emergency', label: 'Emergency delivery (৳)', labelBn: 'জরুরি ডেলিভারি', type: 'number' },
    { key: 'free_delivery_over', label: 'Free delivery over (৳)', labelBn: 'ফ্রি ডেলিভারি সীমা', type: 'number' },
  ] },
  { title: 'Payment methods', titleBn: 'পেমেন্ট মাধ্যম', hint: 'Only the methods switched on here appear on the checkout page. Advance payment is a manual bKash Send Money transfer confirmed by transaction ID.', fields: [
    { key: 'payment_cod_enabled', label: 'Cash on delivery', labelBn: 'ক্যাশ অন ডেলিভারি', type: 'toggle', fallback: '1' },
    { key: 'payment_bkash_enabled', label: 'bKash advance (Send Money)', labelBn: 'বিকাশ অ্যাডভান্স', type: 'toggle', fallback: '1' },
    { key: 'bkash_number', label: 'bKash Send Money number', labelBn: 'বিকাশ নাম্বার' },
    { key: 'payment_bkash_instructions', label: 'bKash instructions shown at checkout', labelBn: 'চেকআউটে দেখানো নির্দেশনা', wide: true, type: 'textarea', placeholder: 'Send Money to 01XXXXXXXXX, then enter the transaction ID below.' },
    { key: 'nagad_number', label: 'Nagad number (reference only)', labelBn: 'নগদ নাম্বার' },
    { key: 'rocket_number', label: 'Rocket number (reference only)', labelBn: 'রকেট নাম্বার' },
  ] },
  { title: 'Currency & tax', titleBn: 'মুদ্রা ও ট্যাক্স', hint: 'Used for pricing display across the shop.', fields: [
    { key: 'currency_code', label: 'Currency code', labelBn: 'মুদ্রা কোড' },
    { key: 'currency_symbol', label: 'Currency symbol', labelBn: 'মুদ্রা চিহ্ন' },
    { key: 'tax_percentage', label: 'Tax percentage', labelBn: 'ট্যাক্স শতাংশ', type: 'number' },
  ] },
];

function settingsFieldMarkup(field, value) {
  const label = `<span class="setting-label">${escapeHtml(field.label)}<small>${escapeHtml(field.labelBn || '')}</small></span>`;
  const name = escapeHtml(field.key);
  if (field.type === 'toggle') {
    // A select (not a checkbox) so an "off" choice is always submitted with the form.
    const raw = String(value ?? '').toLowerCase();
    const on = raw === '' ? field.fallback !== '0' : !['0', 'false', 'off', 'no'].includes(raw);
    return `<label class="setting-field setting-toggle">${label}<select name="${name}"><option value="1" ${on ? 'selected' : ''}>Active · চালু</option><option value="0" ${on ? '' : 'selected'}>Hidden · বন্ধ</option></select></label>`;
  }
  if (field.type === 'choice') {
    const current = String(value || field.fallback || '').toLowerCase();
    return `<label class="setting-field${field.wide ? ' wide' : ''}">${label}<select name="${name}">${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === current ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
  }
  if (field.type === 'textarea') return `<label class="setting-field wide">${label}<textarea name="${name}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(value)}</textarea></label>`;
  return `<label class="setting-field${field.wide ? ' wide' : ''}">${label}<input name="${name}" type="${field.type === 'number' ? 'number' : 'text'}" ${field.type === 'number' ? 'min="0" step="1"' : ''} value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}" /></label>`;
}

// ---------------------------------------------------------------------------
// Team & support: staff dashboard logins, customer sign-in help, and the two
// Google Sheets the shop writes to.
// ---------------------------------------------------------------------------
// The same list the Worker validates against. It is kept here as well so the dropdown is
// never empty: it used to be filled only from the staff API, so any failure of that one
// call left the question blank and every "Create staff login" was rejected by the server.
const DEFAULT_SECURITY_QUESTIONS = ["Mother's name", 'Village or home town', 'First school name', 'Favourite colour', 'Pet name'];
const teamState = { role: 'owner', questions: DEFAULT_SECURITY_QUESTIONS.slice(), customers: [] };

function renderSecurityQuestions() {
  const select = $('#staff-security-question');
  if (!select) return;
  const questions = teamState.questions.length ? teamState.questions : DEFAULT_SECURITY_QUESTIONS;
  const chosen = select.value;
  select.innerHTML = questions.map((question) => `<option value="${escapeHtml(question)}">${escapeHtml(question)}</option>`).join('');
  if (chosen && questions.includes(chosen)) select.value = chosen;
}

async function loadTeamView() {
  await Promise.all([loadStaff(), loadSheets()]);
  renderCustomerList();
}

function setTeamRole(role, ownerUsername) {
  teamState.role = role;
  const chip = $('#team-role-chip');
  const panel = $('#staff-panel');
  if (chip) {
    chip.textContent = role === 'owner' ? 'Owner access' : 'Staff access';
    chip.className = `privacy-chip ${role === 'owner' ? 'integration-ready' : ''}`;
  }
  // Staff can use customer support, but only the owner sees the login manager.
  if (panel) panel.hidden = role !== 'owner';
  if (ownerUsername) panel?.setAttribute('data-owner', ownerUsername);
}

async function loadStaff() {
  const list = $('#staff-list');
  try {
    const data = await api('/admin/staff');
    setTeamRole('owner', data.ownerUsername);
    if (Array.isArray(data.securityQuestions) && data.securityQuestions.length) teamState.questions = data.securityQuestions;
    renderSecurityQuestions();
    const staff = data.staff || [];
    if (!list) return;
    list.innerHTML = staff.length ? staff.map((member) => `<article class="staff-row"><div class="staff-row-main"><div class="staff-row-title"><strong>${escapeHtml(member.username)}</strong><span class="status-pill ${Number(member.active) ? 'active' : 'archived'}">${Number(member.active) ? 'Active' : 'Disabled'}</span><span class="status-pill">${escapeHtml(member.role)}</span></div><small>${escapeHtml(member.displayName || 'No name set')} · security question: ${escapeHtml(member.securityQuestion)}</small><small>Created ${escapeHtml(String(member.createdAt || '').slice(0, 10))}${member.lastLoginAt ? ` · last signed in ${escapeHtml(String(member.lastLoginAt).slice(0, 10))}` : ' · never signed in'}</small></div><div class="staff-row-actions"><button class="icon-action" type="button" data-staff-password="${member.id}" data-username="${escapeHtml(member.username)}">New password</button><button class="icon-action" type="button" data-staff-toggle="${member.id}" data-active="${Number(member.active) ? '0' : '1'}">${Number(member.active) ? 'Disable' : 'Enable'}</button><button class="icon-action" type="button" data-staff-delete="${member.id}" data-username="${escapeHtml(member.username)}">Remove</button></div></article>`).join('') : '<p class="muted">No staff logins yet. Only your owner account can sign in.</p>';

    list.querySelectorAll('[data-staff-password]').forEach((button) => button.addEventListener('click', async () => {
      const password = window.prompt(`New password for ${button.dataset.username} (at least 8 characters):`);
      if (password === null) return;
      try { await api(`/admin/staff/${button.dataset.staffPassword}`, { method: 'PATCH', body: JSON.stringify({ password }) }); toast('Password changed. Give it to the staff member.'); loadStaff(); }
      catch (error) { $('#staff-message').textContent = error.message; }
    }));
    list.querySelectorAll('[data-staff-toggle]').forEach((button) => button.addEventListener('click', async () => {
      try { await api(`/admin/staff/${button.dataset.staffToggle}`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active === '1' }) }); loadStaff(); }
      catch (error) { $('#staff-message').textContent = error.message; }
    }));
    list.querySelectorAll('[data-staff-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!window.confirm(`Remove the login "${button.dataset.username}"? They will be signed out immediately.`)) return;
      try { await api(`/admin/staff/${button.dataset.staffDelete}`, { method: 'DELETE' }); toast('Staff login removed'); loadStaff(); }
      catch (error) { $('#staff-message').textContent = error.message; }
    }));
  } catch (error) {
    // A staff member gets a 403 here; that is expected, not an error to shout about.
    if (/only the shop owner/i.test(error.message)) { setTeamRole('staff'); if (list) list.innerHTML = ''; return; }
    // Anything else is a real fault. The dropdown still has its built-in questions, so the
    // form stays usable, but say plainly next to the button that the list could not load.
    renderSecurityQuestions();
    if (list) list.innerHTML = `<p class="form-message">Could not load the staff list: ${escapeHtml(error.message)}</p>`;
    const message = $('#staff-message');
    if (message) message.textContent = `Staff list unavailable (${error.message}). You can still try creating a login.`;
  }
}

async function createStaff(event) {
  event.preventDefault();
  const form = event.target;
  const message = $('#staff-message');
  const values = Object.fromEntries(new FormData(form).entries());
  // Check here what the Worker checks, so a rejection reads as plain advice rather than
  // arriving as a bare 400 the owner has to interpret.
  values.username = String(values.username || '').trim().toLowerCase();
  if (!values.securityQuestion) { renderSecurityQuestions(); values.securityQuestion = $('#staff-security-question')?.value || ''; }
  if (!/^[a-z0-9._-]{3,32}$/.test(values.username)) { message.textContent = 'Username must be 3-32 characters, using only letters, numbers, dot, dash or underscore — no spaces.'; return; }
  if (String(values.password || '').length < 8) { message.textContent = 'Password must be at least 8 characters.'; return; }
  if (!values.securityQuestion) { message.textContent = 'Choose a security question.'; return; }
  if (String(values.securityAnswer || '').trim().length < 2) { message.textContent = 'Write the answer to the security question.'; return; }
  message.textContent = 'Creating…';
  try {
    await api('/admin/staff', { method: 'POST', body: JSON.stringify(values) });
    message.textContent = `Login created for ${values.username}. Write the password down now — it cannot be shown again.`;
    toast('Staff login created');
    form.reset();
    loadStaff();
  } catch (error) {
    message.textContent = error.message;
  }
}

let customerSearchTimer;
function debounceCustomerSearch() {
  clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(searchCustomers, 300);
}

async function searchCustomers() {
  const query = $('#customer-search')?.value || '';
  try {
    const data = await api(`/admin/customers?q=${encodeURIComponent(query)}`);
    teamState.customers = data.customers || [];
  } catch (error) {
    teamState.customers = [];
    $('#customer-list').innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`;
    return;
  }
  renderCustomerList();
}

function renderCustomerList() {
  const node = $('#customer-list');
  if (!node) return;
  node.innerHTML = teamState.customers.length ? teamState.customers.map((customer) => `<article class="customer-row"><div class="customer-row-main"><div class="customer-row-title"><strong>${escapeHtml(customer.name || 'Unnamed')}</strong>${Number(customer.hasAccount) ? '<span class="status-pill active">Has account</span>' : '<span class="status-pill">Guest only</span>'}</div><small>${escapeHtml(customer.phone || '')}${customer.email ? ` · ${escapeHtml(customer.email)}` : ''}</small><small>${escapeHtml([customer.upazila, customer.district].filter(Boolean).join(', ') || 'No address on file')} · ${Number(customer.orderCount || 0)} order${Number(customer.orderCount) === 1 ? '' : 's'}</small></div><div class="customer-row-actions">${Number(customer.hasAccount) ? `<button class="icon-action" type="button" data-customer-reset="${customer.id}" data-name="${escapeHtml(customer.name || '')}">Issue temporary password</button>` : '<span class="muted">No sign-in account</span>'}</div></article>`).join('') : '<p class="muted">No matching customers.</p>';
  node.querySelectorAll('[data-customer-reset]').forEach((button) => button.addEventListener('click', () => resetCustomerPassword(button.dataset.customerReset, button.dataset.name)));
}

async function resetCustomerPassword(id, name) {
  if (!window.confirm(`Give ${name || 'this customer'} a new temporary password? Their current password will stop working immediately.`)) return;
  const result = $('#customer-reset-result');
  try {
    const data = await api(`/admin/customers/${id}/reset-password`, { method: 'POST', body: '{}' });
    if (!result) return;
    result.hidden = false;
    result.innerHTML = `<p class="eyebrow">TEMPORARY PASSWORD · একবারই দেখাবে</p><p class="muted">Read this out to <strong>${escapeHtml(data.customer.name)}</strong> (${escapeHtml(data.customer.phone)}) and ask them to change it after signing in. It will not be shown again.</p><div class="temp-password"><code>${escapeHtml(data.temporaryPassword)}</code><button class="button" type="button" data-copy-value="${escapeHtml(data.temporaryPassword)}">Copy</button></div>`;
    toast('Temporary password issued');
  } catch (error) {
    if (result) { result.hidden = false; result.innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`; }
  }
}

async function loadSheets() {
  const node = $('#sheets-list');
  if (!node) return;
  try {
    const data = await api('/admin/sheets');
    node.innerHTML = (data.sheets || []).map((sheet) => `<article class="sheet-row"><div class="sheet-row-main"><div class="sheet-row-title"><strong>${escapeHtml(sheet.title)}</strong><small>${escapeHtml(sheet.titleBn)}</small><span class="status-pill ${sheet.accessible ? 'active' : sheet.configured ? 'pending' : 'archived'}">${sheet.accessible ? 'Connected' : sheet.configured ? 'Cannot reach' : 'Not set up'}</span></div><p class="muted">${escapeHtml(sheet.description)}</p>${sheet.reason ? `<small class="form-message">${escapeHtml(sheet.reason)}</small>` : ''}<small>Columns: ${escapeHtml((sheet.columns || []).join(', '))}</small></div><div class="sheet-row-actions">${sheet.url ? `<a class="icon-action" href="${escapeHtml(sheet.url)}" target="_blank" rel="noopener">Open sheet ↗</a><button class="icon-action" type="button" data-copy-value="${escapeHtml(sheet.url)}">Copy link</button>` : ''}</div></article>`).join('') || '<p class="muted">No sheets configured.</p>';
  } catch (error) {
    node.innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`;
  }
}

async function loadSettings() {
  try {
    const data = await api('/admin/settings');
    state.settings = data.settings || {};
    const groups = SETTINGS_GROUPS.map((group) => `<section class="settings-group"><div class="settings-group-head"><h4>${escapeHtml(group.title)}<small>${escapeHtml(group.titleBn)}</small></h4><p class="muted">${escapeHtml(group.hint)}</p></div><div class="settings-group-grid">${group.fields.map((field) => settingsFieldMarkup(field, state.settings[field.key] ?? '')).join('')}</div></section>`).join('');
    $('#settings-form').innerHTML = groups + '<div class="setting-actions"><button class="button button-dark" type="submit">Save settings <span>→</span></button><span id="settings-message" class="form-message"></span></div>';
  } catch (error) {
    toast(error.message);
  }
}

function parseProductBadges(value) { let parsed = []; try { parsed = Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch {} return Array.isArray(parsed) ? parsed.map((item) => String(item).toLowerCase()).filter((item) => ['hot', 'stockout', 'out', 'instock', 'new'].includes(item)) : []; }
function openProductEditor(product) { setAdminMode('edit'); const form = $('#product-form'); form.reset(); form.dataset.sku = product?.sku || ''; setEditorMedia(product?.mediaJson || '[]'); setEditorTiers(product?.volumeTiersJson || '[]'); setEditorOptions(product?.specsJson || '[]'); $('#editor-heading').textContent = product ? 'Edit product' : 'Create a product'; $('#product-submit').innerHTML = product ? 'Save changes <span>→</span>' : 'Create product <span>→</span>'; $('#product-form-message').textContent = ''; if ($('#upload-message')) $('#upload-message').textContent = ''; if (product) { for (const [key, value] of Object.entries({ name: product.name, sku: product.sku, brand: product.brand, categoryId: product.categoryId, shortDescription: product.shortDescription, description: product.description, editorNote: product.editorNote, costPrice: product.costPrice, price: product.price, compareAtPrice: product.compareAtPrice, stock: product.stock, lowStockThreshold: product.lowStockThreshold, minOrderQty: product.minOrderQty, weightGrams: product.weightGrams, barcode: product.barcode, imageUrl: product.imageUrl, status: product.status, discountPercent: Number(product.discountPercent || 0), discountLabel: product.discountLabel, discountEndsAt: product.discountEndsAt })) { const field = form.elements.namedItem(key); if (field) field.value = value ?? ''; } form.elements.namedItem('featured').checked = Boolean(product.featured); const badges = parseProductBadges(product.badgesJson || product.badges); form.elements.namedItem('badgeHot').checked = badges.includes('hot'); form.elements.namedItem('badgeStockOut').checked = badges.includes('stockout') || badges.includes('out') || badges.includes('instock'); form.elements.namedItem('badgeNew').checked = badges.includes('new'); } else { form.elements.namedItem('badgeHot').checked = false; form.elements.namedItem('badgeStockOut').checked = false; form.elements.namedItem('badgeNew').checked = false; for (const key of ['discountPercent', 'discountLabel', 'discountEndsAt']) { const field = form.elements.namedItem(key); if (field) field.value = key === 'discountPercent' ? '0' : ''; } } updateImagePreview(); renderProductOptions(); renderOfferPreview(); loadEditorExtras(product?.sku || ''); $('#product-editor').classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function saveProduct(event) { event.preventDefault(); const form = event.target; const data = Object.fromEntries(new FormData(form).entries()); data.featured = form.elements.namedItem('featured').checked; data.badges = ['hot', 'stockout', 'new'].filter((badge) => form.elements.namedItem(`badge${badge === 'hot' ? 'Hot' : badge === 'stockout' ? 'StockOut' : 'New'}`).checked); data.volumeTiers = $('#product-volume-tiers')?.value || '[]'; data.mediaJson = JSON.stringify(editorState.media); data.specs = editorSpecsPayload(); data.variants = editorVariantsPayload(); data.faq = editorState.faq.filter((row) => String(row.question || '').trim() && String(row.answer || '').trim()); for (const key of ['categoryId','costPrice','price','stock','lowStockThreshold','minOrderQty','weightGrams']) data[key] = Number(data[key] || 0); data.discountPercent = Math.max(0, Math.min(99, Math.round(Number(data.discountPercent || 0)))); data.discountLabel = String(data.discountLabel || '').trim(); data.discountEndsAt = String(data.discountEndsAt || '').trim(); data.compareAtPrice = optionalNumber(data.compareAtPrice); const sku = form.dataset.sku; try { if (sku) await api(`/admin/products/sku/${encodeURIComponent(sku)}`, { method: 'PATCH', body: JSON.stringify(data) }); else await api('/admin/products', { method: 'POST', body: JSON.stringify(data) }); $('#product-form-message').textContent = sku ? 'Product updated successfully.' : 'Product created successfully.'; toast(sku ? 'Product updated' : 'Product created'); await loadProducts(); } catch (error) { $('#product-form-message').textContent = error.message; } }
async function adjustStock(sku, name) { const quantity = window.prompt(`Stock change for ${name}. Use a positive or negative number:`); if (quantity === null) return; const reason = window.prompt('Reason: restock, return, damage, adjustment, sale or cancellation', 'adjustment'); if (reason === null) return; try { const data = await api(`/admin/products/sku/${encodeURIComponent(sku)}/stock`, { method: 'POST', body: JSON.stringify({ mode: 'delta', quantity: Number(quantity), reason, note: `Updated from dashboard for ${name}` }) }); toast(`Stock updated to ${data.stock}`); await loadProducts(); } catch (error) { toast(error.message); } }
async function updateOrderStatus(orderCode, status) { try { await api(`/orders/${encodeURIComponent(orderCode)}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason: 'Updated from admin dashboard' }) }); toast(`${orderCode} marked ${status}`); await loadOrders(); } catch (error) { toast(error.message); await loadOrders(); } }
async function loadReturns() { try { const data = await api(`/admin/returns?status=${encodeURIComponent($('#return-status').value || '')}`); $('#returns-table').innerHTML = (data.returns || []).map((item) => `<tr><td><strong>${escapeHtml(item.returnCode)}</strong><small>${escapeHtml(item.createdAt)}</small></td><td>${escapeHtml(item.orderCode)}</td><td>${escapeHtml(item.name)}<small>${escapeHtml(item.phone)}</small></td><td>${escapeHtml(item.reason)}</td><td>${money(item.amount)}</td><td><select class="return-status-select" data-return-id="${item.id}">${['requested','approved','picked_up','received','refunded','rejected','cancelled'].map((status) => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td><td><button class="icon-action" data-print-order="${escapeHtml(item.orderCode)}">Invoice</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No returns found.</td></tr>'; } catch (error) { toast(error.message); } }
async function updateReturn(id, status) { try { await api(`/admin/returns/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); toast('Return updated'); await loadReturns(); } catch (error) { toast(error.message); } }
async function loadReviews() { try { const data = await api(`/admin/reviews?status=${encodeURIComponent($('#review-status')?.value || '')}`); $('#reviews-table').innerHTML = (data.reviews || []).map((review) => `<tr><td><strong>${escapeHtml(review.productName)}</strong><small>Verified purchase</small></td><td>${escapeHtml(review.reviewerName)}</td><td><strong class="review-stars">${'★'.repeat(Number(review.rating || 0))}${'☆'.repeat(5 - Number(review.rating || 0))}</strong><small>${review.rating}/5</small></td><td class="review-cell">${escapeHtml(review.reviewText)}</td><td>${escapeHtml(review.orderCode)}<small>${escapeHtml(review.invoiceNumber || 'No invoice number')}</small></td><td><select class="review-status-select" data-review-id="${review.id}">${['pending','approved','rejected'].map((status) => `<option value="${status}" ${status === review.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td><td><button class="icon-action" data-review-approve="${review.id}">Approve</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No reviews found.</td></tr>'; } catch (error) { toast(error.message); } }
async function updateReview(id, status) { try { await api(`/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); toast(`Review ${status}`); await loadReviews(); } catch (error) { toast(error.message); await loadReviews(); } }
async function loadPosProducts() { try { const data = await api(`/admin/pos/products?q=${encodeURIComponent($('#pos-search').value || '')}`); state.posProducts = data.products || []; $('#pos-products-table').innerHTML = state.posProducts.map((product) => `<tr><td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)}</small></td><td>${escapeHtml(product.barcode || 'No barcode')}</td><td>${money(product.price)}</td><td>${product.stock}</td><td><span class="pos-action-group"><button class="icon-action" data-pos-add="${escapeHtml(product.sku)}">Add sale</button><button class="icon-action" data-label-add="${escapeHtml(product.sku)}">Add label</button></span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No products found.</td></tr>'; renderPosCart(); renderBarcodeLabels(); } catch (error) { toast(error.message); } }
function barcodeValue(product) { return String(product.barcode || product.sku || `RNV-${product.id}`).trim(); }
function renderBarcodeLabels() { const list = $('#barcode-label-list'); const sheet = $('#barcode-print-sheet'); if (!list || !sheet) return; const productUrl = (product) => new URL(`/products/${encodeURIComponent(String(product.slug || product.id))}`, window.location.origin).href; const skuValue = (product) => String(product.sku || product.barcode || `RNV-${product.id}`).trim(); list.innerHTML = state.barcodeLabels.length ? state.barcodeLabels.map((item) => `<div class="barcode-label-row"><div><strong>${escapeHtml(item.product.name)}</strong><small>SKU: ${escapeHtml(skuValue(item.product))} · ${money(item.product.price)}</small></div><label>Qty<input type="number" min="1" max="999" value="${item.quantity}" data-label-quantity="${escapeHtml(item.product.sku)}" /></label><button class="icon-action" data-label-remove="${escapeHtml(item.product.sku)}">Remove</button></div>`).join('') : '<p class="muted">এখনও কোনো label selected হয়নি। POS product list থেকে Add label চাপুন।</p>'; const copies = state.barcodeLabels.flatMap((item) => Array.from({ length: item.quantity }, () => item.product)); sheet.innerHTML = copies.map((product) => `<div class="barcode-label"><strong>${escapeHtml(product.name)}</strong><div class="barcode-pair"><div><small>SKU</small><svg data-barcode="${escapeHtml(skuValue(product))}"></svg><small>${escapeHtml(skuValue(product))}</small></div><div><small>PRODUCT LINK</small><svg data-barcode="${escapeHtml(productUrl(product))}"></svg><small>Scan to open product</small></div></div></div>`).join(''); sheet.setAttribute('aria-hidden', 'true'); if (window.JsBarcode) sheet.querySelectorAll('svg[data-barcode]').forEach((svg) => { try { window.JsBarcode(svg, svg.dataset.barcode, { format: 'CODE128', displayValue: false, height: 34, width: 1.15, margin: 2 }); } catch {} }); }
function addBarcodeLabel(sku) { const product = state.posProducts.find((item) => String(item.sku) === String(sku)) || state.products.find((item) => String(item.sku) === String(sku)); if (!product) return; const existing = state.barcodeLabels.find((item) => String(item.product.sku) === String(sku)); if (existing) existing.quantity = Math.min(999, existing.quantity + 1); else state.barcodeLabels.push({ product, quantity: 1 }); renderBarcodeLabels(); }
function updateBarcodeLabel(sku, quantity) { const item = state.barcodeLabels.find((entry) => String(entry.product.sku) === String(sku)); if (!item) return; item.quantity = Math.max(1, Math.min(999, Number(quantity) || 1)); renderBarcodeLabels(); }
function printBarcodeLabels() { if (!state.barcodeLabels.length) return toast('Add at least one product label first.'); renderBarcodeLabels(); window.print(); }
function renderPosCart() { $('#pos-cart').innerHTML = state.posCart.length ? state.posCart.map((item) => `<div class="list-row"><span><strong>${escapeHtml(item.product.name)}</strong><small>${item.quantity} × ${money(item.product.price)}</small></span><button class="icon-action" data-pos-remove="${escapeHtml(item.product.sku)}">Remove</button></div>`).join('') : '<p class="muted">Scan a barcode or add a product to begin.</p>'; const subtotal = state.posCart.reduce((sum, item) => sum + item.product.price * item.quantity, 0); const discount = Math.max(0, Math.min(subtotal, Number($('#pos-discount').value || 0))); $('#pos-total').textContent = money(subtotal - discount); }
function addPosProduct(sku) { const product = state.posProducts.find((item) => String(item.sku) === String(sku)); if (!product) return; const existing = state.posCart.find((item) => String(item.product.sku) === String(product.sku)); if (existing) { if (existing.quantity < product.stock) existing.quantity += 1; } else state.posCart.push({ product, quantity: 1 }); renderPosCart(); }
function printReceipt(sale) { const popup = window.open('', '_blank', 'width=480,height=700'); if (!popup) return; popup.document.write(`<html><head><title>${sale.receiptNumber}</title><style>body{font:14px Arial;padding:24px}h1{font-size:24px}hr{border:0;border-top:1px solid #999}.line{display:flex;justify-content:space-between;padding:6px 0}</style></head><body><h1>Rinova BD</h1><p>Receipt: ${escapeHtml(sale.receiptNumber)}<br>Payment: ${escapeHtml(sale.paymentMethod)}</p><hr>${state.posCart.map((item) => `<div class="line"><span>${escapeHtml(item.product.name)} × ${item.quantity}</span><strong>${money(item.product.price * item.quantity)}</strong></div>`).join('')}<hr><div class="line"><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div><div class="line"><span>Discount</span><strong>-${money(sale.discount)}</strong></div><div class="line"><strong>Total</strong><strong>${money(sale.total)}</strong></div><script>window.print()<\/script></body></html>`); popup.document.close(); }
async function completePosSale() { if (!state.posCart.length) return toast('Add a product first'); try { const data = await api('/admin/pos/sales', { method: 'POST', body: JSON.stringify({ items: state.posCart.map((item) => ({ sku: item.product.sku, quantity: item.quantity })), paymentMethod: $('#pos-payment').value, discount: Number($('#pos-discount').value || 0) }) }); toast(`Sale ${data.sale.receiptNumber} completed`); printReceipt(data.sale); state.posCart = []; $('#pos-discount').value = 0; renderPosCart(); } catch (error) { toast(error.message); } }
function blogSeoValues(form) { const value = (name) => String(form.elements.namedItem(name)?.value || '').trim(); const checks = [{ label: 'Title is 15–70 characters', pass: value('title').length >= 15 && value('title').length <= 70 }, { label: 'SEO title is 30–65 characters', pass: value('seoTitle').length >= 30 && value('seoTitle').length <= 65 }, { label: 'Meta description is 70–158 characters', pass: value('metaDescription').length >= 70 && value('metaDescription').length <= 158 }, { label: 'A cover image is set', pass: /^(https:\/\/|\/assets\/|\/media\/)/i.test(value('coverImageUrl')) }, { label: 'A summary is written', pass: value('excerpt').length >= 40 }, { label: 'URL slug is short and readable', pass: /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(value('slug')) && value('slug').length >= 3 && value('slug').length <= 70 }, { label: 'Keywords added', pass: value('keywords').split(',').map((item) => item.trim()).filter(Boolean).length >= 2 }, { label: 'Article body has real depth (300+ characters)', pass: value('body').length >= 300 }]; return { checks, score: Math.round(checks.filter((item) => item.pass).length / checks.length * 100), ready: checks.every((item) => item.pass) }; }
function updateCmsSeoReadiness() { const form = $('#cms-post-form'); if (!form) return; const seo = blogSeoValues(form); const score = $('#cms-seo-score'); if (score) { score.textContent = `${seo.score}`; score.classList.toggle('seo-ready', seo.ready); } const checklist = $('#cms-seo-checklist'); if (checklist) checklist.innerHTML = seo.checks.map((item) => `<div class="seo-check ${item.pass ? 'pass' : ''}"><span>${item.pass ? '✓' : '○'}</span>${escapeHtml(item.label)}</div>`).join(''); const seoTitle = String(form.elements.namedItem('seoTitle')?.value || '').trim() || 'Your SEO title'; const description = String(form.elements.namedItem('metaDescription')?.value || '').trim() || 'Your meta description will appear here.'; const slug = String(form.elements.namedItem('slug')?.value || '').trim() || '...'; $('#cms-google-url').textContent = `rinovabd.com/blog/${slug}`; $('#cms-google-title').textContent = seoTitle; $('#cms-google-description').textContent = description; }
function slugifyBlogTitle(value) { return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 70); }
async function loadMediaLibrary() { try { const data = await api('/admin/media-library'); const select = $('#cms-media-library'); if (!select) return; select.innerHTML = '<option value="">Choose an existing image</option>' + (data.media || []).map((item) => `<option value="${escapeHtml(item.url)}">${escapeHtml(item.name)} · ${escapeHtml(item.source)}</option>`).join(''); } catch (error) { toast(error.message); } }
function updateCmsCoverPreview() { const field = $('#cms-post-form')?.elements.namedItem('coverImageUrl'); const preview = $('#cms-cover-preview'); const url = String(field?.value || '').trim(); if (!preview) return; if (!url) { preview.classList.add('hidden'); preview.removeAttribute('src'); return; } preview.src = url; preview.classList.remove('hidden'); preview.onerror = () => preview.classList.add('hidden'); }
async function uploadBlogMediaDirect(file) { const form = new FormData(); form.append('file', file); const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {}; const response = await fetch(`${API_BASE}/admin/blog-media`, { method: 'POST', headers, body: form }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Blog media upload failed.'); return data.media; }
async function uploadBlogMediaMultipart(file, onProgress) { const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {}; const startResponse = await fetch(`${API_BASE}/admin/blog-media/multipart/start`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }) }); const start = await startResponse.json().catch(() => ({})); if (!startResponse.ok) throw new Error(start.error || 'Could not start media upload.'); const chunkSize = 8 * 1024 * 1024; const parts = []; for (let offset = 0, partNumber = 1; offset < file.size; offset += chunkSize, partNumber += 1) { const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size)); const partResponse = await fetch(`${API_BASE}/admin/blog-media/multipart/part`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-Upload-Key': start.key, 'X-Upload-Id': start.uploadId, 'X-Part-Number': String(partNumber) }, body: chunk }); const part = await partResponse.json().catch(() => ({})); if (!partResponse.ok) throw new Error(part.error || `Could not upload part ${partNumber}.`); parts.push(part.part); onProgress?.(Math.min(100, Math.round((offset + chunk.size) / file.size * 100))); } const completeResponse = await fetch(`${API_BASE}/admin/blog-media/multipart/complete`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Upload-Key': start.key, 'X-Upload-Id': start.uploadId }, body: JSON.stringify({ parts, fileName: file.name, contentType: file.type }) }); const complete = await completeResponse.json().catch(() => ({})); if (!completeResponse.ok) throw new Error(complete.error || 'Could not complete media upload.'); return complete.media; }
async function uploadBlogMedia(file, onProgress) { if (!file) throw new Error('Choose an image or video file first.'); return file.size > 64 * 1024 * 1024 ? uploadBlogMediaMultipart(file, onProgress) : uploadBlogMediaDirect(file); }
async function uploadCmsMedia() { const input = $('#cms-media-file'); const file = input?.files?.[0]; const message = $('#cms-post-message'); if (!file) return toast('Choose an image or video file first.'); message.textContent = file.size > 64 * 1024 * 1024 ? 'Uploading in chunks… 0%' : 'Uploading media…'; try { const media = await uploadBlogMedia(file, (percent) => { message.textContent = `Uploading in chunks… ${percent}%`; }); $('#cms-post-form').elements.namedItem('mediaUrl').value = media.url; if (media.type === 'image' && !String($('#cms-post-form').elements.namedItem('coverImageUrl').value || '').trim()) $('#cms-post-form').elements.namedItem('coverImageUrl').value = media.url; updateCmsCoverPreview(); message.textContent = 'Media uploaded. Save the post to apply it.'; input.value = ''; updateCmsSeoReadiness(); } catch (error) { message.textContent = error.message; } }
async function uploadCmsCover() { const input = $('#cms-cover-file'); const file = input?.files?.[0]; const message = $('#cms-post-message'); if (!file) return toast('Choose a cover image first.'); message.textContent = 'Uploading cover image…'; try { const media = await uploadBlogMedia(file); if (media.type !== 'image') throw new Error('Cover image must be JPG, PNG or WEBP.'); $('#cms-post-form').elements.namedItem('coverImageUrl').value = media.url; updateCmsCoverPreview(); message.textContent = 'Cover image uploaded. Save the post to apply it.'; input.value = ''; updateCmsSeoReadiness(); } catch (error) { message.textContent = error.message; } }
function resetCmsPost() { const form = $('#cms-post-form'); if (!form) return; form.reset(); form.dataset.slug = ''; form.elements.namedItem('rights').value = 'This is hosted here. The page will claim your copyright and link to your licence.'; form.elements.namedItem('allowSearchEngines').checked = true; $('#cms-cover-preview')?.classList.add('hidden'); $('#cms-post-message').textContent = ''; updateCmsSeoReadiness(); }
function editCmsPost(slug) { const post = (state.cmsPosts || []).find((item) => item.slug === slug); if (!post) return; const form = $('#cms-post-form'); resetCmsPost(); form.dataset.slug = post.slug; for (const [key, value] of Object.entries(post)) { const field = form.elements.namedItem(key); if (field && field.type !== 'file') field.value = value ?? ''; } form.elements.namedItem('allowSearchEngines').checked = Boolean(post.allowSearchEngines); updateCmsCoverPreview(); updateCmsSeoReadiness(); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function marketingFormValues(form) { const values = Object.fromEntries(new FormData(form).entries()); values.active = form.elements.namedItem('active').checked; values.sortOrder = Number(values.sortOrder || 0); values.marqueeSpeed = Number(values.marqueeSpeed || 22); return values; }
function updateMarketingPreview() { const form = $('#marketing-banner-form'); const preview = $('#marketing-banner-preview'); const url = String(form?.elements.namedItem('imageUrl')?.value || '').trim(); if (!preview) return; if (!url) { preview.classList.add('hidden'); preview.removeAttribute('src'); return; } preview.src = url; preview.classList.remove('hidden'); preview.onerror = () => preview.classList.add('hidden'); }
function resetMarketingBanner() { const form = $('#marketing-banner-form'); if (!form) return; form.reset(); form.dataset.id = ''; form.elements.namedItem('active').checked = true; form.elements.namedItem('sortOrder').value = '0'; form.elements.namedItem('marqueeSpeed').value = '22'; $('#marketing-banner-heading').textContent = 'Create a banner'; $('#marketing-banner-message').textContent = ''; $('#marketing-upload-message').textContent = 'R2 image upload is available after the storage binding is enabled; URL-based banners work now.'; updateMarketingPreview(); }
function renderMarketingBanners() { const list = $('#marketing-banner-list'); if (!list) return; const banners = state.marketingBanners || []; $('#marketing-banner-count').textContent = String(banners.length); list.innerHTML = banners.length ? banners.map((banner) => `<div class="marketing-banner-row ${banner.active ? 'is-active' : 'is-paused'}"><div class="marketing-banner-row-media">${banner.imageUrl ? `<img src="${escapeHtml(banner.imageUrl)}" alt="" loading="lazy" />` : '<span>✦</span>'}</div><div class="marketing-banner-row-copy"><strong>${escapeHtml(banner.title || 'Untitled banner')}</strong><small>${escapeHtml(banner.placement)} · ${escapeHtml(banner.categorySlug || 'All categories')} · ${banner.active ? 'Active' : 'Paused'}</small><span>${escapeHtml(banner.body || banner.linkUrl || 'No supporting copy')}</span></div><button class="icon-action" type="button" data-edit-banner="${banner.id}">Edit</button></div>`).join('') : '<p class="muted">No banners saved yet.</p>'; }
function renderNewsletterLeads() { const leads = state.newsletterLeads || []; const table = $('#newsletter-table'); if (!table) return; $('#newsletter-lead-count').textContent = String(leads.length); table.innerHTML = leads.length ? leads.map((lead) => `<tr><td><strong>${escapeHtml(lead.email)}</strong></td><td>${escapeHtml(lead.source || 'footer')}</td><td><span class="status-pill ${escapeHtml(lead.status)}">${escapeHtml(lead.status)}</span></td><td>${escapeHtml(lead.createdAt || '')}</td><td>${escapeHtml(lead.lastSeenAt || '')}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No newsletter leads yet.</td></tr>'; }
function editMarketingBanner(id) { const banner = (state.marketingBanners || []).find((item) => Number(item.id) === Number(id)); const form = $('#marketing-banner-form'); if (!banner || !form) return; form.dataset.id = String(banner.id); $('#marketing-banner-heading').textContent = 'Edit banner'; for (const [key, value] of Object.entries(banner)) { const field = form.elements.namedItem(key); if (field && field.type !== 'file') field.value = value ?? ''; } form.elements.namedItem('active').checked = Boolean(banner.active); updateMarketingPreview(); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function saveMarketingBanner(event) { event.preventDefault(); const form = event.target; const values = marketingFormValues(form); const id = form.dataset.id; try { await api(id ? `/admin/marketing-banners/${id}` : '/admin/marketing-banners', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) }); $('#marketing-banner-message').textContent = id ? 'Banner updated.' : 'Banner saved.'; toast(id ? 'Banner updated' : 'Banner saved'); resetMarketingBanner(); await loadCms(); } catch (error) { $('#marketing-banner-message').textContent = error.message; } }
async function uploadMarketingImage() { const input = $('#marketing-banner-file'); const file = input?.files?.[0]; const message = $('#marketing-upload-message'); if (!file) return toast('Choose a banner image first.'); message.textContent = 'Uploading banner image…'; try { const media = await uploadBlogMedia(file); if (media.type !== 'image') throw new Error('Banner image must be JPG, PNG or WEBP.'); $('#marketing-banner-form').elements.namedItem('imageUrl').value = media.url; updateMarketingPreview(); message.textContent = 'Banner image uploaded. Save the banner to apply it.'; input.value = ''; } catch (error) { message.textContent = error.message; } }
function exportNewsletterCsv() { const leads = state.newsletterLeads || []; if (!leads.length) return toast('There are no newsletter leads to export.'); const csv = ['email,source,status,created_at,last_seen_at', ...leads.map((lead) => [lead.email, lead.source, lead.status, lead.createdAt, lead.lastSeenAt].map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(','))].join('\n'); const blob = new Blob([`\\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `rinova-newsletter-leads-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); $('#newsletter-message').textContent = `Exported ${leads.length} lead${leads.length === 1 ? '' : 's'}.`; }
async function loadCms() { try { const data = await api('/admin/content');
  // The offer form searches the catalogue, so it needs one even when Products was never opened.
  if (!(state.products || []).length) { try { state.products = (await api('/admin/products')).products || []; } catch { state.products = state.products || []; } }
  renderOfferProductChoices(); state.cmsPosts = data.posts || []; state.marketingBanners = data.banners || []; state.newsletterLeads = data.newsletter || []; const categorySelect = $('#marketing-category-select'); if (categorySelect) categorySelect.innerHTML = '<option value="">All categories</option>' + (data.categories || []).filter((category) => category.active !== 0 && category.active !== false).map((category) => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`).join(''); const banner = data.content?.find((item) => item.key === 'topbar_notice'); if (banner) { const body = JSON.parse(banner.body || '{}'); $('#cms-banner-form [name="text"]').value = body.text || ''; } $('#cms-summary').innerHTML = `<div class="list-row"><span><strong>${(data.pages || []).length}</strong><small>Pages</small></span><span><strong>${(data.posts || []).length}</strong><small>Blog posts</small></span><span><strong>${(data.offers || []).length}</strong><small>Offers</small></span><span><strong>${(data.content || []).length}</strong><small>CMS blocks</small></span></div>`; $('#cms-post-list').innerHTML = (data.posts || []).map((post) => `<div class="list-row"><span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.category || 'Uncategorised')} · ${escapeHtml(post.status)}</small></span><button type="button" class="icon-action" data-edit-post="${escapeHtml(post.slug)}">Edit</button></div>`).join('') || '<p class="muted">No blog posts yet.</p>'; renderMarketingBanners(); renderNewsletterLeads(); renderOfferList(data.offers || []); await loadMediaLibrary(); updateCmsSeoReadiness(); } catch (error) { toast(error.message); } }
async function saveCmsBanner(event) { event.preventDefault(); try { await api('/admin/content/topbar_notice', { method: 'PUT', body: JSON.stringify({ type: 'banner', title: 'Topbar notice', body: { text: event.target.elements.text.value }, status: 'published' }) }); $('#cms-banner-message').textContent = 'Banner saved.'; } catch (error) { $('#cms-banner-message').textContent = error.message; } }
async function saveCmsPage(event) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target).entries()); try { await api('/admin/pages', { method: 'POST', body: JSON.stringify(values) }); $('#cms-page-message').textContent = 'Page saved.'; loadCms(); } catch (error) { $('#cms-page-message').textContent = error.message; } }
async function saveCmsPost(event) { event.preventDefault(); const form = event.target; const values = Object.fromEntries(new FormData(form).entries()); const action = event.submitter?.dataset.postAction || 'draft'; values.status = action === 'publish' ? 'published' : 'draft'; values.priority = Number(values.priority || 0); values.allowSearchEngines = form.elements.namedItem('allowSearchEngines').checked; values.imageUrl = values.coverImageUrl; const seo = blogSeoValues(form); if (action === 'publish' && !seo.ready) { $('#cms-post-message').textContent = 'Complete every SEO readiness item before publishing.'; updateCmsSeoReadiness(); return; } try { const data = await api('/admin/posts', { method: 'POST', body: JSON.stringify(values) }); $('#cms-post-message').textContent = action === 'publish' ? 'Post published successfully.' : 'Draft saved successfully.'; if (data.seo) updateCmsSeoReadiness(); await loadCms(); } catch (error) { $('#cms-post-message').textContent = error.message; if (error.seo) updateCmsSeoReadiness(); } }
async function saveCmsOffer(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  values.discountValue = Number(values.discountValue || 0);
  values.minSubtotal = Number(values.minSubtotal || 0);
  values.usageLimit = Number(values.usageLimit || 0);
  // The select carries strings; the API wants a real boolean.
  values.autoApply = values.autoApply === 'true';
  // Say what is wrong here rather than letting the server answer with a bare 400.
  if (values.discountType === 'percentage' && (values.discountValue <= 0 || values.discountValue > 100)) { $('#cms-offer-message').textContent = 'শতকরা ছাড় ১ থেকে ১০০ এর মধ্যে দিন। (A percentage must be between 1 and 100.)'; return; }
  if (values.discountType === 'fixed' && values.discountValue <= 0) { $('#cms-offer-message').textContent = 'ছাড়ের পরিমাণ শূন্যের বেশি দিন। (A fixed discount needs an amount above zero.)'; return; }
  if (!String(values.code || '').trim() && !values.autoApply) { $('#cms-offer-message').textContent = 'কুপন কোড দিন, অথবা "নিজে থেকেই" বেছে নিন। (Give a code, or set it to apply automatically.)'; return; }
  values.productIds = offerProducts.chosen.map((product) => Number(product.id));
  try {
    await api('/admin/offers', { method: 'POST', body: JSON.stringify(values) });
    $('#cms-offer-message').textContent = values.productIds.length ? `Offer saved — it covers ${values.productIds.length} product${values.productIds.length === 1 ? '' : 's'}.` : 'Offer saved and live across the shop.';
    toast('Offer saved');
    event.target.reset();
    offerProducts.chosen = [];
    renderOfferProductChoices();
    loadCms();
  } catch (error) { $('#cms-offer-message').textContent = error.message; }
}

/**
 * Choosing which products an offer covers.
 *
 * An offer used to be all-or-nothing across the whole shop, so "20% off face wash" was not
 * expressible: the owner had to discount everything or nothing. Searching the catalogue here
 * and picking the products keeps that decision next to the offer that makes it.
 */
const offerProducts = { chosen: [] };
function renderOfferProductChoices() {
  const node = document.getElementById('offer-product-chosen');
  if (!node) return;
  node.innerHTML = offerProducts.chosen.length
    ? offerProducts.chosen.map((product) => `<button type="button" class="offer-chip" data-offer-product-remove="${product.id}">${escapeHtml(product.name)}<span aria-hidden="true">✕</span><span class="sr-only">Remove</span></button>`).join('')
      + '<p class="muted">শুধু এই প্রোডাক্টগুলোতেই ছাড় প্রযোজ্য হবে। (The discount applies only to these.)</p>'
    : '<p class="muted">কোনো প্রোডাক্ট বাছা হয়নি — অফারটি পুরো দোকানে চলবে। (Nothing chosen: the offer covers the whole shop.)</p>';
}
function renderOfferProductResults(query) {
  const node = document.getElementById('offer-product-results');
  if (!node) return;
  const term = String(query || '').trim().toLowerCase();
  if (!term) { node.innerHTML = ''; return; }
  const matches = (state.products || [])
    .filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(term))
    .filter((product) => !offerProducts.chosen.some((chosen) => Number(chosen.id) === Number(product.id)))
    .slice(0, 8);
  node.innerHTML = matches.length
    ? matches.map((product) => `<button type="button" class="offer-result" data-offer-product-add="${product.id}"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || '')} · ${money(product.price)}</small></button>`).join('')
    : '<p class="muted">এই নামে কিছু পাওয়া যায়নি। (No product matches that.)</p>';
}
document.getElementById('offer-product-search')?.addEventListener('input', (event) => renderOfferProductResults(event.target.value));
document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-offer-product-add]');
  if (add) {
    const product = (state.products || []).find((item) => Number(item.id) === Number(add.dataset.offerProductAdd));
    if (product && !offerProducts.chosen.some((chosen) => Number(chosen.id) === Number(product.id))) offerProducts.chosen.push({ id: Number(product.id), name: product.name });
    const search = document.getElementById('offer-product-search');
    if (search) search.value = '';
    renderOfferProductResults('');
    renderOfferProductChoices();
  }
  const remove = event.target.closest('[data-offer-product-remove]');
  if (remove) {
    offerProducts.chosen = offerProducts.chosen.filter((chosen) => Number(chosen.id) !== Number(remove.dataset.offerProductRemove));
    renderOfferProductChoices();
  }
});

/** Shows how much of a coupon's allowance is gone, and lets the owner act on it. */
function offerScopeText(offer) {
  let ids = [];
  try { ids = JSON.parse(offer.productIdsJson || '[]'); } catch { ids = []; }
  if (!Array.isArray(ids) || !ids.length) return 'Whole shop';
  const names = ids.map((id) => (state.products || []).find((product) => Number(product.id) === Number(id))?.name).filter(Boolean);
  return escapeHtml(names.length ? `Only: ${names.join(', ')}` : `${ids.length} selected product${ids.length === 1 ? '' : 's'}`);
}

function renderOfferList(offers) {
  const node = $('#cms-offer-list');
  if (!node) return;
  node.innerHTML = (offers || []).length ? `<table><thead><tr><th>Offer</th><th>Discount</th><th>Used</th><th>State</th><th></th></tr></thead><tbody>${offers.map((offer) => {
    const limit = Number(offer.usageLimit || 0);
    const used = Number(offer.usedCount || 0);
    const spent = limit > 0 && used >= limit;
    const discount = offer.discountType === 'percentage' ? `${offer.discountValue}%` : offer.discountType === 'free_delivery' ? 'Free delivery' : money(offer.discountValue);
    return `<tr><td><strong>${escapeHtml(offer.code || 'Automatic')}</strong><small>${escapeHtml(offer.title || '')}</small>${Number(offer.minSubtotal) ? `<small>Minimum ${money(offer.minSubtotal)}</small>` : ''}<small>${offerScopeText(offer)}</small></td><td>${escapeHtml(discount)}</td><td>${used}${limit > 0 ? ` / ${limit}` : ''}${spent ? ' <span class="order-pill order-pill-stop">Used up</span>' : ''}</td><td>${Number(offer.active) ? '<span class="order-pill order-pill-done">Active</span>' : '<span class="order-pill order-pill-wait">Paused</span>'}${Number(offer.autoApply) ? ' <span class="order-pill order-pill-info">Automatic</span>' : ''}</td><td><div class="order-row-actions"><button class="icon-action" type="button" data-offer-toggle="${offer.id}" data-active="${Number(offer.active) ? '0' : '1'}">${Number(offer.active) ? 'Pause' : 'Activate'}</button>${used ? `<button class="icon-action" type="button" data-offer-reset="${offer.id}">Reset count</button>` : ''}<button class="icon-action" type="button" data-offer-delete="${offer.id}" data-label="${escapeHtml(offer.code || offer.title || 'this offer')}">Delete</button></div></td></tr>`;
  }).join('')}</tbody></table>` : '<p class="muted">No offers yet. Create one on the left — give it a code, or set it to apply automatically.</p>';
}

document.addEventListener('click', async (event) => {
  const toggle = event.target.closest('[data-offer-toggle]');
  const reset = event.target.closest('[data-offer-reset]');
  const remove = event.target.closest('[data-offer-delete]');
  try {
    if (toggle) { await api(`/admin/offers/${toggle.dataset.offerToggle}`, { method: 'PATCH', body: JSON.stringify({ active: toggle.dataset.active === '1' }) }); toast('Offer updated'); loadCms(); }
    else if (reset) { await api(`/admin/offers/${reset.dataset.offerReset}`, { method: 'PATCH', body: JSON.stringify({ resetUsage: true }) }); toast('Usage count reset'); loadCms(); }
    else if (remove) { if (!window.confirm(`Delete ${remove.dataset.label}?`)) return; await api(`/admin/offers/${remove.dataset.offerDelete}`, { method: 'DELETE' }); toast('Offer deleted'); loadCms(); }
  } catch (error) { toast(error.message); }
});
function formatAssistantText(value) { return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>'); }
function renderAdminChat() { const node = $('#admin-chat-messages'); if (!node) return; if (!state.adminChat.length) { node.innerHTML = '<div class="assistant-empty-state"><div class="assistant-empty-icon" aria-hidden="true">✦</div><strong>Good morning, Rinova.</strong><p>I can help you make a faster decision with the shop data already in your dashboard.</p><span>Try a prompt above or ask your own question below.</span></div>'; } else { node.innerHTML = state.adminChat.map((message) => `<div class="chat-message-row ${message.role}"><div class="chat-bubble ${message.role}">${formatAssistantText(message.content)}</div></div>`).join(''); } node.scrollTop = node.scrollHeight; }
async function sendAdminChat(event) { event.preventDefault(); const input = $('#admin-chat-input'); const content = input.value.trim(); const status = $('#admin-chat-status'); if (!content || input.disabled) return; input.value = ''; state.adminChat.push({ role: 'user', content }); renderAdminChat(); input.disabled = true; input.setAttribute('aria-busy', 'true'); status.textContent = 'SmartGen is checking your shop data…'; try { const data = await api('/admin/chat', { method: 'POST', body: JSON.stringify({ messages: state.adminChat }) }); state.adminChat.push({ role: 'assistant', content: data.reply }); status.textContent = 'Answer ready.'; renderAdminChat(); } catch (error) { state.adminChat.push({ role: 'assistant', content: 'I could not access the shop assistant right now. Please try again.' }); status.textContent = 'SmartGen is unavailable right now.'; renderAdminChat(); } finally { input.disabled = false; input.removeAttribute('aria-busy'); input.focus(); } }
function renderAdminInvoiceDocument(data) { const invoice = data.invoice || {}; const items = data.items || []; const invoiceCode = String(invoice.invoiceNumber || invoice.orderCode || '').trim(); const productLink = (item) => new URL(`/products/${encodeURIComponent(String(item.productSlug || item.productId || ''))}`, window.location.origin).href; const itemSku = (item) => String(item.sku || item.barcode || item.productName || '').trim(); const rows = items.map((item) => `<tr><td>${escapeHtml(item.productName)}<br><small>SKU: ${escapeHtml(itemSku(item))}</small></td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${Number(item.weightGrams || 0).toLocaleString('en-BD')} g</td><td>${money(item.unitPrice * item.quantity)}</td></tr>`).join(''); const links = Array.from(new Set(items.map(productLink))); const invoiceBarcodePayload = invoiceCode; const invoiceBars = `<div class=\"barcode-pair invoice-barcodes single-invoice-barcode\"><div><small>INVOICE ID</small><svg data-barcode=\"${escapeHtml(invoiceBarcodePayload)}\"></svg><small>${escapeHtml(invoiceBarcodePayload)}</small></div></div>`; const footerLinks = links.length ? `<div class="product-links"><strong>Product links</strong>${links.map((link) => `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`).join('')}</div>` : ''; return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber || invoice.orderCode || 'Rinova invoice')}</title><style>body{font:14px Arial,sans-serif;color:#30252b;padding:28px;max-width:760px;margin:auto}h1{margin:0 0 4px;font:700 28px Georgia,serif}h2{font-size:15px;margin:0 0 8px}.eyebrow{letter-spacing:.16em;font-size:10px;color:#bb7892;font-weight:700}.muted{color:#766a70}.head,.meta,.grid,.total div{display:flex;justify-content:space-between;gap:20px}.invoice-brand-row{display:flex;align-items:center;gap:12px}.invoice-seal{display:grid;place-items:center;width:42px;height:42px;border-radius:13px 13px 13px 4px;background:linear-gradient(145deg,#e85d8d,#b83d6b);color:#fff;font:700 18px/1 Georgia,serif;letter-spacing:-.08em}.invoice-seal span{display:block;font:700 7px/1 Arial,sans-serif;letter-spacing:.16em;margin-top:12px;margin-left:-2px}.head{border-bottom:1px solid #eadde2;padding-bottom:18px;margin-bottom:20px}.meta{text-align:right;display:block}.grid{align-items:flex-start;margin-bottom:22px}.grid>div{width:48%}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;border-bottom:1px solid #eadde2;padding:9px 5px;font-size:12px}th{color:#766a70;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.total{margin-left:auto;width:260px}.total div{padding:6px 0}.grand{border-top:2px solid #30252b;margin-top:5px;padding-top:10px!important;font-size:17px}.barcode-pair{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin:18px 0}.barcode-pair>div{min-width:210px;text-align:center}.barcode-pair small{display:block;font-size:9px;color:#766a70;letter-spacing:.08em;margin:3px 0}.barcode-pair svg{display:block;width:205px;height:48px;margin:auto}.product-links{border-top:1px solid #eadde2;margin-top:22px;padding-top:14px;font-size:11px}.product-links a{display:block;color:#9c3e67;word-break:break-all;margin-top:5px}@media print{body{padding:0}.print-action{display:none}.product-links a{color:#30252b;text-decoration:none}}</style></head><body><div class="head"><div><div class="invoice-brand-row"><div class="invoice-seal" aria-label="Rinova BD seal">R<span>BD</span></div><div><p class="eyebrow">RINOVA BD</p><h1>Invoice</h1></div></div><p class="muted">Beauty, thoughtfully chosen.</p></div><div class="meta"><strong>${escapeHtml(invoice.invoiceNumber || invoice.orderCode)}</strong><br>${escapeHtml(invoice.createdAt)}<br>Status: ${escapeHtml(invoice.status)}</div></div><div class="grid"><div><h2>Bill to</h2><p><strong>${escapeHtml(invoice.name)}</strong></p><p>${escapeHtml(invoice.phone)}</p><p>${escapeHtml(invoice.email || '')}</p><p>${escapeHtml(invoice.address)}, ${escapeHtml(invoice.upazila)}, ${escapeHtml(invoice.district)}</p></div><div><h2>Order details</h2><p>Payment: ${escapeHtml(invoice.paymentMethod)} (${escapeHtml(invoice.paymentStatus)})</p><p>Order source: ${escapeHtml(invoice.orderSource)}</p><p>Delivery: ${escapeHtml(invoice.deliveryZone)} · ${money(invoice.deliveryFee)}</p><p>Package weight: ${Number(invoice.packageWeightGrams || 0).toLocaleString('en-BD')} g</p></div></div><table><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Weight</th><th>Line total</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><div><span>Subtotal</span><strong>${money(invoice.subtotal)}</strong></div><div><span>Delivery</span><strong>${money(invoice.deliveryFee)}</strong></div><div class="grand"><span>Total</span><strong>${money(invoice.total)}</strong></div></div>${invoiceBars}${footerLinks}<p class="print-action" style="margin-top:26px"><button onclick="window.print()">Print invoice</button></p><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script><script>window.addEventListener('load',()=>{document.querySelectorAll('svg[data-barcode]').forEach((svg)=>{try{JsBarcode(svg,svg.dataset.barcode,{format:'CODE128',displayValue:false,height:42,width:1.35,margin:2});}catch(e){}});});<\/script></body></html>`; } async function printInvoice(orderCode) { const popup = window.open('', '_blank', 'width=560,height=760'); if (!popup) return toast('Allow pop-ups to print the invoice.'); popup.document.write('<p style="font:14px Arial;padding:28px">Loading invoice…</p>'); try { const data = await api(`/orders/${encodeURIComponent(orderCode)}/invoice`); popup.document.open(); popup.document.write(renderAdminInvoiceDocument(data)); popup.document.close(); } catch (error) { popup.close(); toast(error.message); } }
const cmsPostForm = $('#cms-post-form'); cmsPostForm?.addEventListener('input', (event) => { if (event.target.name === 'title') { const slug = cmsPostForm.elements.namedItem('slug'); if (slug?.dataset.auto !== 'false') slug.value = slugifyBlogTitle(event.target.value); } if (event.target.name === 'slug') event.target.dataset.auto = 'false'; if (event.target.name === 'coverImageUrl') updateCmsCoverPreview(); updateCmsSeoReadiness(); }); cmsPostForm?.elements.namedItem('slug')?.addEventListener('focus', (event) => { if (!event.target.value) event.target.dataset.auto = 'true'; }); $('#marketing-banner-form')?.addEventListener('input', (event) => { if (event.target.name === 'imageUrl') updateMarketingPreview(); }); $('#cms-post-reset')?.addEventListener('click', resetCmsPost); $('#cms-media-library')?.addEventListener('change', (event) => { const value = event.target.value; if (value) { cmsPostForm.elements.namedItem('coverImageUrl').value = value; updateCmsCoverPreview(); updateCmsSeoReadiness(); } }); $('#cms-upload-media')?.addEventListener('click', uploadCmsMedia); $('#cms-upload-cover')?.addEventListener('click', uploadCmsCover); $('#cms-media-drop')?.addEventListener('click', (event) => { if (!event.target.closest('button') && !event.target.closest('input') && !event.target.closest('label')) $('#cms-media-file')?.click(); }); $('#cms-media-drop')?.addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('dragover'); }); $('#cms-media-drop')?.addEventListener('dragleave', () => $('#cms-media-drop')?.classList.remove('dragover')); $('#cms-media-drop')?.addEventListener('drop', (event) => { event.preventDefault(); $('#cms-media-drop')?.classList.remove('dragover'); const file = event.dataTransfer.files?.[0]; if (file) { const input = $('#cms-media-file'); const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; uploadCmsMedia(); } }); document.addEventListener('click', (event) => { const openView = event.target.closest('[data-open-view]'); if (openView) loadView(openView.dataset.openView); const postButton = event.target.closest('[data-edit-post]'); if (postButton) editCmsPost(postButton.dataset.editPost); const bannerButton = event.target.closest('[data-edit-banner]'); if (bannerButton) editMarketingBanner(Number(bannerButton.dataset.editBanner)); }); $('#cms-media-file')?.addEventListener('change', uploadCmsMedia); $('#cms-cover-file')?.addEventListener('change', () => { if ($('#cms-cover-file').files?.[0]) uploadCmsCover(); }); updateCmsSeoReadiness(); $('#login-form').addEventListener('submit', login); $('#logout').addEventListener('click', async () => { try { await api('/admin/logout', { method: 'POST' }); } finally { state.token = ''; sessionStorage.removeItem('rinova-admin-token'); showLogin(); } }); document.querySelectorAll('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => loadView(button.dataset.view))); $('#mobile-menu').addEventListener('click', () => toggleMobileNav(!$('.sidebar').classList.contains('open'))); $('#sidebar-backdrop').addEventListener('click', closeMobileNav); document.querySelector('[data-action="close-menu"]')?.addEventListener('click', closeMobileNav); $('#assistant-quick').addEventListener('click', openAssistantPopup); $('#notification-button')?.addEventListener('click', () => toggleNotificationPanel()); $('#notifications-close')?.addEventListener('click', () => toggleNotificationPanel(false)); $('#notifications-read-all')?.addEventListener('click', markAllNotificationsRead); document.addEventListener('click', (event) => { const panel = $('#notification-panel'); if (panel && !panel.classList.contains('hidden') && !event.target.closest('#notification-panel, #notification-button')) toggleNotificationPanel(false); }); $('#traffic-refresh')?.addEventListener('click', loadAnalytics); $('#assistant-fab').addEventListener('click', openAssistantPopup); $('#assistant-close').addEventListener('click', () => { $('#view-assistant')?.setAttribute('aria-hidden', 'true'); loadView('overview'); }); document.querySelectorAll('[data-assistant-prompt]').forEach((button) => button.addEventListener('click', () => { const input = $('#admin-chat-input'); input.value = button.dataset.assistantPrompt || ''; input.focus(); })); document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (document.body.classList.contains('assistant-open')) loadView('overview'); else if (!$('#notification-panel')?.classList.contains('hidden')) toggleNotificationPanel(false); else if ($('#admin-preview-panel')?.classList.contains('open')) closeAdminPreview(); else closeMobileNav(); } }); $('#morning-reset').addEventListener('click', () => { localStorage.removeItem(morningStorageKey()); renderMorningChecklist(); }); document.querySelectorAll('.period-buttons button').forEach((button) => button.addEventListener('click', () => { state.days = Number(button.dataset.days); document.querySelectorAll('.period-buttons button').forEach((item) => item.classList.toggle('active', item === button)); loadOverview(); })); document.querySelectorAll('[data-admin-mode]').forEach((button) => button.addEventListener('click', () => setAdminMode(button.dataset.adminMode))); $('#admin-preview-open')?.addEventListener('click', openAdminPreview); $('#admin-preview-open-mobile')?.addEventListener('click', openAdminPreview); $('#admin-preview-close')?.addEventListener('click', closeAdminPreview); $('#admin-preview-refresh')?.addEventListener('click', refreshAdminPreview); $('#admin-preview-frame')?.addEventListener('load', () => $('#admin-preview-frame')?.contentWindow?.postMessage({ type: 'rinova-admin-preview-mode', mode: state.adminMode }, window.location.origin)); $('#new-product').addEventListener('click', () => openProductEditor()); document.querySelectorAll('[data-close-editor]').forEach((button) => button.addEventListener('click', () => $('#product-editor').classList.add('hidden'))); $('#product-form').addEventListener('submit', saveProduct); $('#product-form [name="imageUrl"]').addEventListener('input', updateImagePreview); $('#product-category')?.addEventListener('change', renderProductOptions); $('#gallery-video-add')?.addEventListener('click', addGalleryVideo); $('#tier-add')?.addEventListener('click', () => { editorState.tiers.push({ minQty: '', price: '' }); renderTierRows(); }); $('#upload-primary-image').addEventListener('click', uploadPrimaryImage); $('#upload-gallery-images').addEventListener('click', uploadGalleryImages); $('#product-search').addEventListener('input', loadProducts); $('#product-status').addEventListener('change', loadProducts); $('#order-search').addEventListener('input', loadOrders); $('#order-status').addEventListener('change', loadOrders); $('#return-status').addEventListener('change', loadReturns); $('#review-status').addEventListener('change', loadReviews); $('#pos-search-button').addEventListener('click', loadPosProducts); $('#pos-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); loadPosProducts(); } }); $('#pos-clear').addEventListener('click', () => { state.posCart = []; $('#pos-discount').value = 0; renderPosCart(); }); $('#pos-discount').addEventListener('input', renderPosCart); $('#pos-complete').addEventListener('click', completePosSale); $('#barcode-label-print').addEventListener('click', printBarcodeLabels); $('#barcode-label-clear').addEventListener('click', () => { state.barcodeLabels = []; renderBarcodeLabels(); }); $('#cms-banner-form').addEventListener('submit', saveCmsBanner); $('#cms-page-form').addEventListener('submit', saveCmsPage); $('#cms-post-form').addEventListener('submit', saveCmsPost); $('#cms-offer-form').addEventListener('submit', saveCmsOffer); $('#marketing-banner-form')?.addEventListener('submit', saveMarketingBanner); $('#marketing-banner-reset')?.addEventListener('click', resetMarketingBanner); $('#marketing-upload-image')?.addEventListener('click', uploadMarketingImage); $('#marketing-banner-file')?.addEventListener('change', uploadMarketingImage); $('#newsletter-export')?.addEventListener('click', exportNewsletterCsv); $('#admin-chat-form').addEventListener('submit', sendAdminChat); document.addEventListener('click', (event) => { const morningToggle = event.target.closest('[data-morning-toggle]'); if (morningToggle) toggleMorningTask(morningToggle.dataset.morningToggle); const morningView = event.target.closest('[data-morning-view]'); if (morningView) loadView(morningView.dataset.morningView); const overviewAlert = event.target.closest('[data-overview-alert-view]'); if (overviewAlert) loadView(overviewAlert.dataset.overviewAlertView); const clientView = event.target.closest('[data-client-list-view]'); if (clientView) loadView(clientView.dataset.clientListView); const searchOrder = event.target.closest('[data-search-order]'); if (searchOrder) { loadView('orders'); const orderSearch = $('#order-search'); if (orderSearch) { orderSearch.value = searchOrder.dataset.searchOrder; loadOrders(); } } const stockButton = event.target.closest('[data-stock-sku]'); if (stockButton) adjustStock(stockButton.dataset.stockSku, stockButton.dataset.stockName); const editButton = event.target.closest('[data-edit-sku], [data-quick-edit-sku]'); if (editButton) openProductEditor(state.products.find((product) => String(product.sku) === String(editButton.dataset.editSku || editButton.dataset.quickEditSku))); const posAdd = event.target.closest('[data-pos-add]'); if (posAdd) addPosProduct(posAdd.dataset.posAdd); const labelAdd = event.target.closest('[data-label-add]'); if (labelAdd) addBarcodeLabel(labelAdd.dataset.labelAdd); const labelRemove = event.target.closest('[data-label-remove]'); if (labelRemove) { state.barcodeLabels = state.barcodeLabels.filter((item) => String(item.product.sku) !== String(labelRemove.dataset.labelRemove)); renderBarcodeLabels(); } const posRemove = event.target.closest('[data-pos-remove]'); if (posRemove) { state.posCart = state.posCart.filter((item) => String(item.product.sku) !== String(posRemove.dataset.posRemove)); renderPosCart(); } const orderDetailsButton = event.target.closest('[data-order-details]'); if (orderDetailsButton) loadOrderDetails(orderDetailsButton.dataset.orderDetails); const closeOrderDetails = event.target.closest('[data-close-order-details]'); if (closeOrderDetails) $('#order-detail-panel')?.classList.add('hidden'); const copyCustomer = event.target.closest('[data-copy-customer]'); if (copyCustomer) copyToClipboard($('#order-copy-text')?.textContent || '', 'Customer details copied'); const copyValue = event.target.closest('[data-copy-value]'); if (copyValue) copyToClipboard(copyValue.dataset.copyValue, 'Transaction ID copied'); const addOrderItem = event.target.closest('[data-add-order-item]'); if (addOrderItem) { addOrderItemRow(); refreshOrderDraftTotals(); } const removeOrderItem = event.target.closest('[data-remove-order-item]'); if (removeOrderItem) { removeOrderItem.closest('[data-order-item-row]')?.remove(); refreshOrderDraftTotals(); } const printButton = event.target.closest('[data-print-order]'); if (printButton) printInvoice(printButton.dataset.printOrder); const notificationButton = event.target.closest('[data-notification-id]'); if (notificationButton) openNotificationTarget(notificationButton); const approveButton = event.target.closest('[data-review-approve]'); if (approveButton) updateReview(Number(approveButton.dataset.reviewApprove), 'approved'); }); document.addEventListener('input', (event) => { if (event.target.closest('#order-items-form')) refreshOrderDraftTotals(); }); document.addEventListener('change', (event) => { if (event.target.closest('#order-items-form')) refreshOrderDraftTotals(); const select = event.target.closest('.order-status-select'); if (select) updateOrderStatus(select.dataset.orderCode, select.value); const returnSelect = event.target.closest('.return-status-select'); if (returnSelect) updateReturn(Number(returnSelect.dataset.returnId), returnSelect.value); const labelQuantity = event.target.closest('[data-label-quantity]'); if (labelQuantity) updateBarcodeLabel(labelQuantity.dataset.labelQuantity, labelQuantity.value); const reviewSelect = event.target.closest('.review-status-select'); if (reviewSelect) updateReview(Number(reviewSelect.dataset.reviewId), reviewSelect.value); }); document.addEventListener('submit', (event) => { const customerForm = event.target.closest('#order-customer-form'); if (customerForm) { event.preventDefault(); saveOrderCustomer(customerForm); } const itemsForm = event.target.closest('#order-items-form'); if (itemsForm) { event.preventDefault(); saveOrderItems(itemsForm); } }); $('#staff-form')?.addEventListener('submit', createStaff); $('#staff-reset')?.addEventListener('click', () => { $('#staff-form')?.reset(); $('#staff-message').textContent = ''; }); $('#customer-search')?.addEventListener('input', debounceCustomerSearch); $('#sheets-refresh')?.addEventListener('click', loadSheets); $('#settings-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target).entries()); try { await api('/admin/settings', { method: 'PUT', body: JSON.stringify(values) }); $('#settings-message').textContent = 'Settings saved.'; toast('Store settings saved'); } catch (error) { $('#settings-message').textContent = error.message; } });
boot();


document.addEventListener('click', (event) => { const editCategory = event.target.closest('[data-edit-category]'); if (editCategory) openCategoryEditor(state.categories.find((category) => Number(category.id) === Number(editCategory.dataset.editCategory))); const toggle = event.target.closest('[data-toggle-category]'); if (toggle) toggleCategory(Number(toggle.dataset.toggleCategory), Number(toggle.dataset.categoryActive)); });
$('#category-form')?.addEventListener('submit', saveCategory);
$('#category-new')?.addEventListener('click', () => openCategoryEditor());
$('#category-reset')?.addEventListener('click', resetCategoryForm);
$('#category-cancel')?.addEventListener('click', resetCategoryForm);
$('#barcode-product-sku')?.addEventListener('change', () => { const product = selectedBarcodeProduct(); if ($('#product-barcode')) $('#product-barcode').value = product?.barcode || ''; renderBarcodePreview(); });
$('#product-barcode')?.addEventListener('input', renderBarcodePreview);
$('#barcode-format')?.addEventListener('change', renderBarcodePreview);
$('#barcode-save-product')?.addEventListener('click', saveBarcodeToProduct); $('#invoice-query-form')?.addEventListener('submit', queryInvoiceByNumber);
$('#barcode-clear-form')?.addEventListener('click', () => { if ($('#barcode-product-sku')) $('#barcode-product-sku').value = ''; if ($('#product-barcode')) $('#product-barcode').value = ''; if ($('#barcode-form-message')) $('#barcode-form-message').textContent = ''; renderBarcodePreview(); });
$('#barcode-download-svg')?.addEventListener('click', () => { const svg = $('#barcode-preview-svg'); if (svg) downloadBlob(new XMLSerializer().serializeToString(svg), 'rinova-product-barcode.svg', 'image/svg+xml'); });
$('#barcode-add-offline')?.addEventListener('click', addOfflineLabel);
$('#offline-label-clear')?.addEventListener('click', () => { state.offlineLabels = []; persistOfflineLabels(); renderOfflineLabels(); });
$('#offline-label-download-csv')?.addEventListener('click', () => downloadOfflineLabels('csv'));
$('#offline-label-download-json')?.addEventListener('click', () => downloadOfflineLabels('json'));
$('#offline-label-print')?.addEventListener('click', printOfflineLabels);
document.addEventListener('click', (event) => { const remove = event.target.closest('[data-offline-remove]'); if (remove) removeOfflineLabel(remove.dataset.offlineRemove); });
document.addEventListener('change', (event) => { const quantity = event.target.closest('[data-offline-quantity]'); if (quantity) updateOfflineQuantity(quantity.dataset.offlineQuantity, quantity.value); });

// A product saved with zero stock still appears in the shop, but "Add to bag" and "Buy now"
// are disabled and the page reads "Stock out". That is correct behaviour and easy to hit by
// accident on a brand-new product, so say it at the point the number is typed.
function renderStockHint() {
  const field = document.querySelector('#product-form [name="stock"]');
  const hint = $('#stock-hint');
  if (!field || !hint) return;
  const empty = Number(field.value || 0) <= 0;
  hint.textContent = empty ? 'Stock is 0 — customers will see "Stock out" and cannot buy this product. Set the quantity you have.' : '';
  hint.classList.toggle('warn', empty);
}
document.querySelector('#product-form [name="stock"]')?.addEventListener('input', renderStockHint);
$('#new-product')?.addEventListener('click', () => setTimeout(renderStockHint, 0));
document.addEventListener('click', (event) => { if (event.target.closest('[data-edit-sku], [data-quick-edit-sku]')) setTimeout(renderStockHint, 0); });


/**
 * Packing an order needs the customer's name, phone and address to paste into the courier's
 * form — nothing else. That used to mean opening the whole edit form, which invites accidental
 * edits to a customer who has not made a mistake. Tapping the invoice number now shows just
 * the copy block; editing stays one button further on, for when something is actually wrong.
 */
function courierCopyText(order) {
  return [order.name, order.phone, [order.address, order.upazila, order.district].map((part) => String(part || '').trim()).filter(Boolean).join(', ')]
    .map((line) => String(line || '').trim()).filter(Boolean).join('\n');
}

function showOrderCopy(orderCode) {
  const order = (state.orders || []).find((entry) => String(entry.orderCode) === String(orderCode));
  if (!order) return;
  let panel = document.getElementById('order-copy-popover');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'order-copy-popover';
    panel.className = 'order-copy-popover';
    document.body.appendChild(panel);
  }
  const text = courierCopyText(order);
  panel.innerHTML = `<div class="order-copy-card" role="dialog" aria-label="Customer details for ${escapeHtml(order.orderCode)}">
    <div class="order-copy-head"><div><strong>${escapeHtml(order.invoiceNumber || order.orderCode)}</strong><small>${escapeHtml(order.orderCode)}</small></div><button type="button" class="icon-action" data-copy-close>Close</button></div>
    <pre class="order-copy-block" id="order-copy-quick">${escapeHtml(text)}</pre>
    <div class="order-copy-actions">
      <button type="button" class="button button-dark" data-copy-quick>Copy details</button>
      <button type="button" class="icon-action" data-order-details="${escapeHtml(order.orderCode)}" data-copy-close>Edit details</button>
      <button type="button" class="icon-action" data-print-order="${escapeHtml(order.orderCode)}">Print invoice</button>
    </div>
  </div>`;
  panel.classList.add('open');
}

document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-order-copy]');
  if (open) showOrderCopy(open.dataset.orderCopy);
  if (event.target.closest('[data-copy-quick]')) copyToClipboard(document.getElementById('order-copy-quick')?.textContent || '', 'Customer details copied');
  const panel = document.getElementById('order-copy-popover');
  if (!panel || !panel.classList.contains('open')) return;
  if (event.target.closest('[data-copy-close]') || event.target === panel) panel.classList.remove('open');
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.getElementById('order-copy-popover')?.classList.remove('open'); });

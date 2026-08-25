const API_BASE = window.location.hostname.includes('localhost') ? 'http://localhost:8787/api' : '/api';
const state = { bag: JSON.parse(localStorage.getItem('rinova-bag') || '[]'), media: [] };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD')}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
function safeMediaUrl(value) { const url = String(value ?? '').trim(); return /^(https:\/\/|\/assets\/)/i.test(url) ? url : ''; }
function parseMedia(product) {
  let parsed = [];
  try { parsed = JSON.parse(product.mediaJson || '[]'); } catch {}
  const stored = Array.isArray(parsed) ? parsed : [];
  const media = stored.map((item) => ({ type: item?.type === 'video' ? 'video' : 'image', url: safeMediaUrl(typeof item === 'string' ? item : item?.url), alt: item?.alt || product.name })).filter((item) => item.url);
  const primary = safeMediaUrl(product.imageUrl);
  if (primary && !media.some((item) => item.url === primary)) media.unshift({ type: 'image', url: primary, alt: product.name });
  return media.length ? media : [{ type: 'image', url: '/assets/beauty-flatlay.jpg', alt: product.name }];
}
async function api(path) { const response = await fetch(`${API_BASE}${path}`); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Product unavailable'); return data; }
function updateBagCount() { $('#detail-bag-count').textContent = state.bag.reduce((sum, item) => sum + Number(item.quantity || 0), 0); }
function addToBag(product, quantity) { const existing = state.bag.find((item) => Number(item.id) === Number(product.id)); if (existing) existing.quantity += quantity; else state.bag.push({ id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl || state.media[0]?.url, quantity }); localStorage.setItem('rinova-bag', JSON.stringify(state.bag)); updateBagCount(); $('#detail-status').textContent = `${product.name} added to your bag.`; }
function mediaStage(item) { if (item.type === 'video') return `<video controls playsinline preload="metadata" poster="${escapeHtml(state.media.find((media) => media.type === 'image')?.url || '')}"><source src="${escapeHtml(item.url)}">Your browser does not support this video.</video>`; return `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || 'Product media')}" />`; }
function selectMedia(index) { const item = state.media[index]; if (!item) return; $('#detail-media-stage').innerHTML = mediaStage(item); document.querySelectorAll('.media-thumb').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === index)); }
function render(product) {
  state.media = parseMedia(product);
  const tiers = (() => { try { return JSON.parse(product.volumeTiersJson || '[]'); } catch { return []; } })();
  const tierText = tiers.length ? `<div class="detail-note"><strong>Volume pricing available.</strong><br>${tiers.map((tier) => `${tier.minQty}+ units · ${money(tier.price)} each`).join(' · ')}</div>` : '';
  const thumbnails = state.media.map((item, index) => `<button class="media-thumb ${index === 0 ? 'active' : ''}" type="button" data-media-index="${index}" aria-label="Show ${item.type} ${index + 1}">${item.type === 'video' ? '<span class="media-play">▶</span>' : `<img src="${escapeHtml(item.url)}" alt="" loading="lazy">`}</button>`).join('');
  $('#detail-root').innerHTML = `<div class="detail-grid"><div class="detail-media"><div id="detail-media-stage" class="detail-media-stage">${mediaStage(state.media[0])}</div>${state.media.length > 1 ? `<div class="media-thumbs" aria-label="Product gallery">${thumbnails}</div>` : ''}</div><section class="detail-copy"><p class="eyebrow">${escapeHtml(product.categoryName || 'Rinova edit')} · ${product.stock > 0 ? 'IN STOCK' : 'SOLD OUT'}</p><h1>${escapeHtml(product.name)}</h1><p>${escapeHtml(product.description || product.shortDescription || 'A thoughtful choice for your everyday ritual.')}</p><div class="detail-price"><strong>${money(product.price)}</strong>${product.compareAtPrice ? `<del>${money(product.compareAtPrice)}</del>` : ''}</div><div class="detail-controls"><input id="detail-quantity" type="number" min="${Math.max(1, Number(product.minOrderQty || 1))}" max="${Math.max(1, Number(product.stock || 0))}" value="${Math.max(1, Number(product.minOrderQty || 1))}" aria-label="Quantity"><button id="detail-add" class="button button-dark" ${product.stock < 1 ? 'disabled' : ''}>Add to bag <span>+</span></button><button id="detail-buy" class="button" ${product.stock < 1 ? 'disabled' : ''}>Buy now <span>→</span></button></div><p id="detail-status" class="detail-status"></p><div class="detail-facts"><div>Weight<strong>${Number(product.weightGrams || 0) ? `${product.weightGrams}g` : '—'}</strong></div><div>Availability<strong>${product.stock > 0 ? `${product.stock} ready to ship` : 'Sold out'}</strong></div><div>Delivery<strong>৳90 Dhaka · ৳150 outside</strong></div><div>Support<strong><a href="https://wa.me/8801738745949">WhatsApp us</a></strong></div></div>${tierText}</section></div>`;
  document.querySelectorAll('[data-media-index]').forEach((button) => button.addEventListener('click', () => selectMedia(Number(button.dataset.mediaIndex))));
  const quantity = () => Math.max(1, Math.min(Number(product.stock || 0), Number($('#detail-quantity').value || 1)));
  $('#detail-add')?.addEventListener('click', () => addToBag(product, quantity()));
  $('#detail-buy')?.addEventListener('click', () => { addToBag(product, quantity()); window.location.href = '/checkout.html'; });
  document.title = `${product.name} · Rinova BD`;
}
(async function boot() { updateBagCount(); try { const slug = new URLSearchParams(window.location.search).get('slug'); if (!slug) throw new Error('Product not found'); const data = await api(`/products/${encodeURIComponent(slug)}`); render(data.product); } catch (error) { $('#detail-root').innerHTML = `<div class="loading">${escapeHtml(error.message)}<br><a class="detail-back" href="/#shop">Return to shop →</a></div>`; } }());

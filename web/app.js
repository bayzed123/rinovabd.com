const API_BASE = window.location.hostname.includes('localhost') ? 'http://localhost:8787/api' : '/api';
const state = { products: [], bag: JSON.parse(localStorage.getItem('rinova-bag') || '[]'), filter: 'all' };
const money = (value) => `৳${Number(value).toLocaleString('en-BD')}`;
const $ = (selector) => document.querySelector(selector);

function track(name, params = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...params });
}
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2600); }
function saveBag() { localStorage.setItem('rinova-bag', JSON.stringify(state.bag)); renderBag(); }

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error('Could not load shop data');
  return response.json();
}

function renderCategories(categories) {
  $('#category-grid').innerHTML = categories.map((category) => `<a class="category-card" href="#shop" data-category="${category.slug}"><img src="${category.imageUrl || '/assets/beauty-flatlay.jpg'}" alt="${category.name}" loading="lazy" /><span>${category.name} <b>↗</b></span></a>`).join('');
  document.querySelectorAll('.category-card').forEach((card) => card.addEventListener('click', () => { state.filter = card.dataset.category; document.querySelectorAll('.filter').forEach((filter) => filter.classList.toggle('active', filter.dataset.filter === state.filter)); renderProducts(); track('category_select', { category: state.filter }); }));
}
function visibleProducts() {
  if (state.filter === 'featured') return state.products.filter((product) => product.featured || product.rating >= 4.8);
  if (state.filter === 'all') return state.products;
  return state.products.filter((product) => product.categorySlug === state.filter);
}
function renderProducts() {
  const products = visibleProducts();
  $('#product-grid').innerHTML = products.length ? products.map((product) => `<article class="product-card"><div class="product-image-wrap"><img class="product-image" src="${product.imageUrl || '/assets/beauty-flatlay.jpg'}" alt="${product.name}" loading="lazy" /><span class="product-badge">${product.stock > 0 ? 'In stock' : 'Sold out'}</span></div><div class="product-info"><span class="product-category">${product.categoryName || 'Rinova edit'} · ★ ${product.rating || 'New'}</span><h3 class="product-name">${product.name}</h3><p class="product-description">${product.description}</p><div class="product-price"><strong>${money(product.price)}</strong>${product.compareAtPrice ? `<del>${money(product.compareAtPrice)}</del>` : ''}</div><div class="product-actions"><button class="product-quick product-add" data-add="${product.id}" ${product.stock < 1 ? 'disabled' : ''}>Add to Cart <span>+</span></button><button class="product-shop-now" data-add="${product.id}" ${product.stock < 1 ? 'disabled' : ''}>Shop Now <span>→</span></button></div></div></article>`).join('') : '<div class="loading">No products in this edit yet.</div>';
  document.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => { addToBag(Number(button.dataset.add)); if (button.classList.contains('product-shop-now')) toggleDrawer(true); }));
}
function addToBag(productId) { const product = state.products.find((item) => item.id === productId); if (!product) return; const existing = state.bag.find((item) => item.id === productId); if (existing) existing.quantity += 1; else state.bag.push({ id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl, quantity: 1 }); saveBag(); toast(`${product.name} added to your bag`); track('add_to_cart', { item_id: product.slug, value: product.price }); }
function removeFromBag(productId) { state.bag = state.bag.filter((item) => item.id !== productId); saveBag(); }
function renderBag() { const totalItems = state.bag.reduce((sum, item) => sum + item.quantity, 0); $('#bag-count').textContent = totalItems; const total = state.bag.reduce((sum, item) => sum + item.price * item.quantity, 0); $('#bag-total').textContent = money(total); $('#bag-items').innerHTML = state.bag.length ? state.bag.map((item) => `<div class="bag-item"><img src="${item.imageUrl}" alt="${item.name}" /><div><strong>${item.name}</strong><small>${item.quantity} × ${money(item.price)}</small></div><button data-remove="${item.id}" aria-label="Remove ${item.name}">×</button></div>`).join('') : '<div class="bag-empty">Your bag is waiting for a little ritual.</div>'; document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => removeFromBag(Number(button.dataset.remove)))); }
function toggleDrawer(open) { $('#bag-drawer').classList.toggle('open', open); $('#bag-drawer').setAttribute('aria-hidden', String(!open)); }
function checkout() { if (!state.bag.length) return toast('Add a product before checkout'); toast('Checkout flow is ready for payment and address details'); track('begin_checkout', { items: state.bag.length }); }

async function init() {
  try { const [categories, products] = await Promise.all([api('/categories'), api('/products')]); renderCategories(categories.categories); state.products = products.products; renderProducts();   } catch (error) {
    const fallbackCategories = ['Skin Care', 'Face Care', 'Face Makeup', 'Eyes Makeup', 'Makeup', 'Hair Care', 'Perfume', 'Kids'].map((name, index) => ({ name, slug: name.toLowerCase().replaceAll(' ', '-'), imageUrl: index % 3 === 0 ? '/assets/skincare-products.jpg' : index % 3 === 1 ? '/assets/beauty-flatlay.jpg' : '/assets/skincare-model.jpg' }));
    const fallbackProducts = [
      { id: 1, name: 'Dew Ritual Hydrating Serum', slug: 'dew-ritual-hydrating-serum', description: 'A lightweight daily serum for soft, hydrated-looking skin.', price: 890, compareAtPrice: 1090, imageUrl: '/assets/skincare-products.jpg', stock: 24, rating: 4.8, categoryName: 'Skin Care', categorySlug: 'skin-care', featured: 1 },
      { id: 2, name: 'Cloud Cleanse Gentle Face Wash', slug: 'cloud-cleanse-gentle-face-wash', description: 'A gentle cleanser for a fresh, comfortable finish.', price: 590, compareAtPrice: 690, imageUrl: '/assets/beauty-flatlay.jpg', stock: 32, rating: 4.7, categoryName: 'Face Care', categorySlug: 'face-care', featured: 1 },
      { id: 3, name: 'Soft Glow SPF 50 Sunscreen', slug: 'soft-glow-spf-50-sunscreen', description: 'A smooth daily sunscreen with a comfortable, non-heavy finish.', price: 780, compareAtPrice: 950, imageUrl: '/assets/skincare-model.jpg', stock: 18, rating: 4.9, categoryName: 'Skin Care', categorySlug: 'skin-care', featured: 1 },
      { id: 4, name: 'Rose Petal Lip Tint', slug: 'rose-petal-lip-tint', description: 'A buildable rosy tint for an effortless everyday look.', price: 450, compareAtPrice: 520, imageUrl: '/assets/beauty-flatlay.jpg', stock: 40, rating: 4.6, categoryName: 'Makeup', categorySlug: 'makeup', featured: 0 },
      { id: 5, name: 'Radiant Glow Makeup Edit', slug: 'radiant-glow-makeup-edit', description: 'A polished makeup edit for radiant everyday looks.', price: 1290, compareAtPrice: 1590, imageUrl: '/assets/rinova-makeup-flatlay-wide.png', stock: 18, rating: 4.8, categoryName: 'Makeup', categorySlug: 'makeup', featured: 1 },
      { id: 6, name: 'The Complete Makeup Collection', slug: 'complete-makeup-collection', description: 'A curated collection of complexion, eye and lip essentials.', price: 1890, compareAtPrice: 2290, imageUrl: '/assets/rinova-makeup-collection.png', stock: 14, rating: 4.9, categoryName: 'Makeup', categorySlug: 'makeup', featured: 1 },
      { id: 7, name: 'Everyday Makeup Essentials', slug: 'everyday-makeup-essentials', description: 'A versatile studio-inspired selection for your daily routine.', price: 1490, compareAtPrice: 1790, imageUrl: '/assets/rinova-makeup-studio.png', stock: 20, rating: 4.7, categoryName: 'Makeup', categorySlug: 'makeup', featured: 1 },
      { id: 8, name: 'Pink Glow Lip & Blush Edit', slug: 'pink-glow-lip-blush-edit', description: 'A soft pink edit of lip colour, gloss and luminous blush.', price: 990, compareAtPrice: 1190, imageUrl: '/assets/rinova-pink-lip-edit.png', stock: 25, rating: 4.8, categoryName: 'Makeup', categorySlug: 'makeup', featured: 1 },
      { id: 9, name: 'Glow Bloom Skincare Duo', slug: 'glow-bloom-skincare-duo', description: 'A radiant skincare pairing for a soft, hydrated-looking finish.', price: 1190, compareAtPrice: 1490, imageUrl: '/assets/rinova-glow-skincare.png', stock: 16, rating: 4.9, categoryName: 'Skin Care', categorySlug: 'skin-care', featured: 1 },
      { id: 10, name: 'Blush & Bloom Gift Set', slug: 'blush-and-bloom-gift-set', description: 'A thoughtful multi-piece self-care set for gifting or your own ritual.', price: 1690, compareAtPrice: 1990, imageUrl: '/assets/rinova-blush-bloom-set.png', stock: 12, rating: 4.8, categoryName: 'Skin Care', categorySlug: 'skin-care', featured: 1 },
      { id: 11, name: 'Beet + Vitamin A Serum Shot', slug: 'beet-vitamin-a-serum-shot', description: 'A targeted serum shot for a smoother, refreshed-looking complexion.', price: 790, compareAtPrice: 950, imageUrl: '/assets/rinova-vitamin-serum.png', stock: 22, rating: 4.7, categoryName: 'Skin Care', categorySlug: 'skin-care', featured: 0 },
      { id: 12, name: 'Rose Water 70% Glow Serum', slug: 'rose-water-70-glow-serum', description: 'A light, luminous serum for a dewy everyday skincare ritual.', price: 890, compareAtPrice: 1090, imageUrl: '/assets/rinova-rose-serum.png', stock: 20, rating: 4.8, categoryName: 'Skin Care', categorySlug: 'skin-care', featured: 0 },
      { id: 13, name: 'Pink Petal Pressed Blush', slug: 'pink-petal-pressed-blush', description: 'A soft pressed blush for a fresh, naturally flushed finish.', price: 590, compareAtPrice: 690, imageUrl: '/assets/rinova-blush-pink-editorial.png', stock: 28, rating: 4.8, categoryName: 'Makeup', categorySlug: 'makeup', featured: 1 },
      { id: 14, name: 'Rose Gold Blush Duo', slug: 'rose-gold-blush-duo', description: 'A luminous blush duo with soft rosy tones for buildable colour.', price: 690, compareAtPrice: 790, imageUrl: '/assets/rinova-blush-duo.png', stock: 24, rating: 4.7, categoryName: 'Makeup', categorySlug: 'makeup', featured: 1 },
      { id: 15, name: 'Marble Rose Baked Blush', slug: 'marble-rose-baked-blush', description: 'A marbled baked blush for a warm, polished everyday glow.', price: 620, compareAtPrice: 750, imageUrl: '/assets/rinova-marble-blush.png', stock: 26, rating: 4.6, categoryName: 'Makeup', categorySlug: 'makeup', featured: 0 }
    ];
    renderCategories(fallbackCategories); state.products = fallbackProducts; renderProducts();
    toast('Preview mode: showing curated Rinova products'); console.error(error);
  }
  renderBag();
}

document.addEventListener('click', (event) => { const action = event.target.closest('[data-action]')?.dataset.action; if (action === 'bag') toggleDrawer(true); if (action === 'close-bag') toggleDrawer(false); if (action === 'checkout') checkout(); if (action === 'search') { const query = window.prompt('Search Rinova'); if (query) { track('search', { query }); toast(`Searching for “${query}”`); } } });
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; document.querySelectorAll('.filter').forEach((filter) => filter.classList.toggle('active', filter === button)); renderProducts(); track('product_filter', { filter: state.filter }); }));
$('#newsletter-form').addEventListener('submit', (event) => { event.preventDefault(); toast('Thank you. You are on the softer list.'); event.target.reset(); track('newsletter_signup'); });
$('#bag-drawer').addEventListener('click', (event) => { if (event.target.id === 'bag-drawer') toggleDrawer(false); });
init();

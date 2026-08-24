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
  $('#product-grid').innerHTML = products.length ? products.map((product) => `<article class="product-card"><div class="product-image-wrap"><img class="product-image" src="${product.imageUrl || '/assets/beauty-flatlay.jpg'}" alt="${product.name}" loading="lazy" /><span class="product-badge">${product.stock > 0 ? 'In stock' : 'Sold out'}</span><button class="product-quick" data-add="${product.id}" ${product.stock < 1 ? 'disabled' : ''}>Add to bag +</button></div><div class="product-info"><span class="product-category">${product.categoryName || 'Rinova edit'} · ★ ${product.rating || 'New'}</span><h3 class="product-name">${product.name}</h3><p class="product-description">${product.description}</p><div class="product-price"><strong>${money(product.price)}</strong>${product.compareAtPrice ? `<del>${money(product.compareAtPrice)}</del>` : ''}</div></div></article>`).join('') : '<div class="loading">No products in this edit yet.</div>';
  document.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addToBag(Number(button.dataset.add))));
}
function addToBag(productId) { const product = state.products.find((item) => item.id === productId); if (!product) return; const existing = state.bag.find((item) => item.id === productId); if (existing) existing.quantity += 1; else state.bag.push({ id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl, quantity: 1 }); saveBag(); toast(`${product.name} added to your bag`); track('add_to_cart', { item_id: product.slug, value: product.price }); }
function removeFromBag(productId) { state.bag = state.bag.filter((item) => item.id !== productId); saveBag(); }
function renderBag() { const totalItems = state.bag.reduce((sum, item) => sum + item.quantity, 0); $('#bag-count').textContent = totalItems; const total = state.bag.reduce((sum, item) => sum + item.price * item.quantity, 0); $('#bag-total').textContent = money(total); $('#bag-items').innerHTML = state.bag.length ? state.bag.map((item) => `<div class="bag-item"><img src="${item.imageUrl}" alt="${item.name}" /><div><strong>${item.name}</strong><small>${item.quantity} × ${money(item.price)}</small></div><button data-remove="${item.id}" aria-label="Remove ${item.name}">×</button></div>`).join('') : '<div class="bag-empty">Your bag is waiting for a little ritual.</div>'; document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => removeFromBag(Number(button.dataset.remove)))); }
function toggleDrawer(open) { $('#bag-drawer').classList.toggle('open', open); $('#bag-drawer').setAttribute('aria-hidden', String(!open)); }
function checkout() { if (!state.bag.length) return toast('Add a product before checkout'); toast('Checkout flow is ready for payment and address details'); track('begin_checkout', { items: state.bag.length }); }

async function init() {
  try { const [categories, products] = await Promise.all([api('/categories'), api('/products')]); renderCategories(categories.categories); state.products = products.products; renderProducts(); } catch (error) { $('#product-grid').innerHTML = '<div class="loading">Shop data is being refreshed. Please try again in a moment.</div>'; console.error(error); }
  renderBag();
}

document.addEventListener('click', (event) => { const action = event.target.closest('[data-action]')?.dataset.action; if (action === 'bag') toggleDrawer(true); if (action === 'close-bag') toggleDrawer(false); if (action === 'checkout') checkout(); if (action === 'search') { const query = window.prompt('Search Rinova'); if (query) { track('search', { query }); toast(`Searching for “${query}”`); } } });
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; document.querySelectorAll('.filter').forEach((filter) => filter.classList.toggle('active', filter === button)); renderProducts(); track('product_filter', { filter: state.filter }); }));
$('#newsletter-form').addEventListener('submit', (event) => { event.preventDefault(); toast('Thank you. You are on the softer list.'); event.target.reset(); track('newsletter_signup'); });
$('#bag-drawer').addEventListener('click', (event) => { if (event.target.id === 'bag-drawer') toggleDrawer(false); });
init();

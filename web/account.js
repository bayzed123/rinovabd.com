const API_BASE = window.location.hostname.includes('localhost') ? 'http://localhost:8787/api' : '/api';
const $ = (selector) => document.querySelector(selector);
const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD')}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const state = { token: localStorage.getItem('rinova-customer-token') || '', customer: null };

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-BD', { day: 'numeric', month: 'short', year: 'numeric' });
}

function orderCard(order) {
  const itemSummary = (order.items || []).map((item) => `${escapeHtml(item.productName)} × ${Number(item.quantity || 0)}`).join(' · ') || 'Product details unavailable';
  const courierStatus = order.courierStatus ? ` · ${escapeHtml(order.courierStatus)}` : '';
  return `<article class="order-row order-card"><div class="order-card-main"><strong>${escapeHtml(order.orderCode)}</strong><small>${formatDate(order.createdAt)} · ${escapeHtml(order.status || 'pending')}${courierStatus}</small><p>${itemSummary}</p></div><div class="order-card-side"><strong>${money(order.total)}</strong><small>${escapeHtml(order.invoiceNumber || 'Invoice pending')}</small><div class="order-card-actions"><a href="/invoice.html?order=${encodeURIComponent(order.orderCode)}">Invoice</a><a href="/track.html?orderId=${encodeURIComponent(order.orderCode)}&invoiceNumber=${encodeURIComponent(order.invoiceNumber || '')}">Track order</a></div></div></article>`;
}

function showApp(customer) {
  state.customer = customer;
  $('#account-auth').hidden = true;
  $('#account-app').hidden = false;
  $('#customer-name').textContent = customer.name ? `${customer.name}` : 'Your account';
  $('#customer-contact').textContent = [customer.phone, customer.email].filter(Boolean).join(' · ');
  loadOrders();
}

function setAuthMode(mode = 'login') {
  const registerMode = mode === 'register';
  $('#login-form').hidden = registerMode;
  $('#register-form').hidden = !registerMode;
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function showAuth() {
  $('#account-auth').hidden = false;
  $('#account-app').hidden = true;
  setAuthMode('login');
}

async function loadOrders() {
  try {
    const data = await api('/account/orders');
    $('#orders-list').innerHTML = data.orders?.length ? data.orders.map(orderCard).join('') : '<p class="muted">আপনার order history এখনো খালি।</p>';
  } catch (error) {
    $('#auth-message').textContent = error.message;
  }
}

async function login(event) {
  event.preventDefault();
  try {
    const data = await api('/account/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
    state.token = data.token;
    localStorage.setItem('rinova-customer-token', state.token);
    showApp(data.customer);
  } catch (error) {
    $('#auth-message').textContent = error.message;
  }
}

async function register(event) {
  event.preventDefault();
  try {
    const data = await api('/account/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
    state.token = data.token;
    localStorage.setItem('rinova-customer-token', state.token);
    showApp(data.customer);
  } catch (error) {
    $('#auth-message').textContent = error.message;
  }
}

async function submitReturn(event) {
  event.preventDefault();
  try {
    const data = await api('/account/returns', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
    $('#return-message').textContent = `Return request ${data.return.returnCode} submitted.`;
    event.target.reset();
  } catch (error) {
    $('#return-message').textContent = error.message;
  }
}

document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
  setAuthMode(button.dataset.tab);
  $('#auth-message').textContent = '';
}));

$('#login-form').addEventListener('submit', login);
$('#register-form').addEventListener('submit', register);
$('#return-form').addEventListener('submit', submitReturn);
$('#account-logout').addEventListener('click', async () => {
  try { await api('/account/logout', { method: 'POST' }); } finally {
    localStorage.removeItem('rinova-customer-token');
    state.token = '';
    showAuth();
  }
});

(async function boot() {
  if (!state.token) return showAuth();
  try {
    const data = await api('/account/me');
    showApp(data.customer);
  } catch {
    localStorage.removeItem('rinova-customer-token');
    state.token = '';
    showAuth();
  }
}());

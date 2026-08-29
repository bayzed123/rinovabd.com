const API_BASE = window.RINOVA_API_BASE || (window.location.hostname.includes('localhost') ? 'http://localhost:8787/api' : '/api');
const bag = JSON.parse(localStorage.getItem('rinova-bag') || '[]');
const $ = (selector) => document.querySelector(selector);
const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD')}`;
const track = (name, params = {}) => window.rinovaAnalytics?.track ? window.rinovaAnalytics.track(name, params) : (window.dataLayer = window.dataLayer || [], window.dataLayer.push({ event: name, ...params }));
const itemPayload = (item) => window.rinovaAnalytics?.item ? window.rinovaAnalytics.item(item, item.quantity) : { item_id: item.id, item_name: item.name, price: Number(item.price || 0), quantity: Number(item.quantity || 1) };
const state = { deliveryFee: 0, zone: '' };

function saveBag() {
  localStorage.setItem('rinova-bag', JSON.stringify(bag));
}

function changeQuantity(productId, direction) {
  const item = bag.find((entry) => Number(entry.id) === Number(productId));
  if (!item) return;
  const minimum = Math.max(1, Number(item.minOrderQty || 1));
  const maximum = Number(item.stock || 0);
  const next = Number(item.quantity || minimum) + direction;
  if (next < minimum) {
    bag.splice(bag.indexOf(item), 1);
  } else {
    item.quantity = maximum ? Math.min(maximum, next) : next;
  }
  saveBag();
  renderItems();
}

function renderItems() {
  $('#order-items').innerHTML = bag.length ? bag.map((item) => `<div class="checkout-item"><div><strong>${item.name}</strong><small>${money(item.price)} each</small></div><div class="checkout-item-actions"><div class="quantity-stepper"><button type="button" data-checkout-qty="${item.id}" data-direction="-1" aria-label="Decrease ${item.name}"><span data-rinova-icon="minus"></span></button><span>${Number(item.quantity || 0)}</span><button type="button" data-checkout-qty="${item.id}" data-direction="1" aria-label="Increase ${item.name}">+</button></div><strong>${money(Number(item.price || 0) * Number(item.quantity || 0))}</strong></div></div>`).join('') : '<p class="muted">Your bag is empty. Return to the shop to add products.</p>';
  const subtotal = bag.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  $('#subtotal').textContent = money(subtotal);
  $('#total').textContent = money(subtotal + state.deliveryFee);
  document.querySelectorAll('[data-checkout-qty]').forEach((button) => button.addEventListener('click', () => changeQuantity(Number(button.dataset.checkoutQty), Number(button.dataset.direction))));
}

function updateDelivery() {
  const address = $('#checkout-form').elements.namedItem('address').value.trim();
  if (!address) {
    state.deliveryFee = 0;
    state.zone = '';
    $('#delivery').textContent = 'Enter address';
    renderItems();
    return;
  }
  const insideDhaka = /\bdhaka\b/i.test(address) || address.includes('ঢাকা');
  state.deliveryFee = insideDhaka ? 90 : 150;
  state.zone = insideDhaka ? 'dhaka' : 'outside-dhaka';
  $('#delivery').textContent = `${money(state.deliveryFee)} · ${insideDhaka ? 'Inside Dhaka' : 'Outside Dhaka'}`;
  renderItems();
}

async function submitOrder(event) {
  event.preventDefault();
  if (!bag.length) return $('#checkout-error').textContent = 'Your bag is empty.';
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
    data.items = bag.map((item) => ({ productId: item.id, quantity: item.quantity }));
    data.paymentMethod = 'cod';
    $('#checkout-error').textContent = '';
  try {
    const response = await fetch(`${API_BASE}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not place order.');
    localStorage.removeItem('rinova-bag');
    $('#checkout-grid').hidden = true;
    $('#success').hidden = false;
    $('#success').innerHTML = `<strong>অর্ডার সফল হয়েছে।</strong><br>Order ID: <strong>${payload.order.orderCode}</strong><br>Invoice: <strong>${payload.order.invoiceNumber || '—'}</strong><br>Total: ${money(payload.order.total)}<br><a class="button" href="/invoice.html?order=${encodeURIComponent(payload.order.orderCode)}">View printable invoice</a> <a class="button" href="/track.html?orderId=${encodeURIComponent(payload.order.orderCode)}&invoiceNumber=${encodeURIComponent(payload.order.invoiceNumber || '')}">Track order</a>`;
    track('purchase', { transaction_id: payload.order.orderCode || payload.order.invoiceNumber, currency: 'BDT', value: Number(payload.order.total || 0), shipping: Number(payload.order.deliveryFee || 0), payment_type: payload.order.paymentMethod || 'cod', items: bag.map(itemPayload) });
  } catch (error) {
    $('#checkout-error').textContent = error.message;
  }
}

$('#checkout-form').addEventListener('submit', submitOrder);
$('#checkout-form').elements.namedItem('address').addEventListener('input', updateDelivery);
renderItems();
if (bag.length) track('view_cart', { currency: 'BDT', value: bag.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0), items: bag.map(itemPayload) });

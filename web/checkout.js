const API_BASE = window.RINOVA_API_BASE || (window.location.hostname.includes('localhost') ? 'http://localhost:8787/api' : '/api');
const bag = JSON.parse(localStorage.getItem('rinova-bag') || '[]');
const $ = (selector) => document.querySelector(selector);
const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD')}`;
const track = (name, params = {}) => window.rinovaAnalytics?.track ? window.rinovaAnalytics.track(name, params) : (window.dataLayer = window.dataLayer || [], window.dataLayer.push({ event: name, ...params }));
const itemPayload = (item) => window.rinovaAnalytics?.item ? window.rinovaAnalytics.item(item, item.quantity) : { item_id: item.sku || item.id, item_name: item.name, price: Number(item.price || 0), quantity: Number(item.quantity || 1) };
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

let districtDebounce;
let upazilaDebounce;

async function fetchLocations(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const response = await fetch(`${API_BASE}/locations?q=${encodeURIComponent(query.trim())}`);
    if (!response.ok) return [];
    const payload = await response.json();
    return payload.locations || [];
  } catch {
    return [];
  }
}

function fillDatalist(datalistId, values) {
  const list = document.getElementById(datalistId);
  if (!list) return;
  const unique = [...new Set(values.filter(Boolean))].slice(0, 20);
  list.innerHTML = unique.map((value) => `<option value="${String(value).replace(/"/g, '&quot;')}"></option>`).join('');
}

function onDistrictInput(event) {
  clearTimeout(districtDebounce);
  const query = event.target.value;
  districtDebounce = setTimeout(async () => {
    const locations = await fetchLocations(query);
    fillDatalist('checkout-district-options', locations.map((location) => location.district));
  }, 200);
  updateDelivery();
}

function onUpazilaInput(event) {
  clearTimeout(upazilaDebounce);
  const query = event.target.value;
  upazilaDebounce = setTimeout(async () => {
    const locations = await fetchLocations(query);
    fillDatalist('checkout-upazila-options', locations.map((location) => location.upazila));
  }, 200);
  updateDelivery();
}

async function updateDelivery() {
  const form = $('#checkout-form');
  const address = form.elements.namedItem('address').value.trim();
  const district = form.elements.namedItem('district').value.trim();
  const upazila = form.elements.namedItem('upazila').value.trim();

  if (district && upazila) {
    try {
      const response = await fetch(`${API_BASE}/delivery-fee?district=${encodeURIComponent(district)}&upazila=${encodeURIComponent(upazila)}`);
      if (response.ok) {
        const payload = await response.json();
        state.deliveryFee = Number(payload.fee || 150);
        state.zone = payload.zone || 'outside-dhaka';
        $('#delivery').textContent = `${money(state.deliveryFee)} · ${payload.label || (state.zone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka')}`;
        renderItems();
        return;
      }
    } catch {
      // Directory lookup failed — fall through to the estimate below instead of blocking checkout.
    }
  }

  if (!district && !address) {
    state.deliveryFee = 0;
    state.zone = '';
    $('#delivery').textContent = 'Select district & upazila';
    renderItems();
    return;
  }
  const referenceText = `${district} ${address}`;
  const insideDhaka = /\bdhaka\b/i.test(referenceText) || referenceText.includes('ঢাকা');
  state.deliveryFee = insideDhaka ? 90 : 150;
  state.zone = insideDhaka ? 'dhaka' : 'outside-dhaka';
  $('#delivery').textContent = `${money(state.deliveryFee)} · ${insideDhaka ? 'Inside Dhaka (estimated)' : 'Outside Dhaka (estimated)'}`;
  renderItems();
}

async function submitOrder(event) {
  event.preventDefault();
  if (!bag.length) return $('#checkout-error').textContent = 'Your bag is empty.';
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
    data.items = bag.map((item) => ({ sku: String(item.sku || '').trim(), quantity: item.quantity }));
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
$('#checkout-form').elements.namedItem('district').addEventListener('input', onDistrictInput);
$('#checkout-form').elements.namedItem('upazila').addEventListener('input', onUpazilaInput);
renderItems();
if (bag.length) track('view_cart', { currency: 'BDT', value: bag.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0), items: bag.map(itemPayload) });
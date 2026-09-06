// Preconditions the suites assert on.
//
// The suites used to assume whatever had accumulated on one developer's machine — a GLOW10
// coupon, sizes priced 390 and 700, delivery at 90/150, a customer called "Support Test". None
// of that exists in a fresh database, so the first CI run failed on data rather than on code.
// Each suite now asks for what it needs, and each helper is safe to call repeatedly.

import { api, adminToken, authHeaders, uniquePhone } from './harness.mjs';

/** The sized product every pricing check is written against: 50g at ৳390, 100g at ৳700. */
export const SIZED_SKU = 'RNV-FC-004';
export const SIZES = [
  { kind: 'size', label: '50g', price: 390, stock: 0 },
  { kind: 'size', label: '100g', price: 700, stock: 0 },
];

export async function seedDeliveryCharges(token, inside = 90, outside = 150) {
  await api.send('/api/admin/settings', 'PUT', {
    delivery_inside_dhaka: String(inside),
    delivery_outside_dhaka: String(outside),
  }, authHeaders(token));
  return { inside, outside };
}

/** bKash advance payment, so the checkout can show its instructions and account number. */
export async function seedBkash(token, number = '01738745949') {
  await api.send('/api/admin/settings', 'PUT', {
    payment_bkash_enabled: 'true',
    bkash_number: number,
    payment_bkash_instructions: 'Advance payment is available through bKash Send Money only. After sending, enter the bKash transaction ID below.',
  }, authHeaders(token));
  return number;
}

/** The sized product, priced and in stock, so variant pricing has something to price. */
export async function seedSizedProduct(token, { price = 390, stock = 500 } = {}) {
  await api.send(`/api/admin/products/sku/${SIZED_SKU}`, 'PATCH', {
    price, discountPercent: 0, discountLabel: '', discountEndsAt: '', variants: SIZES,
  }, authHeaders(token));
  await api.post(`/api/admin/products/sku/${SIZED_SKU}/stock`, { mode: 'set', quantity: stock, reason: 'adjustment' }, authHeaders(token));
  return SIZED_SKU;
}

/**
 * Makes the offer exist, configured the way the caller asked, whatever the database held first.
 *
 * Creating it only when absent is not enough. A "Free delivery" offer set to a ৳1,500 threshold
 * by something else — the demo seeder, a previous experiment, the shop owner — satisfied a
 * create-if-absent check, and the commerce suite then asserted ৳500 behaviour against it and
 * failed on data rather than on code. So a matching row is *reconciled* to what was asked for
 * rather than accepted as-is.
 *
 * Matching is by code for a coupon. An auto-apply offer carries no code at all, so its title is
 * the only thing identifying "the same fixture" between runs — without that, an empty code
 * matched every other empty code and a fresh duplicate stacked up on every repeat run.
 */
export async function seedOffer(token, offer) {
  const wanted = { minSubtotal: 0, usageLimit: 0, autoApply: false, productIds: [], ...offer };
  const existing = await api.get('/api/admin/content', authHeaders(token));
  const match = (existing.json.offers || []).find((row) => (
    offer.code ? String(row.code || '').toUpperCase() === String(offer.code).toUpperCase() : String(row.title || '') === String(offer.title || '')
  ));
  if (!match) {
    await api.post('/api/admin/offers', wanted, authHeaders(token));
    return true;
  }
  await api.send(`/api/admin/offers/${match.id}`, 'PATCH', {
    active: true,
    autoApply: Boolean(wanted.autoApply),
    minSubtotal: Number(wanted.minSubtotal) || 0,
    usageLimit: Number(wanted.usageLimit) || 0,
    productIds: wanted.productIds || [],
    resetUsage: true,
    // A free-delivery offer has no discount value to set, and the route rejects zero on a
    // percentage offer, so only send it when it is a number worth sending.
    ...(Number(wanted.discountValue) > 0 ? { discountValue: Number(wanted.discountValue) } : {}),
  }, authHeaders(token));
  return false;
}

/** The coupon the commerce and dashboard suites both name: 10% off, shop-wide. */
export const seedGlow10 = (token) =>
  seedOffer(token, { code: 'GLOW10', title: '10% off', discountType: 'percentage', discountValue: 10 });

/** An automatic offer that waives delivery once the basket is big enough. */
export const seedAutoFreeDelivery = (token, minSubtotal = 500) =>
  seedOffer(token, { code: '', title: 'Free delivery', discountType: 'free_delivery', discountValue: 0, minSubtotal, autoApply: true });

/**
 * A customer for the support screens to find and act on.
 *
 * Registering matters: an order alone creates a "Guest only" customer, and the dashboard
 * offers a password reset only to someone who has an account. Placing an order too gives the
 * support view something to show alongside them.
 */
export async function seedCustomer(name = 'Support Test') {
  const products = await api.get('/api/products');
  const sku = (products.json.products || products.json)[0]?.sku;
  if (!sku) throw new Error('The catalogue is empty — migrations did not seed any products.');
  const phone = uniquePhone('016');
  const registered = await api.post('/api/account/register', { name, phone, password: 'SupportPass2026' });
  if (registered.status >= 400) throw new Error(`Could not register the support customer: ${JSON.stringify(registered.json)}`);
  await api.post('/api/orders', {
    name, phone, district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'Support House 1',
    paymentMethod: 'cod', items: [{ sku, quantity: 1 }],
  });
  return { name, phone };
}

/**
 * Orders for the dashboard to list.
 *
 * A brand-new shop has none, so every check about order rows, status pills and the copy
 * popover had nothing to read — they only ever passed against a database with months of
 * real orders in it.
 */
export async function seedOrders(count = 3) {
  const products = await api.get('/api/products');
  const catalogue = (products.json.products || products.json).filter((p) => Number(p.stock || 0) > 0);
  if (!catalogue.length) throw new Error('No product is in stock — cannot place a test order.');
  const placed = [];
  for (let i = 0; i < count; i += 1) {
    const product = catalogue[i % catalogue.length];
    const response = await api.post('/api/orders', {
      name: `Order Fixture ${i + 1}`, phone: uniquePhone('015'), district: 'Rajshahi', upazila: 'Rajshahi Sadar',
      address: `Fixture Road ${i + 1}`, paymentMethod: 'cod', items: [{ sku: product.sku, quantity: 1 }],
    });
    if (response.json.order) placed.push(response.json.order);
  }
  if (!placed.length) throw new Error('Could not place any test order.');
  return placed;
}

/** Everything the storefront and dashboard suites expect a working shop to already have. */
export async function seedShop() {
  const token = await adminToken();
  await seedDeliveryCharges(token);
  await seedBkash(token);
  await seedSizedProduct(token);
  await seedGlow10(token);
  await seedAutoFreeDelivery(token);
  return token;
}

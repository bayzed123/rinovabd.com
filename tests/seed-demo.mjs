/**
 * Fills a local shop with believable data for screenshots.
 *
 * Everything here goes through the real API, so the numbers on the dashboard are the shop's own
 * arithmetic on a demonstration dataset — not figures typed into a mock. Nothing in this file
 * ever touches production: it talks to whatever RINOVA_TEST_BASE points at, which is a local
 * `wrangler dev`.
 */
import { api, adminToken, authHeaders, uniquePhone } from './harness.mjs';
import { seedDeliveryCharges, seedBkash, seedSizedProduct, seedGlow10, seedAutoFreeDelivery } from './fixtures.mjs';

const token = await adminToken();
const auth = authHeaders(token);
const say = (...parts) => console.log('·', ...parts);

await seedDeliveryCharges(token);
await seedBkash(token);
await seedSizedProduct(token, { price: 390, stock: 240 });
await seedGlow10(token);
await seedAutoFreeDelivery(token, 1500);
say('settings, payment, sizes and coupons ready');

// Tracking ids so the analytics panel is not an empty form in the screenshot.
await api.send('/api/admin/tracking/settings', 'PUT', {
  gtmId: 'GTM-WN9DK67S', ga4MeasurementId: 'G-4RN0V4BD01', metaPixelId: '1180422733548219', gscSiteUrl: 'https://rinovabd.com',
}, auth);
say('analytics ids set');

// A per-product offer, so the storefront shows a discount badge.
const catalogue = (await api.get('/api/products')).json.products || [];
const featured = catalogue.filter((product) => Number(product.stock) > 0).slice(0, 3);
for (const [index, product] of featured.entries()) {
  await api.send(`/api/admin/products/sku/${encodeURIComponent(product.sku)}`, 'PATCH', {
    discountPercent: [15, 20, 10][index], discountLabel: 'Winter offer', discountEndsAt: '',
  }, auth);
}
say(`discount badges on ${featured.length} products`);

// Orders across every status, so the dashboard pipeline and the status colours have something
// to show. Spread over several days so the revenue chart is a line rather than a dot.
const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'delivered', 'delivered'];
const buyers = [
  ['Nusrat Jahan', 'Dhaka', 'Dhanmondi'], ['Tanvir Ahmed', 'Rajshahi', 'Rajshahi Sadar'],
  ['Sadia Islam', 'Chattogram', 'Kotwali'], ['Rakib Hasan', 'Dhaka', 'Mirpur'],
  ['Farhana Akter', 'Sylhet', 'Sylhet Sadar'], ['Imran Kabir', 'Khulna', 'Khulna Sadar'],
  ['Mim Chowdhury', 'Dhaka', 'Uttara'], ['Arif Mahmud', 'Bogura', 'Bogura Sadar'],
  ['Sharmin Sultana', 'Rangpur', 'Rangpur Sadar'], ['Jahid Hossain', 'Cumilla', 'Cumilla Sadar'],
];

let placed = 0;
for (const [index, [name, district, upazila]] of buyers.entries()) {
  const product = catalogue.filter((entry) => Number(entry.stock) > 0)[index % Math.max(1, catalogue.filter((entry) => Number(entry.stock) > 0).length)];
  if (!product) continue;
  const quantity = index % 3 === 0 ? 2 : 1;
  const response = await api.post('/api/orders', {
    name, phone: uniquePhone('017'), district, upazila,
    address: `House ${10 + index}, Road ${3 + index}`,
    paymentMethod: index % 4 === 0 ? 'bkash' : 'cod',
    items: [{ sku: product.sku, quantity }],
  });
  const order = response.json.order;
  if (!order) continue;
  placed += 1;
  const status = statuses[index % statuses.length];
  if (status !== 'pending') {
    // Walk the order forward the way the dashboard does, one step at a time.
    const path = ['confirmed', 'processing', 'shipped', 'delivered'];
    for (const step of path.slice(0, path.indexOf(status) + 1)) {
      await api.send(`/api/orders/${encodeURIComponent(order.orderCode)}/status`, 'PATCH', { status: step, reason: 'demo data' }, auth);
    }
  }
}
say(`${placed} orders placed across the pipeline`);

// A registered customer, so the customers screen is not empty.
const customerPhone = uniquePhone('018');
await api.post('/api/account/register', { name: 'Nusrat Jahan', phone: customerPhone, password: 'DemoPass2026' });
say('a registered customer exists');

// A campaign built the way the owner builds one, for the Campaign Studio screenshot.
const combo = catalogue.find((product) => product.sku === 'RNV-LP-COMBO-01');
const existing = (await api.get('/api/admin/campaigns', auth)).json.campaigns || [];
if (!existing.some((campaign) => campaign.slug === 'winter-glow-edit')) {
  await api.post('/api/admin/campaigns', {
    title: 'Winter Glow Edit', slug: 'winter-glow-edit',
    eyebrow: 'সীমিত সময়ের অফার',
    description: 'শীতের শুষ্ক ত্বকের জন্য বাছাই করা কম্বো।\nক্যাশ অন ডেলিভারি, সারা বাংলাদেশে।\n১০০% অরিজিনাল প্রোডাক্ট গ্যারান্টি।',
    imageUrl: '/assets/lp-combo.jpg',
    productIds: combo ? [combo.id] : [],
    active: 1,
  }, auth);
}
say('campaign page ready at /campaign/winter-glow-edit');

const overview = await api.get('/api/admin/overview', auth);
say('dashboard reports', JSON.stringify(overview.json.totals || overview.json).slice(0, 200));
console.log('\nDemo shop ready.');

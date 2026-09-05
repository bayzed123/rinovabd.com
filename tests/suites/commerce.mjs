// Coupons, per-size pricing, the editable FAQ and the settings-driven delivery text.
import { chromium } from 'playwright';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';
import { seedAutoFreeDelivery, seedGlow10, seedSizedProduct } from '../fixtures.mjs';


const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };
const post = async (path, body) => { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

// The suite sets up everything it asserts on, so it does not depend on whatever the local
// database happens to hold: distinctive delivery charges to prove the note is dynamic, and
// enough stock that repeated runs cannot drain the test product.
const admin = await (await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }) })).json();
const authed = (path, method, body) => fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify(body) });
await seedSizedProduct(admin.token);
await seedGlow10(admin.token);
await seedAutoFreeDelivery(admin.token);
await authed('/api/admin/settings', 'PUT', { delivery_inside_dhaka: '123', delivery_outside_dhaka: '456' });
await authed('/api/admin/products/sku/RNV-FC-004/stock', 'POST', { mode: 'set', quantity: 500, reason: 'adjustment' });

// ---- API: discount maths -----------------------------------------------------------------
const pct = await post('/api/offers/validate', { subtotal: 1000, deliveryFee: 150, code: 'GLOW10' });
check('A percentage coupon computes the discount', pct.json.discount === 100, `discount ${pct.json.discount}`);
const bad = await post('/api/offers/validate', { subtotal: 1000, deliveryFee: 150, code: 'DOES-NOT-EXIST' });
check('An unknown coupon is refused with a reason', bad.status === 400 && /not valid/i.test(bad.json.error || ''), bad.json.error);
const auto = await post('/api/offers/validate', { subtotal: 600, deliveryFee: 150, code: '' });
check('An auto-apply free-delivery offer zeroes delivery', auto.json.deliveryFee === 0 && auto.json.total === 600);
const under = await post('/api/offers/validate', { subtotal: 100, deliveryFee: 150, code: '' });
check('An auto offer stays off below its minimum subtotal', under.json.discount === 0 && under.json.deliveryFee === 150);

// ---- API: per-variant pricing is decided server-side --------------------------------------
const order = (phone, options, extra = {}) => post('/api/orders', { name: 'Suite', phone, district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'T', paymentMethod: 'cod', items: [{ sku: 'RNV-FC-004', quantity: 1, ...extra, ...(options ? { options } : {}) }] });
const small = await order(`0179${Date.now() % 100000}1`, { size: '50g' });
const large = await order(`0179${Date.now() % 100000}2`, { size: '100g' });
check('The small size is priced from its own variant', small.json.order?.subtotal === 390, `subtotal ${small.json.order?.subtotal}`);
check('The large size is priced from its own variant', large.json.order?.subtotal === 700, `subtotal ${large.json.order?.subtotal}`);
const spoof = await order(`0179${Date.now() % 100000}3`, { size: '100g' }, { price: 1, unitPrice: 1 });
check('A price sent by the browser is ignored', spoof.json.order?.subtotal === 700, `subtotal ${spoof.json.order?.subtotal}`);

// ---- A product priced only by size must never be free ------------------------------------
// Leaving the base price at zero is the natural thing to do when the size decides the price.
// Cards, the detail page and the order must all fall back to the cheapest size, not to zero.
await authed('/api/admin/products/sku/RNV-FC-004', 'PATCH', { price: 0 });
const zeroList = await (await fetch(`${BASE}/api/products`)).json();
const zeroCard = (zeroList.products || zeroList).find((x) => x.sku === 'RNV-FC-004');
check('A card never advertises a sized product as free', Number(zeroCard.price) === 390, `card price ${zeroCard.price}`);
const zeroOrder = await post('/api/orders', { name: 'Zero', phone: `0175${Date.now() % 100000}`, district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'T', paymentMethod: 'cod', items: [{ sku: 'RNV-FC-004', quantity: 1 }] });
check('Ordering without a size is charged the cheapest size, not zero', zeroOrder.json.order?.subtotal === 390, `subtotal ${zeroOrder.json.order?.subtotal}`);
await authed('/api/admin/products/sku/RNV-FC-004', 'PATCH', { price: 390 });

// ---- Admin editing a discounted order with a variant line -------------------------------
// Editing used to rewrite every line at the product's base price, losing the variant, and let
// a discount from the original basket outgrow a shrunken one.
await authed('/api/admin/offers', 'POST', { code: 'SUITEBIG', title: '500 off', discountType: 'fixed', discountValue: 500, minSubtotal: 0, usageLimit: 0, autoApply: false }).catch(() => {});
const made = await post('/api/orders', { name: 'Edit suite', phone: `0177${Date.now() % 100000}`, district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'T', paymentMethod: 'cod', couponCode: 'SUITEBIG', items: [{ sku: 'RNV-FC-004', quantity: 1, options: { size: '100g' } }] });
const madeCode = made.json.order?.orderCode;
check('An order with a fixed coupon records the discount', made.json.order?.discount === 500, `discount ${made.json.order?.discount}`);
const edited = await (await authed(`/api/admin/orders/${madeCode}`, 'PATCH', { items: [{ sku: 'RNV-FC-004', quantity: 1, details: 'Himalaya · Size: 50g' }] })).json();
check('Editing keeps the variant price rather than the base price', edited.subtotal === 390, `subtotal ${edited.subtotal}`);
check('A discount larger than the new basket is clamped', edited.discount === 390 && edited.total >= 0, `discount ${edited.discount} total ${edited.total}`);

const bigger = await post('/api/orders', { name: 'Edit suite 2', phone: `0176${Date.now() % 100000}`, district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'T', paymentMethod: 'cod', items: [{ sku: 'RNV-FC-004', quantity: 2, options: { size: '100g' } }] });
const keptCode = bigger.json.order?.orderCode;
const kept = await (await authed(`/api/admin/orders/${keptCode}`, 'PATCH', { items: [{ sku: 'RNV-FC-004', quantity: 1, details: 'Himalaya · Size: 100g' }] })).json();
check('Reducing a variant line re-prices at that variant', kept.subtotal === 700, `subtotal ${kept.subtotal}`);

// ---- Storefront --------------------------------------------------------------------------
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();

await page.goto(`${BASE}/product.html?slug=himalaya-purifying-neem-face-wash-150ml-green`, { waitUntil: 'networkidle' });
await page.waitForSelector('#detail-price-value', { timeout: 15000 });
const sizeOptions = await page.locator('#detail-size option').allTextContents();
check('Each size shows its own price in the picker', sizeOptions.some((t) => /50g\s*—/.test(t)) && sizeOptions.some((t) => /100g\s*—/.test(t)), sizeOptions.join(' | '));
const basePrice = (await page.locator('#detail-price-value').textContent()).trim();
await page.selectOption('#detail-size', '100g');
await page.waitForTimeout(250);
const bigPrice = (await page.locator('#detail-price-value').textContent()).trim();
check('Choosing a size changes the displayed price', bigPrice !== basePrice && /700/.test(bigPrice), `${basePrice} -> ${bigPrice}`);
await page.selectOption('#detail-size', '50g');
await page.waitForTimeout(250);
check('Choosing the other size changes it back', /390/.test((await page.locator('#detail-price-value').textContent()).trim()));
// The fact line is filled by an async config fetch, so wait for it rather than racing it.
await page.waitForFunction(() => !/Calculated at checkout/.test(document.getElementById('detail-delivery-fact')?.textContent || 'Calculated at checkout'), { timeout: 10000 }).catch(() => {});
const deliveryFact = (await page.locator('#detail-delivery-fact').textContent()).trim();
check('The product delivery fact follows the shop settings', /123/.test(deliveryFact) && /456/.test(deliveryFact), deliveryFact);

// ---- Checkout: coupon box and the settings-driven note ------------------------------------
const products = await (await fetch(`${BASE}/api/products`)).json();
const p = (products.products || products).find((x) => x.sku === 'RNV-FC-004');
await page.goto(`${BASE}/checkout.html`, { waitUntil: 'networkidle' });
await page.evaluate((prod) => localStorage.setItem('rinova-bag', JSON.stringify([{ id: prod.id, sku: prod.sku, slug: prod.slug, name: prod.name, price: prod.price, quantity: 3, stock: prod.stock, minOrderQty: 1 }])), p);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// The shop's charges were set to 123/456 before this run, so the note proves it is reading
// Settings rather than repeating the old hard-coded 90/150 pair.
const note = (await page.locator('#delivery-note').textContent()).trim();
check('The delivery note quotes the owner current charges', /123/.test(note) && /456/.test(note), note.slice(0, 80));

await page.fill('#checkout-coupon', 'GLOW10');
await page.click('#checkout-coupon-apply');
await page.waitForTimeout(900);
const couponMsg = (await page.locator('#checkout-coupon-message').textContent()).trim();
const discountShown = await page.locator('#discount-line').isVisible();
check('A valid coupon reports the saving', /you save/i.test(couponMsg), couponMsg);
check('The discount appears as its own summary line', discountShown);
const totals = await page.evaluate(() => ({ sub: document.getElementById('subtotal').textContent, disc: document.getElementById('discount').textContent, total: document.getElementById('total').textContent }));
check('The total drops by the discount', totals.disc.includes('117') && totals.total.includes('1,053'), JSON.stringify(totals));

await page.fill('#checkout-coupon', 'NOPE-NOPE');
await page.click('#checkout-coupon-apply');
await page.waitForTimeout(900);
check('A bad coupon is rejected in the UI', /not valid/i.test((await page.locator('#checkout-coupon-message').textContent()) || ''));
// No district is entered here, so delivery is still 0 and the total is the bare subtotal.
check('A rejected coupon leaves the total alone', (await page.locator('#total').textContent()).includes('1,170'), await page.locator('#total').textContent());

await browser.close();
// Put the shop's own charges back so the other suites see normal values.
await authed('/api/admin/settings', 'PUT', { delivery_inside_dhaka: '90', delivery_outside_dhaka: '150' });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

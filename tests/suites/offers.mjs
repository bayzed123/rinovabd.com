// Per-product offers, the storefront discount badge, offers scoped to chosen products, and
// stock counted per size.
import { chromium } from 'playwright';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';


const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };
const post = async (path, body) => { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

const admin = await (await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }) })).json();
const authed = async (path, method, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

// The suite sets up everything it asserts on, so it never depends on whatever the local
// database happens to hold from an earlier run.
const OFFER_SKU = 'RNV-FC-001';   // a plain product: gets a 25% offer
const SIZED_SKU = 'RNV-FC-004';   // the sized product: 50g ৳390, 100g ৳700
await authed(`/api/admin/products/sku/${OFFER_SKU}`, 'PATCH', { price: 1000, discountPercent: 25, discountLabel: '', discountEndsAt: '' });
await authed(`/api/admin/products/sku/${SIZED_SKU}`, 'PATCH', { price: 390, discountPercent: 0, discountLabel: '', discountEndsAt: '' });
await authed(`/api/admin/products/sku/${OFFER_SKU}/stock`, 'POST', { mode: 'set', quantity: 500, reason: 'adjustment' });
await authed(`/api/admin/products/sku/${SIZED_SKU}/stock`, 'POST', { mode: 'set', quantity: 500, reason: 'adjustment' });

const catalogue = await (await fetch(`${BASE}/api/products`)).json();
const offerProduct = (catalogue.products || catalogue).find((p) => p.sku === OFFER_SKU);
const sizedProduct = (catalogue.products || catalogue).find((p) => p.sku === SIZED_SKU);

// ---- The API computes and publishes the sale price ----------------------------------------
check('A discounted product publishes its percentage', Number(offerProduct.discountPercent) === 25, `percent ${offerProduct.discountPercent}`);
check('A discounted product publishes the price after the offer', Number(offerProduct.salePrice) === 750, `sale ${offerProduct.salePrice}`);
check('The list price is kept so it can be struck through', Number(offerProduct.wasPrice) === 1000, `was ${offerProduct.wasPrice}`);
check('A product with no offer reports none', Number(sizedProduct.discountPercent) === 0 && Number(sizedProduct.salePrice) === Number(sizedProduct.price));

// ---- The order charges the advertised price, not the list price ----------------------------
const phone = () => `017${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
const order = (items, extra = {}) => post('/api/orders', { name: 'Offer suite', phone: phone(), district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'T', paymentMethod: 'cod', items, ...extra });
const discounted = await order([{ sku: OFFER_SKU, quantity: 2 }]);
check('An order is charged the offer price, not the list price', discounted.json.order?.subtotal === 1500, `subtotal ${discounted.json.order?.subtotal}`);

// An offer that has expired must stop charging the discount, without anyone turning it off.
await authed(`/api/admin/products/sku/${OFFER_SKU}`, 'PATCH', { discountEndsAt: '2020-01-01' });
const expiredList = await (await fetch(`${BASE}/api/products`)).json();
const expiredCard = (expiredList.products || expiredList).find((p) => p.sku === OFFER_SKU);
check('An expired offer stops showing on the card', Number(expiredCard.discountPercent) === 0 && Number(expiredCard.salePrice) === 1000, `sale ${expiredCard.salePrice}`);
const afterExpiry = await order([{ sku: OFFER_SKU, quantity: 1 }]);
check('An expired offer stops discounting the order', afterExpiry.json.order?.subtotal === 1000, `subtotal ${afterExpiry.json.order?.subtotal}`);
await authed(`/api/admin/products/sku/${OFFER_SKU}`, 'PATCH', { discountEndsAt: '' });

// A percentage out of range must not be stored as given.
await authed(`/api/admin/products/sku/${OFFER_SKU}`, 'PATCH', { discountPercent: 400 });
const clampedList = await (await fetch(`${BASE}/api/products`)).json();
const clamped = (clampedList.products || clampedList).find((p) => p.sku === OFFER_SKU);
check('An absurd percentage is clamped rather than giving goods away', Number(clamped.discountPercent) === 99 && Number(clamped.salePrice) === 10, `percent ${clamped.discountPercent} sale ${clamped.salePrice}`);
await authed(`/api/admin/products/sku/${OFFER_SKU}`, 'PATCH', { discountPercent: 25 });

// ---- An offer limited to chosen products ---------------------------------------------------
const code = `SCOPE${Math.floor(Math.random() * 100000)}`;
await authed('/api/admin/offers', 'POST', { code, title: 'Face wash only', discountType: 'percentage', discountValue: 50, minSubtotal: 0, usageLimit: 0, autoApply: false, productIds: [offerProduct.id] });
// 1 × the covered product (৳750) + 1 × another (৳390) = ৳1,140. Half of the covered part is ৳375.
const scoped = await post('/api/offers/validate', { deliveryFee: 100, code, items: [{ sku: OFFER_SKU, quantity: 1 }, { sku: SIZED_SKU, quantity: 1 }] });
check('A scoped coupon discounts only its own products', scoped.json.discount === 375, `discount ${scoped.json.discount} of subtotal ${scoped.json.subtotal}`);
const scopedOrder = await order([{ sku: OFFER_SKU, quantity: 1 }, { sku: SIZED_SKU, quantity: 1 }], { couponCode: code });
check('The order applies the same scoped discount', scopedOrder.json.order?.discount === 375, `discount ${scopedOrder.json.order?.discount}`);
const wrongBag = await post('/api/offers/validate', { deliveryFee: 100, code, items: [{ sku: SIZED_SKU, quantity: 1 }] });
check('A scoped coupon is refused when none of its products are in the bag', wrongBag.status === 400 && /selected products/i.test(wrongBag.json.error || ''), wrongBag.json.error);
const wrongOrder = await order([{ sku: SIZED_SKU, quantity: 1 }], { couponCode: code });
check('The order refuses it too, rather than discounting the wrong goods', wrongOrder.status === 400, `${wrongOrder.status} ${wrongOrder.json.error || ''}`);

// A whole-shop coupon must keep working exactly as before.
const shopCode = `SHOP${Math.floor(Math.random() * 100000)}`;
await authed('/api/admin/offers', 'POST', { code: shopCode, title: 'Everything', discountType: 'percentage', discountValue: 10, minSubtotal: 0, usageLimit: 0, autoApply: false, productIds: [] });
const shopWide = await post('/api/offers/validate', { deliveryFee: 100, code: shopCode, items: [{ sku: OFFER_SKU, quantity: 1 }, { sku: SIZED_SKU, quantity: 1 }] });
check('An offer naming no products still covers the whole bag', shopWide.json.discount === 114, `discount ${shopWide.json.discount} of ${shopWide.json.subtotal}`);

// ---- Stock counted per size ----------------------------------------------------------------
await authed(`/api/admin/products/sku/${SIZED_SKU}`, 'PATCH', { variants: [{ kind: 'size', label: '50g', price: 390, stock: 2 }, { kind: 'size', label: '100g', price: 700, stock: 9 }] });
const overSize = await order([{ sku: SIZED_SKU, quantity: 3, options: { size: '50g' } }]);
check('A size cannot be oversold from the product total', overSize.status === 400 && /only 2 left/i.test(overSize.json.error || ''), overSize.json.error);
const withinSize = await order([{ sku: SIZED_SKU, quantity: 2, options: { size: '50g' } }]);
check('Ordering within a size succeeds', withinSize.json.order?.subtotal === 780, `subtotal ${withinSize.json.order?.subtotal}`);
const drained = await (await authed(`/api/admin/products/sku/${SIZED_SKU}/detail`, 'GET')).json;
const small = (drained.variants || []).find((v) => v.label === '50g');
check('That size counts down after the order', Number(small?.stock) === 0, `50g stock ${small?.stock}`);
const soldOut = await order([{ sku: SIZED_SKU, quantity: 1, options: { size: '50g' } }]);
check('A sold-out size is refused while others are still available', soldOut.status === 400 && /sold out/i.test(soldOut.json.error || ''), soldOut.json.error);
const otherSize = await order([{ sku: SIZED_SKU, quantity: 1, options: { size: '100g' } }]);
check('The size that still has stock can still be ordered', otherSize.json.order?.subtotal === 700, `subtotal ${otherSize.json.order?.subtotal}`);

// ---- Storefront ----------------------------------------------------------------------------
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.removeItem('rinova-bag'));
await page.waitForSelector('.product-card', { timeout: 15000 });
// `state` is a top-level const in a classic script, so it is not on window; find the card by
// the product's name instead of reaching into the page's internals.
const card = await page.evaluate((name) => {
  const match = [...document.querySelectorAll('.product-card')].find((n) => n.textContent.includes(name));
  return match ? { text: match.querySelector('.product-price').textContent.trim(), badge: match.querySelector('.badge-offer')?.textContent.trim() || '' } : null;
}, offerProduct.name);
check('The card shows the discounted price', card && /৳750/.test(card.text), card?.text);
check('The card strikes through the old price', card && /৳1,000/.test(card.text), card?.text);
check('The card carries an offer badge', card && /25/.test(card.badge), card?.badge);

await page.goto(`${BASE}/product.html?slug=${offerProduct.slug}`, { waitUntil: 'networkidle' });
await page.waitForSelector('#detail-price-value', { timeout: 15000 });
const detail = await page.evaluate(() => ({
  now: document.getElementById('detail-price-value').textContent.trim(),
  was: document.getElementById('detail-price-was')?.hidden ? '' : document.getElementById('detail-price-was')?.textContent.trim(),
  chip: document.querySelector('.detail-price .price-off')?.textContent.trim() || '',
}));
check('The product page shows the discounted price', /750/.test(detail.now), detail.now);
check('The product page strikes through the old price', /1,000/.test(detail.was || ''), detail.was);
check('The product page names the saving', /25/.test(detail.chip), detail.chip);

// The bag has to carry the price the customer just read, or the total will not match the order.
await page.click('#detail-add');
await page.waitForTimeout(400);
const bagged = await page.evaluate(() => JSON.parse(localStorage.getItem('rinova-bag') || '[]')[0]);
check('The bag stores the discounted price', Number(bagged?.price) === 750, `bag price ${bagged?.price}`);

// The sold-out size must be visibly unavailable, not merely rejected after the customer tries.
await page.goto(`${BASE}/product.html?slug=${sizedProduct.slug}`, { waitUntil: 'networkidle' });
await page.waitForSelector('#detail-size', { timeout: 15000 });
const sizes = await page.evaluate(() => [...document.querySelectorAll('#detail-size option')].map((o) => ({ label: o.textContent.trim(), disabled: o.disabled })));
check('A sold-out size is marked and cannot be chosen', sizes.some((s) => /50g/.test(s.label) && s.disabled && /sold out/i.test(s.label)), JSON.stringify(sizes));
check('A size with stock stays selectable', sizes.some((s) => /100g/.test(s.label) && !s.disabled), JSON.stringify(sizes));

// ---- Checkout: an automatic offer is visible before the order, and names itself -------------
await authed('/api/admin/offers', 'POST', { code: '', title: 'Suite auto gift', discountType: 'percentage', discountValue: 5, minSubtotal: 100, usageLimit: 0, autoApply: true, productIds: [] });
await page.goto(`${BASE}/checkout.html`, { waitUntil: 'networkidle' });
await page.evaluate((prod) => localStorage.setItem('rinova-bag', JSON.stringify([{ id: prod.id, sku: prod.sku, slug: prod.slug, name: prod.name, price: prod.salePrice, quantity: 1, stock: prod.stock, minOrderQty: 1 }])), offerProduct);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const auto = await page.evaluate(() => ({
  message: document.getElementById('checkout-coupon-message')?.textContent.trim() || '',
  label: document.getElementById('discount-label')?.textContent.trim() || '',
  shown: !document.getElementById('discount-line')?.hidden,
  total: document.getElementById('total')?.textContent.trim(),
}));
check('An automatic offer is shown before the order is placed', auto.shown, JSON.stringify(auto));
check('It names which offer won', /suite auto gift/i.test(auto.message) || /suite auto gift/i.test(auto.label), `${auto.message} | ${auto.label}`);
check('The total already reflects it', /712/.test(auto.total || ''), auto.total);

// ---- The dashboard: the offer section and the size stock box --------------------------------
const errors = [];
const NOISE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|googletagmanager|jsdelivr|smartgentools|ERR_BLOCKED/i;
const dash = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await dash.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const board = await dash.newPage();
board.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text()); });
await board.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
await board.fill('#login-username', ADMIN_USERNAME);
await board.fill('#login-password', ADMIN_PASSWORD);
await board.click('#login-form button[type=submit]');
await board.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 });
await board.click('[data-admin-mode="edit"]');
await board.click('.nav-item[data-view="products"]');
await board.waitForSelector('#products-table [data-edit-sku]', { timeout: 15000 });
await board.click(`[data-edit-sku="${SIZED_SKU}"]`);
await board.waitForTimeout(1500);

check('The editor has an offer percentage box', await board.locator('#product-discount-percent').count() === 1);
check('The editor has a badge wording box', await board.locator('#product-discount-label').count() === 1);
check('The editor has an offer end date', await board.locator('#product-discount-ends').count() === 1);
check('Each size has a quantity box beside its price', await board.locator('[data-variant-stock]').count() >= 2, `${await board.locator('[data-variant-stock]').count()} stock boxes`);
const savedStock = await board.locator('[data-variant-stock="100g"]').inputValue();
check('The saved per-size stock is read back into the editor', savedStock === '8', `100g shows ${savedStock}`);

await board.fill('#product-discount-percent', '30');
await board.waitForTimeout(300);
const preview = (await board.locator('#product-offer-preview').textContent()).trim();
check('The editor previews what the offer does to the price', /273/.test(preview), preview.slice(0, 90));

// Saving through the editor must reach the storefront.
await board.fill('#product-discount-label', 'Suite sale');
await board.click('#product-submit');
await board.waitForTimeout(2000);
const savedList = await (await fetch(`${BASE}/api/products`)).json();
const saved = (savedList.products || savedList).find((p) => p.sku === SIZED_SKU);
check('An offer set in the editor reaches the storefront', Number(saved.discountPercent) === 30 && Number(saved.salePrice) === 273, `percent ${saved.discountPercent} sale ${saved.salePrice}`);
check('The badge wording set in the editor is used', String(saved.discountLabel) === 'Suite sale', saved.discountLabel);
check('Saving the editor keeps the per-size stock', Number(((await (await authed(`/api/admin/products/sku/${SIZED_SKU}/detail`, 'GET')).json).variants || []).find((v) => v.label === '100g')?.stock) === 8);

// The offer form can search the catalogue and pick which products an offer covers.
await board.click('.nav-item[data-view="cms"]');
await board.waitForTimeout(2000);
await board.fill('#offer-product-search', OFFER_SKU);
await board.waitForTimeout(500);
check('Searching the catalogue by SKU finds that product', await board.locator('[data-offer-product-add]').count() === 1, `${await board.locator('[data-offer-product-add]').count()} results`);
await board.locator('[data-offer-product-add]').first().click();
await board.waitForTimeout(300);
check('A chosen product appears as a removable chip', await board.locator('[data-offer-product-remove]').count() === 1);
check('The chip names the product that was picked', (await board.locator('[data-offer-product-remove]').textContent()).includes(offerProduct.name), await board.locator('[data-offer-product-remove]').textContent());

const pickCode = `PICK${Math.floor(Math.random() * 100000)}`;
await board.fill('#cms-offer-form [name="title"]', 'Picked products');
await board.selectOption('#cms-offer-form [name="discountType"]', 'percentage');
await board.fill('#cms-offer-form [name="discountValue"]', '20');
await board.fill('#cms-offer-form [name="code"]', pickCode);
await board.click('#cms-offer-form button[type=submit]');
await board.waitForTimeout(2000);
check('Saving says how many products the offer covers', /covers 1 product/i.test(await board.locator('#cms-offer-message').textContent()), (await board.locator('#cms-offer-message').textContent()).slice(0, 70));
check('The offer list says what each offer covers', /Only:|Whole shop/.test(await board.locator('#cms-offer-list').textContent()));
check('The picked products are cleared for the next offer', await board.locator('[data-offer-product-remove]').count() === 0);

// And the saved coupon really is limited to the product that was picked.
const picked = await post('/api/offers/validate', { deliveryFee: 0, code: pickCode, items: [{ sku: OFFER_SKU, quantity: 1 }, { sku: SIZED_SKU, quantity: 1 }] });
check('The coupon picked in the dashboard only discounts that product', picked.json.discount === 150, `discount ${picked.json.discount} of ${picked.json.subtotal}`);

check('No console errors in the dashboard', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
// Leave the shop as the other suites expect to find it. The auto-apply offer especially: left
// behind it would silently discount every order the next suite places.
const SUITE_TITLES = ['Face wash only', 'Everything', 'Suite auto gift', 'Picked products'];
const remaining = await (await authed('/api/admin/content', 'GET')).json;
for (const offer of remaining.offers || []) {
  if (SUITE_TITLES.includes(String(offer.title || ''))) await authed(`/api/admin/offers/${offer.id}`, 'DELETE');
}
// Leave the catalogue as the other suites expect to find it.
await authed(`/api/admin/products/sku/${OFFER_SKU}`, 'PATCH', { discountPercent: 0, discountLabel: '', discountEndsAt: '' });
await authed(`/api/admin/products/sku/${SIZED_SKU}`, 'PATCH', { discountPercent: 0, discountLabel: '', discountEndsAt: '', variants: [{ kind: 'size', label: '50g', price: 390, stock: 0 }, { kind: 'size', label: '100g', price: 700, stock: 0 }] });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

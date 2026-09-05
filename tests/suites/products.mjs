// Creating a product, and the bulk discount that comes with it.
//
// Nothing covered product creation, which is how a mismatched INSERT — 28 columns against 27
// values — shipped and made "Create product" fail with "Something went wrong" for every new
// product. The dashboard form is the path the owner actually uses, so that is the path checked.
import { chromium } from 'playwright';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD, api, adminToken, authHeaders, uniquePhone, createChecker, collectConsoleErrors } from '../harness.mjs';

const { check, finish } = createChecker();
const token = await adminToken();
const stamp = Date.now().toString(36).slice(-5);

// ---- The API path -----------------------------------------------------------------------
const apiSku = `RNV-API-${stamp}`;
const created = await api.post('/api/admin/products', {
  name: `API Product ${stamp}`, sku: apiSku, price: 500, costPrice: 200, stock: 40, status: 'active',
  volumeTiers: [{ minQty: 3, price: 450 }, { minQty: 6, price: 400 }],
}, authHeaders(token));
check('A product can be created', created.status === 201 && created.json.ok === true, `HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 140)}`);
check('It comes back with a slug to visit', Boolean(created.json.product?.slug), JSON.stringify(created.json.product || {}));

// Creating with an offer set must work too — those columns are what broke the insert.
const offerSku = `RNV-OFF-${stamp}`;
const withOffer = await api.post('/api/admin/products', {
  name: `Offer Product ${stamp}`, sku: offerSku, price: 1000, costPrice: 400, stock: 10, status: 'active',
  discountPercent: 20, discountLabel: 'Launch offer', discountEndsAt: '',
}, authHeaders(token));
check('A product can be created with an offer already set', withOffer.status === 201, `HTTP ${withOffer.status} ${JSON.stringify(withOffer.json).slice(0, 140)}`);
const listed = await api.get('/api/products');
const offerRow = (listed.json.products || []).find((p) => p.sku === offerSku);
check('That offer reaches the storefront on the first save', Number(offerRow?.discountPercent) === 20 && Number(offerRow?.salePrice) === 800, `percent ${offerRow?.discountPercent} sale ${offerRow?.salePrice}`);

// ---- The bulk discount actually charges less -----------------------------------------------
const order = (sku, quantity) => api.post('/api/orders', {
  name: 'Tier Test', phone: uniquePhone('017'), district: 'Rajshahi', upazila: 'Rajshahi Sadar',
  address: 'Tier Road 1', paymentMethod: 'cod', items: [{ sku, quantity }],
});
const one = await order(apiSku, 1);
const three = await order(apiSku, 3);
const six = await order(apiSku, 6);
check('Below the first tier the customer pays the normal price', one.json.order?.subtotal === 500, `subtotal ${one.json.order?.subtotal}`);
check('At the first tier every unit drops to that price', three.json.order?.subtotal === 1350, `subtotal ${three.json.order?.subtotal} (expected 3 × 450)`);
check('At the second tier it drops again', six.json.order?.subtotal === 2400, `subtotal ${six.json.order?.subtotal} (expected 6 × 400)`);
// The tier is a negotiated price, so a bigger order must never cost more than a smaller one.
check('Buying more never costs more in total', six.json.order?.subtotal >= three.json.order?.subtotal && (six.json.order?.subtotal / 6) < (three.json.order?.subtotal / 3), 'per-unit price falls as quantity rises');

// A tier the browser invents must not be honoured.
const spoofed = await api.post('/api/orders', {
  name: 'Tier Spoof', phone: uniquePhone('017'), district: 'Rajshahi', upazila: 'Rajshahi Sadar',
  address: 'Tier Road 2', paymentMethod: 'cod', items: [{ sku: apiSku, quantity: 1, price: 1, unitPrice: 1 }],
});
check('A price sent by the browser is still ignored', spoofed.json.order?.subtotal === 500, `subtotal ${spoofed.json.order?.subtotal}`);

// ---- The dashboard form, which is the path the owner uses -----------------------------------
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();
const errors = collectConsoleErrors(page);

await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
await page.fill('#login-username', ADMIN_USERNAME);
await page.fill('#login-password', ADMIN_PASSWORD);
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 });
await page.click('[data-admin-mode="edit"]');
await page.click('.nav-item[data-view="products"]');
await page.waitForTimeout(1200);
await page.click('#new-product');
await page.waitForTimeout(800);

const formSku = `RNV-UI-${stamp}`;
await page.fill('#product-form [name="name"]', `Dashboard Product ${stamp}`);
await page.fill('#product-form [name="sku"]', formSku);
await page.fill('#product-form [name="costPrice"]', '200');
await page.fill('#product-form [name="price"]', '600');
await page.fill('#product-form [name="stock"]', '25');
await page.selectOption('#product-form [name="status"]', 'active');

// The bulk discount editor: add two rows and fill them.
await page.click('#tier-add');
await page.waitForTimeout(200);
await page.click('#tier-add');
await page.waitForTimeout(200);
const tierRows = await page.locator('[data-tier-qty]').count();
check('The bulk discount editor adds a row per click', tierRows === 2, `${tierRows} rows`);
await page.fill('[data-tier-qty="0"]', '4');
await page.fill('[data-tier-price="0"]', '540');
await page.fill('[data-tier-qty="1"]', '10');
await page.fill('[data-tier-price="1"]', '480');
await page.waitForTimeout(300);

await page.click('#product-submit');
await page.waitForTimeout(2500);
const message = (await page.locator('#product-form-message').textContent() || '').trim();
check('Saving a new product from the dashboard succeeds', /created successfully/i.test(message), message.slice(0, 120));
check('It does not say something went wrong', !/went wrong|try again/i.test(message), message.slice(0, 120));

// What was typed into the form has to be what the shop charges.
const savedList = await api.get('/api/admin/products?q=Dashboard%20Product', authHeaders(token));
const saved = (savedList.json.products || []).find((p) => p.sku === formSku);
check('The new product is in the catalogue', Boolean(saved), formSku);
let savedTiers = [];
try { savedTiers = JSON.parse(saved?.volumeTiersJson || '[]'); } catch { savedTiers = []; }
check('Both bulk prices were saved', savedTiers.length === 2 && savedTiers[0].minQty === 4 && savedTiers[0].price === 540 && savedTiers[1].minQty === 10 && savedTiers[1].price === 480, JSON.stringify(savedTiers));
const uiFour = await order(formSku, 4);
check('An order at that quantity is charged the bulk price', uiFour.json.order?.subtotal === 2160, `subtotal ${uiFour.json.order?.subtotal} (expected 4 × 540)`);

// Reopening the product must show the bulk prices back, not an empty editor.
await page.click('.nav-item[data-view="products"]');
await page.waitForTimeout(1200);
await page.fill('#product-search', formSku);
await page.waitForTimeout(1200);
await page.click(`[data-edit-sku="${formSku}"]`);
await page.waitForTimeout(1500);
const reopened = await page.evaluate(() => [...document.querySelectorAll('[data-tier-qty]')].map((input, index) => ({
  minQty: input.value, price: document.querySelector(`[data-tier-price="${index}"]`)?.value,
})));
check('Reopening the product shows its bulk prices again', reopened.length === 2 && reopened[0].minQty === '4' && reopened[0].price === '540', JSON.stringify(reopened));

// Removing a row must actually remove it, and save that way.
await page.click('[data-tier-remove="1"]');
await page.waitForTimeout(400);
check('Remove takes a bulk price row away', await page.locator('[data-tier-qty]').count() === 1, `${await page.locator('[data-tier-qty]').count()} rows left`);
await page.click('#product-submit');
await page.waitForTimeout(2000);
const afterEdit = await api.get('/api/admin/products?q=Dashboard%20Product', authHeaders(token));
let editedTiers = [];
try { editedTiers = JSON.parse((afterEdit.json.products || []).find((p) => p.sku === formSku)?.volumeTiersJson || '[]'); } catch { editedTiers = []; }
check('The removed row is gone after saving', editedTiers.length === 1 && editedTiers[0].minQty === 4, JSON.stringify(editedTiers));
const afterRemoval = await order(formSku, 10);
check('The removed tier no longer applies to an order', afterRemoval.json.order?.subtotal === 5400, `subtotal ${afterRemoval.json.order?.subtotal} (expected 10 × 540)`);

check('No console errors while creating a product', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
finish();

// What a staff login can and cannot do.
//
// A staff account could reach 62 of the 66 dashboard endpoints — it could change the delivery
// charges, invent a coupon, or read the courier API keys. "Limited access" has to mean the
// server refuses, not just that the dashboard hides the button, so every check here is made
// with a staff token straight against the API.
import { chromium } from 'playwright';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD, api, adminToken, authHeaders, createChecker } from '../harness.mjs';

const { check, finish } = createChecker();
const owner = await adminToken();
const ownerAuth = authHeaders(owner);
const stamp = Date.now().toString(36).slice(-6);
const staffName = `staff${stamp}`;
const staffPassword = 'StaffPass2026';

// ---- Only the owner may create a login ------------------------------------------------------
const created = await api.post('/api/admin/staff', {
  username: staffName, displayName: 'Shop Assistant', password: staffPassword,
  securityQuestion: "Mother's name", securityAnswer: 'Rajshahi',
}, ownerAuth);
check('The owner can create a staff login', created.status === 201, `HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 120)}`);

const signIn = await api.post('/api/admin/login', { username: staffName, password: staffPassword });
check('The staff member can sign in', signIn.status === 200 && Boolean(signIn.json.token), `HTTP ${signIn.status}`);
check('And is told they are staff, not owner', signIn.json.role === 'staff', `role ${signIn.json.role}`);
const staffAuth = authHeaders(signIn.json.token);

const staffMakingStaff = await api.post('/api/admin/staff', {
  username: `sneaky${stamp}`, password: 'AnotherPass2026', securityQuestion: "Mother's name", securityAnswer: 'x',
}, staffAuth);
check('Staff cannot create another login', staffMakingStaff.status === 403, `HTTP ${staffMakingStaff.status}`);
check('Staff cannot list the logins', (await api.get('/api/admin/staff', staffAuth)).status === 403);

// ---- Anything that moves money or holds a credential is the owner's --------------------------
const refused = [
  ['change the delivery charges', await api.send('/api/admin/settings', 'PUT', { delivery_inside_dhaka: '1' }, staffAuth)],
  ['create a discount', await api.post('/api/admin/offers', { code: `SNEAK${stamp}`, title: 'x', discountType: 'percentage', discountValue: 90 }, staffAuth)],
  ['read the courier API keys', await api.get('/api/admin/steadfast/config', staffAuth)],
  ['test the courier credentials', await api.post('/api/admin/steadfast/test', {}, staffAuth)],
  ['change the analytics settings', await api.send('/api/admin/tracking/settings', 'PUT', {}, staffAuth)],
  ['see which credentials are configured', await api.get('/api/admin/integrations/status', staffAuth)],
  ['open the business data exports', await api.get('/api/admin/sheets', staffAuth)],
];
for (const [what, response] of refused) {
  check(`Staff cannot ${what}`, response.status === 403, `HTTP ${response.status}`);
}

// The refusal has to actually protect the value, not merely return 403 after writing.
const chargesAfter = await api.get('/api/config');
check('The delivery charge really was not changed', Number(chargesAfter.json.delivery?.dhaka) !== 1, `inside Dhaka is ${chargesAfter.json.delivery?.dhaka}`);
const offersAfter = await api.get('/api/admin/content', ownerAuth);
check('The discount really was not created', !(offersAfter.json.offers || []).some((o) => o.code === `SNEAK${stamp}`.toUpperCase()));

// ---- But staff must still be able to run the shop ---------------------------------------------
const allowed = [
  ['see the orders', await api.get('/api/admin/orders', staffAuth)],
  ['see the products', await api.get('/api/admin/products', staffAuth)],
  ['see the customers', await api.get('/api/admin/customers', staffAuth)],
  ['see the returns', await api.get('/api/admin/returns', staffAuth)],
  ['see the reviews', await api.get('/api/admin/reviews', staffAuth)],
  ['read the shop settings', await api.get('/api/admin/settings', staffAuth)],
  ['use the till', await api.get('/api/admin/pos/products', staffAuth)],
];
for (const [what, response] of allowed) {
  check(`Staff can still ${what}`, response.status === 200, `HTTP ${response.status}`);
}

// The day-to-day jobs: adjusting stock and moving an order along.
const products = await api.get('/api/admin/products', staffAuth);
const sku = (products.json.products || [])[0]?.sku;
const stockChange = await api.post(`/api/admin/products/sku/${encodeURIComponent(sku)}/stock`, { mode: 'delta', quantity: 1, reason: 'adjustment' }, staffAuth);
check('Staff can adjust stock', stockChange.status === 200, `HTTP ${stockChange.status}`);

const orders = await api.get('/api/admin/orders', staffAuth);
const orderCode = (orders.json.orders || [])[0]?.orderCode;
if (orderCode) {
  const moved = await api.send(`/api/orders/${encodeURIComponent(orderCode)}/status`, 'PATCH', { status: 'confirmed', reason: 'staff test' }, staffAuth);
  check('Staff can move an order along', moved.status === 200, `HTTP ${moved.status}`);
} else {
  check('Staff can move an order along', false, 'no order to move — seed one first');
}

// ---- And the dashboard should not show them what they cannot use -----------------------------
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();
const warnings = [];
page.on('console', (m) => { if (m.type() === 'warning' && /selectors that match nothing/i.test(m.text())) warnings.push(m.text()); });

const signInAs = async (username, password) => {
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(900);
};
const visible = (selector) => page.evaluate((s) => { const n = document.querySelector(s); return Boolean(n) && !n.hidden; }, selector);

await signInAs(staffName, staffPassword);
check('A staff sign-in does not show the Settings menu', !(await visible('.nav-item[data-view="settings"]')));
check('Nor the settings form', !(await visible('#settings-form')));
check('Nor the courier credentials panel', !(await visible('#steadfast-panel')));
check('Nor the form for creating discounts', !(await visible('#cms-offer-form')));
check('Nor the business data export links', !(await visible('#sheets-list')));
check('Every owner-only selector matched something', warnings.length === 0, warnings[0] || '');

// The owner must lose nothing by this.
await signInAs(ADMIN_USERNAME, ADMIN_PASSWORD);
check('The owner still sees the Settings menu', await visible('.nav-item[data-view="settings"]'));
check('The owner still sees the settings form', await visible('#settings-form'));
check('The owner still sees the discount form', await visible('#cms-offer-form'));

// Nothing in the dashboard should tell the shop owner to go and find their developer.
const dashboardText = await page.evaluate(() => document.body.innerText);
check('The dashboard never mentions a developer', !/developer/i.test(dashboardText), (/.{0,60}developer.{0,60}/i.exec(dashboardText) || [''])[0]);

await browser.close();
finish();

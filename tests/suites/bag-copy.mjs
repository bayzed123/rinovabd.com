// The mobile bag drawer, and copying customer details from an order row.
import { chromium } from 'playwright';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';
import { seedOrders } from '../fixtures.mjs';


const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };

const admin = await (await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }) })).json();
// The copy popover reads an order row, so there has to be an order in the list.
await seedOrders(2);
// Distinctive charges prove the bag note reads Settings rather than repeating the old fixed pair.
await fetch(`${BASE}/api/admin/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ delivery_inside_dhaka: '111', delivery_outside_dhaka: '222' }) });

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();

// ---- Bag drawer on a phone ----------------------------------------------------------------
const products = await (await fetch(`${BASE}/api/products`)).json();
const list = (products.products || products).slice(0, 4);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate((items) => localStorage.setItem('rinova-bag', JSON.stringify(items.map((p) => ({ id: p.id, sku: p.sku, slug: p.slug, name: p.name, price: p.price, imageUrl: p.imageUrl, quantity: 2, stock: p.stock, minOrderQty: 1 })))), list);
await page.reload({ waitUntil: 'networkidle' });
await page.click('.bag-button');
await page.waitForSelector('#bag-drawer.open', { timeout: 10000 });
// The note is written once the shop answers /api/config, which the drawer only asks for when it
// opens. A fixed pause is a race against that reply — one lost on a CI runner and reported as
// the shop quoting the wrong charges. Wait for the answer instead; if it never comes, the check
// below still fails, and on the fallback text rather than a timeout nobody can read.
await page.waitForFunction(() => /\d/.test(document.getElementById('bag-delivery-note')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
// The drawer slides in from the side, so anything measured before it lands reads a position the
// customer never sees — the checkout button looks half off the screen. Wait for the panel to
// stop moving rather than guessing at how long the animation takes.
await page.waitForFunction(() => {
  const panel = document.querySelector('#bag-drawer .drawer-panel');
  if (!panel) return false;
  const left = Math.round(panel.getBoundingClientRect().left);
  const settled = window.__panelLeft === left;
  window.__panelLeft = left;
  return settled;
}, null, { timeout: 10000, polling: 'raf' }).catch(() => {});

const note = (await page.locator('#bag-delivery-note').textContent()).trim();
check('The bag note quotes the owner current charges', /111/.test(note) && /222/.test(note), note);
check('The bag no longer repeats the old fixed charges', !/৳90|৳150/.test(note), note);

// The checkout button must be fully on screen AND actually the topmost thing at its own centre —
// a button that is inside the viewport but painted under the tab bar still cannot be tapped.
const button = await page.evaluate(() => {
  const node = document.querySelector('#bag-drawer [data-action="checkout"]');
  if (!node) return null;
  const box = node.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, h: window.innerHeight, w: window.innerWidth, ownsItsCentre: node.contains(hit) };
});
check('The checkout button is inside the viewport', button && button.bottom <= button.h && button.top >= 0 && button.left >= 0 && button.right <= button.w, JSON.stringify(button));
check('Nothing is painted over the checkout button', button?.ownsItsCentre === true);
const noteBox = await page.evaluate(() => { const n = document.getElementById('bag-delivery-note'); const b = n.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + 4, b.top + b.height / 2); return { bottom: b.bottom, h: window.innerHeight, visible: n.contains(hit) }; });
check('The delivery note is fully visible, not clipped', noteBox.bottom <= noteBox.h && noteBox.visible, JSON.stringify(noteBox));
const tabBar = await page.evaluate(() => { const n = document.querySelector('.global-mobile-nav'); return n ? getComputedStyle(n).display : 'absent'; });
check('The bottom tab bar steps aside while the bag is open', tabBar === 'none' || tabBar === 'absent', tabBar);
// The list of items has to scroll on its own rather than pushing the summary off screen.
check('The bag items scroll inside the drawer', await page.evaluate(() => getComputedStyle(document.getElementById('bag-items')).overflowY === 'auto'));

await page.click('[data-action="close-bag"]');
await page.waitForTimeout(400);
check('Closing the bag brings the tab bar back', await page.evaluate(() => !document.body.classList.contains('bag-open')));

// ---- Admin: copy customer details from the order row ---------------------------------------
const desktop = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
await desktop.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const admin2 = await desktop.newPage();
const errors = [];
const NOISE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|googletagmanager|jsdelivr|smartgentools|ERR_BLOCKED/i;
admin2.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text()); });
await admin2.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
await admin2.fill('#login-username', ADMIN_USERNAME);
await admin2.fill('#login-password', ADMIN_PASSWORD);
await admin2.click('#login-form button[type=submit]');
await admin2.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 });
await admin2.click('.nav-item[data-view="orders"]');
await admin2.waitForSelector('#orders-table .order-invoice-button', { timeout: 15000 });

const first = admin2.locator('#orders-table .order-invoice-button').first();
const invoiceLabel = (await first.textContent()).trim();
check('The invoice number is a button, not plain text', /INV-|RNV|ORD/i.test(invoiceLabel), invoiceLabel.slice(0, 40));
await first.click();
await admin2.waitForTimeout(500);
check('Tapping the invoice number opens the copy panel', await admin2.locator('#order-copy-popover.open').count() === 1);
check('The edit form stayed closed', await admin2.locator('#order-detail-panel:not(.hidden)').count() === 0);

const copyText = (await admin2.locator('#order-copy-quick').textContent()).trim();
const expected = await admin2.evaluate(() => { const o = state.orders[0]; return { name: o.name, phone: o.phone, district: o.district }; });
check('The panel shows the customer name', copyText.includes(expected.name), copyText.split('\n')[0]);
check('The panel shows the phone number', copyText.includes(expected.phone));
check('The panel shows the delivery address', expected.district ? copyText.includes(expected.district) : true, copyText.split('\n')[2] || '');

await admin2.click('[data-copy-quick]');
await admin2.waitForTimeout(500);
const clip = await admin2.evaluate(() => navigator.clipboard.readText().catch(() => ''));
check('Copy details puts the block on the clipboard', clip.trim() === copyText, clip.slice(0, 40));

// Editing is still one button away, for a customer whose details are actually wrong.
await admin2.click('#order-copy-popover [data-order-details]');
await admin2.waitForTimeout(1200);
check('Edit details still opens the full form', await admin2.locator('#order-detail-panel:not(.hidden)').count() === 1);
check('Opening the editor dismisses the copy panel', await admin2.locator('#order-copy-popover.open').count() === 0);
check('No console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
await fetch(`${BASE}/api/admin/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ delivery_inside_dhaka: '90', delivery_outside_dhaka: '150' }) });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

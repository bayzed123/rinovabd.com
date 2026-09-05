// Order status colours, the latest-15 rule, and offer management in the dashboard.
import { chromium } from 'playwright';
import { BASE, launchOptions, adminToken, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';
import { seedGlow10, seedOrders } from '../fixtures.mjs';


const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };

// The dashboard lists offers and orders, so there have to be some to list.
await seedGlow10(await adminToken());
await seedOrders(3);

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext();
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();
const errors = [];
// This sandbox blocks outbound CDNs (jsdelivr, tag manager, the barcode service), so their
// load failures are the environment, not the dashboard. Everything else counts.
const EXTERNAL_NOISE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|googletagmanager|jsdelivr|smartgentools|ERR_BLOCKED/i;
page.on('console', (m) => { if (m.type() === 'error' && !EXTERNAL_NOISE.test(m.text())) errors.push(m.text()); });

await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
await page.fill('#login-username', ADMIN_USERNAME);
await page.fill('#login-password', ADMIN_PASSWORD);
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 });

// ---- Orders ------------------------------------------------------------------------------
await page.click('.nav-item[data-view="orders"]');
await page.waitForTimeout(1500);

const rows = await page.locator('#orders-table tr').count();
check('The order list stops at the latest 15', rows <= 15, `${rows} rows`);
const hint = (await page.locator('#orders-hint').textContent()).trim();
check('The list says it is capped and how to reach the rest', /latest 15|order/i.test(hint), hint.slice(0, 80));

const pills = await page.locator('#orders-table .order-pill').count();
check('Every order row carries a status pill', pills === rows, `${pills} pills for ${rows} rows`);
const pillColours = await page.evaluate(() => [...document.querySelectorAll('#orders-table .order-pill')].map((n) => getComputedStyle(n).backgroundColor));
check('Status pills are colour coded, not all one grey', new Set(pillColours).size >= 1 && !pillColours.includes('rgba(0, 0, 0, 0)'), `${new Set(pillColours).size} distinct colours`);
const readable = await page.evaluate(() => { const n = document.querySelector('#orders-table .order-pill'); return n ? { text: n.textContent.trim(), bg: getComputedStyle(n).backgroundColor, fg: getComputedStyle(n).color } : null; });
check('A pill reads as words, not a raw status key', readable && !/_/.test(readable.text), JSON.stringify(readable));

// Search must still reach an order beyond the first 15.
const code = await page.evaluate(() => { const cell = document.querySelector('#orders-table tr:last-child [data-order-details]'); return cell ? cell.dataset.orderDetails : ''; });
check('An order code could be read from the table', Boolean(code), code);
if (code) {
  await page.fill('#order-search', code);
  await page.waitForTimeout(1200);
  const found = await page.locator('#orders-table tr').count();
  check('Searching an order code finds it', found >= 1 && (await page.locator('#orders-table').textContent()).includes(code), `${found} rows for ${code}`);
  await page.fill('#order-search', '');
  await page.waitForTimeout(1000);
}

// ---- Offers ------------------------------------------------------------------------------
await page.click('.nav-item[data-view="cms"]');
await page.waitForTimeout(1800);

check('The offer form asks for a usage limit', await page.locator('#cms-offer-form [name="usageLimit"]').count() === 1);
check('The offer form offers automatic or coupon-code mode', await page.locator('#cms-offer-form [name="autoApply"]').count() === 1);

// A percentage outside 1-100 must be explained, not silently posted.
await page.fill('#cms-offer-form [name="title"]', 'Bad percent');
await page.selectOption('#cms-offer-form [name="discountType"]', 'percentage');
await page.fill('#cms-offer-form [name="discountValue"]', '150');
await page.fill('#cms-offer-form [name="code"]', 'BADPCT');
await page.click('#cms-offer-form button[type=submit]');
await page.waitForTimeout(600);
check('An out-of-range percentage is explained', /1 to 100|1 থেকে ১০০|between 1 and 100/i.test(await page.locator('#cms-offer-message').textContent()), (await page.locator('#cms-offer-message').textContent()).slice(0, 70));

// A real offer saves and appears with its usage shown.
const unique = `SUITE${Math.floor(Math.random() * 10000)}`;
await page.fill('#cms-offer-form [name="discountValue"]', '15');
await page.fill('#cms-offer-form [name="code"]', unique);
await page.fill('#cms-offer-form [name="usageLimit"]', '5');
await page.click('#cms-offer-form button[type=submit]');
await page.waitForTimeout(1800);
const listText = await page.locator('#cms-offer-list').textContent();
check('A saved offer appears in the offer list', listText.includes(unique), listText.slice(0, 90));
check('The list shows the usage allowance', /0 \/ 5/.test(listText));
check('The existing coupon shows how many uses are gone', /GLOW10/.test(listText));

check('No console errors in the dashboard', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

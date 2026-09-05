// The checkout quantity controls must be readable, tappable, and never depend on a script.
import { chromium } from 'playwright';
import { BASE, launchOptions } from '../harness.mjs';
import { mkdirSync } from 'node:fs';

const ARTIFACTS = process.env.RINOVA_TEST_ARTIFACTS || new URL('../artifacts', import.meta.url).pathname;
mkdirSync(ARTIFACTS, { recursive: true });


const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };

const products = await (await fetch(`${BASE}/api/products`)).json();
const list = (products.products || products).slice(0, 2);
const browser = await chromium.launch(launchOptions());

/** Reads both stepper buttons as a customer sees them: do they have visible ink in them? */
async function readStepper(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.checkout-item .quantity-stepper');
    if (!row) return null;
    const [minus, , plus] = row.children;
    const describe = (node) => {
      const box = node.getBoundingClientRect();
      // Text content or a drawn SVG both count as "the customer can see what this does".
      const glyph = (node.textContent || '').trim();
      const svg = node.querySelector('svg');
      const paths = svg ? svg.querySelectorAll('path,line,circle,rect,polyline').length : 0;
      return { glyph, hasSvg: Boolean(svg), paths, w: Math.round(box.width), h: Math.round(box.height), label: node.getAttribute('aria-label') || '' };
    };
    return { minus: describe(minus), plus: describe(plus) };
  });
}

// ---- With everything loading normally -------------------------------------------------------
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();
await page.goto(`${BASE}/checkout.html`, { waitUntil: 'networkidle' });
await page.evaluate((items) => localStorage.setItem('rinova-bag', JSON.stringify(items.map((p) => ({ id: p.id, sku: p.sku, slug: p.slug, name: p.name, price: p.salePrice ?? p.price, quantity: 2, stock: p.stock, minOrderQty: 1 })))), list);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.checkout-item .quantity-stepper', { timeout: 15000 });

const normal = await readStepper(page);
check('Both quantity buttons exist', Boolean(normal), JSON.stringify(normal));
check('The decrease button shows something the customer can read', Boolean(normal.minus.glyph) || normal.minus.paths > 0, JSON.stringify(normal.minus));
check('The increase button shows something too', Boolean(normal.plus.glyph) || normal.plus.paths > 0, JSON.stringify(normal.plus));
check('The two buttons are the same size', Math.abs(normal.minus.w - normal.plus.w) <= 1 && Math.abs(normal.minus.h - normal.plus.h) <= 1, `${normal.minus.w}x${normal.minus.h} vs ${normal.plus.w}x${normal.plus.h}`);
// A thumb needs about 44px; these were 30x32 on the page where a mis-tap costs the order.
check('Both are big enough to tap on a phone', normal.minus.w >= 44 && normal.minus.h >= 44 && normal.plus.w >= 44 && normal.plus.h >= 44, `${normal.minus.w}x${normal.minus.h} and ${normal.plus.w}x${normal.plus.h}`);

// The summary must not announce a discount that is not there. A class setting `display` beats
// the browser's own [hidden] rule, which is why this row stayed on screen showing "-৳0".
const discountRow = await page.evaluate(() => {
  const line = document.getElementById('discount-line');
  return { hiddenProp: line.hidden, onScreen: line.getBoundingClientRect().height > 0, text: line.textContent.replace(/\s+/g, ' ').trim() };
});
check('A row marked hidden is really off the screen', !discountRow.hiddenProp || !discountRow.onScreen, JSON.stringify(discountRow));
const couponLine = await page.evaluate(() => document.getElementById('checkout-coupon-message')?.textContent.trim() || '');
check('No offer is announced as saving nothing', !/save ৳0\b/.test(couponLine), couponLine);
check('Each says what it does for a screen reader', /decrease/i.test(normal.minus.label) && /increase/i.test(normal.plus.label), `${normal.minus.label} | ${normal.plus.label}`);

// It has to actually work, not just look right.
await page.click('[data-checkout-qty][data-direction="-1"]');
await page.waitForTimeout(400);
const afterMinus = await page.evaluate(() => Number(document.querySelector('.checkout-item .quantity-stepper span').textContent.trim()));
check('Tapping decrease reduces the quantity', afterMinus === 1, `now ${afterMinus}`);
await page.click('[data-checkout-qty][data-direction="1"]');
await page.waitForTimeout(400);
const afterPlus = await page.evaluate(() => Number(document.querySelector('.checkout-item .quantity-stepper span').textContent.trim()));
check('Tapping increase raises it again', afterPlus === 2, `now ${afterPlus}`);

// ---- With icons.js blocked entirely ---------------------------------------------------------
// This is the case the customer hit: a stale, blocked or failed script. The controls must still
// be readable, because a quantity button that needs JavaScript to be visible is a broken button.
const bare = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
await bare.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
await bare.route('**/icons.js*', (route) => route.abort());
const barePage = await bare.newPage();
await barePage.goto(`${BASE}/checkout.html`, { waitUntil: 'domcontentloaded' });
await barePage.evaluate((items) => localStorage.setItem('rinova-bag', JSON.stringify(items.map((p) => ({ id: p.id, sku: p.sku, slug: p.slug, name: p.name, price: p.salePrice ?? p.price, quantity: 2, stock: p.stock, minOrderQty: 1 })))), list);
await barePage.reload({ waitUntil: 'domcontentloaded' });
await barePage.waitForSelector('.checkout-item .quantity-stepper', { timeout: 15000 });
await barePage.waitForTimeout(600);

const blocked = await readStepper(barePage);
check('With icons.js blocked, the decrease button is still readable', Boolean(blocked?.minus.glyph), JSON.stringify(blocked?.minus));
check('With icons.js blocked, the increase button is still readable', Boolean(blocked?.plus.glyph), JSON.stringify(blocked?.plus));
check('And decrease still works with no icons.js', await (async () => {
  await barePage.click('[data-checkout-qty][data-direction="-1"]');
  await barePage.waitForTimeout(400);
  return Number(await barePage.evaluate(() => document.querySelector('.checkout-item .quantity-stepper span').textContent.trim())) === 1;
})());
await barePage.screenshot({ path: `${ARTIFACTS}/stepper-no-icons.png` });

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

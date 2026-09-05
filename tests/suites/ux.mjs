// Order confirmation visibility + image viewer controls, on a phone-sized screen.
import { chromium } from 'playwright';
import { BASE, launchOptions } from '../harness.mjs';


const OUT = process.env.RINOVA_TEST_ARTIFACTS || new URL('../artifacts', import.meta.url).pathname;
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });

// ---- 1. Order confirmation must reach the customer -------------------------------------
const page = await context.newPage();
const products = await (await fetch(`${BASE}/api/products`)).json();
const p = (products.products || products).find((x) => Number(x.stock) > 0);
await page.goto(`${BASE}/checkout.html`, { waitUntil: 'networkidle' });
await page.evaluate((prod) => localStorage.setItem('rinova-bag', JSON.stringify([{ id: prod.id, sku: prod.sku, slug: prod.slug, name: prod.name, price: prod.price, quantity: 1, stock: prod.stock, minOrderQty: 1 }])), p);
await page.reload({ waitUntil: 'networkidle' });
await page.fill('#checkout-name', 'test');
await page.fill('#checkout-phone', '01791527854');
await page.fill('#checkout-district', 'Rajshahi');
await page.fill('#checkout-upazila', 'Rajshahi Sadar');
await page.fill('#checkout-address', 'Malopara, Rajshahi');
await page.waitForTimeout(700);
await page.locator('#checkout-form button[type=submit]').scrollIntoViewIfNeeded();
await page.click('#checkout-form button[type=submit]');
await page.waitForTimeout(2600);

const after = await page.evaluate(() => {
  const grid = document.getElementById('checkout-grid');
  const s = document.getElementById('success');
  const r = s.getBoundingClientRect();
  return {
    gridDisplay: getComputedStyle(grid).display,
    gridHeight: Math.round(grid.getBoundingClientRect().height),
    inViewport: r.top < window.innerHeight && r.bottom > 0,
    fullyOnScreen: r.top >= -2 && r.bottom <= window.innerHeight + 2,
    heading: (s.querySelector('h2')?.textContent || '').trim(),
    orderId: (s.querySelector('.success-facts dd')?.textContent || '').trim(),
    actions: s.querySelectorAll('.success-actions .button').length,
    formStillOnScreen: Boolean(document.querySelector('#checkout-form button[type=submit]')?.getBoundingClientRect().height),
  };
});
check('The order form is really hidden after ordering', after.gridDisplay === 'none' && after.gridHeight === 0, `display:${after.gridDisplay}`);
check('The customer cannot submit a second order', !after.formStillOnScreen);
check('The confirmation is on screen where the customer is looking', after.inViewport && after.fullyOnScreen);
check('The confirmation states success in Bangla', /সফল/.test(after.heading), after.heading);
check('The order ID is shown', /^RNV-/.test(after.orderId), after.orderId);
check('Invoice, tracking and shopping actions are offered', after.actions === 3, `${after.actions} buttons`);
await page.screenshot({ path: `${OUT}/ux-order-confirmed.png` });

// ---- 2. Image viewer must show its controls ---------------------------------------------
const viewer = await context.newPage();
const slug = p.slug;
await viewer.goto(`${BASE}/product.html?slug=${encodeURIComponent(slug)}`, { waitUntil: 'networkidle' });
await viewer.waitForSelector('#detail-media-stage', { timeout: 15000 });
await viewer.click('#detail-media-stage');
await viewer.waitForTimeout(900);

const controls = await viewer.evaluate(() => {
  const close = document.querySelector('.media-viewer-close');
  const box = close?.getBoundingClientRect();
  const svgIn = (sel) => Boolean(document.querySelector(`${sel} svg`)?.getBoundingClientRect().width);
  return {
    open: Boolean(document.querySelector('.media-viewer.open')),
    closeVisible: Boolean(box && box.width > 0 && box.height > 0),
    // Must be inside the viewport on BOTH axes: the button used to sit past the right edge,
    // clipped by overflow:hidden, which a vertical-only check happily passed.
    closeOnScreen: Boolean(box && box.top >= 0 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth),
    closeRight: Math.round(box?.right ?? -1),
    viewportWidth: window.innerWidth,
    partsWithinDialog: ['.media-viewer-head', '.media-viewer-stage', '.media-viewer-tools']
      .every((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().width) <= window.innerWidth),
    tabBarHidden: (() => { const n = document.querySelector('.global-mobile-nav'); return !n || getComputedStyle(n).display === 'none'; })(),
    toolsVisible: (() => { const t = document.querySelector('.media-viewer-tools'); const b = t.getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return Boolean(el && t.contains(el)); })(),
    closeHitsButton: (() => { const b = close.getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return Boolean(el && close.contains(el)); })(),
    closeText: (close?.textContent || '').trim(),
    closeHasIcon: svgIn('.media-viewer-close'),
    prevHasIcon: svgIn('.media-viewer-prev'),
    nextHasIcon: svgIn('.media-viewer-next'),
    zoomIcons: document.querySelectorAll('.media-viewer-tools button svg').length,
    emptyIconSpans: document.querySelectorAll('.media-viewer [data-rinova-icon]:empty').length,
  };
});
check('The image viewer opens', controls.open);
check('The close button is fully inside the screen', controls.closeVisible && controls.closeOnScreen, `right ${controls.closeRight} of ${controls.viewportWidth}`);
check('The viewer does not overflow the screen width', controls.partsWithinDialog);
check('The close button is actually tappable, not covered', controls.closeHitsButton);
check('The bottom tab bar is out of the way while viewing', controls.tabBarHidden);
check('The zoom controls are not covered', controls.toolsVisible);
check('The close button carries a written label', /close/i.test(controls.closeText), controls.closeText);
check('The close icon renders', controls.closeHasIcon);
check('Both arrow icons render', controls.prevHasIcon && controls.nextHasIcon);
check('Zoom icons render', controls.zoomIcons >= 2, `${controls.zoomIcons} icons`);
check('No icon placeholder is left empty', controls.emptyIconSpans === 0, `${controls.emptyIconSpans} empty`);
await viewer.screenshot({ path: `${OUT}/ux-image-viewer.png` });

await viewer.click('.media-viewer-close');
await viewer.waitForTimeout(700);
const closed = await viewer.evaluate(() => ({ open: Boolean(document.querySelector('.media-viewer.open')), locked: document.body.classList.contains('media-viewer-open') || document.documentElement.classList.contains('media-viewer-open') }));
check('Tapping Close really closes the viewer', !closed.open);
check('Page scrolling is released after closing', !closed.locked);

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

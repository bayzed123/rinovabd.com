// The image viewer: growing out of the thumbnail, paging, and shrinking back into it.
import { chromium } from 'playwright';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';


const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };

// The suite gives one product a three-picture gallery, so paging is tested against a gallery
// this run created rather than whatever the local catalogue happens to hold.
const admin = await (await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }) })).json();
const GALLERY = ['/assets/himalaya-face-wash-collection.png', '/assets/coral-crush-blush-duo.png', '/assets/himalaya-neem-face-wash-150ml.png'];
const products = await (await fetch(`${BASE}/api/products`)).json();
const target = (products.products || products).find((p) => p.sku === 'RNV-FC-001') || (products.products || products)[0];
const originalMedia = target.mediaJson || '[]';
await fetch(`${BASE}/api/admin/products/sku/${encodeURIComponent(target.sku)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ mediaJson: JSON.stringify(GALLERY.map((url) => ({ type: 'image', url }))), imageUrl: GALLERY[0] }) });

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();
const errors = [];
const blocked = [];
page.on('requestfailed', (request) => { if (!request.url().startsWith(BASE)) blocked.push(request.url()); });
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  // The sandbox blocks every outbound host, so a load failure for one of those is the
  // environment, not the page. Anything else — including a same-origin failure — counts.
  if (/Failed to load resource/i.test(text) && blocked.some((url) => text.includes(url) || m.location()?.url === url)) return;
  if (/Failed to load resource/i.test(text) && !String(m.location()?.url || '').startsWith(BASE)) return;
  errors.push(`${text} @ ${m.location()?.url || '?'}`);
});

await page.goto(`${BASE}/product.html?slug=${target.slug}`, { waitUntil: 'networkidle' });
await page.waitForSelector('#detail-media-stage', { timeout: 15000 });
const stage = await page.locator('#detail-media-stage img').boundingBox();

// ---- Opening grows out of the thumbnail -----------------------------------------------------
// Catch the very first painted frame: the image must be sitting on the stage, not already
// centred. Waiting for the animation to finish would pass even with no animation at all.
await page.evaluate(() => {
  window.__firstFrame = null;
  const stamp = () => {
    const shown = document.querySelector('.media-viewer.open');
    const img = shown?.querySelector('.media-viewer-slide img');
    if (img && !window.__firstFrame) {
      const box = img.getBoundingClientRect();
      window.__firstFrame = { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width, transform: img.style.transform };
    }
    if (!window.__firstFrame) requestAnimationFrame(stamp);
  };
  requestAnimationFrame(stamp);
});
await page.click('#detail-media-stage');
await page.waitForTimeout(80);
const firstFrame = await page.evaluate(() => window.__firstFrame);
check('The image is placed before it is animated', Boolean(firstFrame), JSON.stringify(firstFrame));
const stageCentre = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
check('It starts on the thumbnail, not in the middle of the screen',
  firstFrame && Math.abs(firstFrame.x - stageCentre.x) < 40 && Math.abs(firstFrame.y - stageCentre.y) < 40,
  `started at ${Math.round(firstFrame?.x)},${Math.round(firstFrame?.y)} · stage centre ${Math.round(stageCentre.x)},${Math.round(stageCentre.y)}`);
const firstScale = Number(/scale\(([\d.]+)\)/.exec(firstFrame?.transform || '')?.[1]) || 1;
check('It starts at the thumbnail size, not full size', firstScale < 1 && Math.abs(firstFrame.w * firstScale - stage.width) < 40, `painted ${Math.round((firstFrame?.w || 0) * firstScale)} vs thumbnail ${Math.round(stage.width)} (${firstFrame?.transform})`);

await page.waitForTimeout(700);
const opened = await page.evaluate(() => {
  const img = document.querySelector('.media-viewer-slide img');
  const box = img.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width, flight: getComputedStyle(document.querySelector('.media-viewer')).getPropertyValue('--media-flight').trim() };
});
check('It settles in the middle of the screen', Math.abs(opened.x - 207) < 12 && Math.abs(opened.y - 448) < 40, `${Math.round(opened.x)},${Math.round(opened.y)}`);
const openedBox = await page.evaluate(() => { const b = document.querySelector('.media-viewer-slide img').getBoundingClientRect(); return { w: b.width, h: b.height }; });
check('It ends larger than the thumbnail and fills the screen', openedBox.w * openedBox.h > stage.width * stage.height && openedBox.w * openedBox.h > 414 * 896 * 0.45, `${Math.round(openedBox.w)}x${Math.round(openedBox.h)} vs thumbnail ${Math.round(stage.width)}x${Math.round(stage.height)}`);
check('The journey is reported as finished', opened.flight === '0', opened.flight);

// Everything the earlier fixes guaranteed must still hold: a visible, tappable way out.
const closeButton = await page.evaluate(() => {
  const node = document.querySelector('.media-viewer-close');
  const box = node.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return { inside: box.top >= 0 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth, owns: node.contains(hit), text: node.textContent.trim() };
});
check('The close button is on screen and tappable', closeButton.inside && closeButton.owns, JSON.stringify(closeButton));

// ---- Swiping left and right pages between images --------------------------------------------
const slideCount = await page.locator('.media-viewer-slide').count();
check('Every picture is a slide in the viewer', slideCount >= 2, `${slideCount} slides`);
await page.evaluate(() => { const t = document.querySelector('.media-viewer-track'); t.scrollTo({ left: t.clientWidth, behavior: 'instant' }); });
await page.waitForTimeout(400);
const paged = await page.evaluate(() => {
  const t = document.querySelector('.media-viewer-track');
  return { index: Math.round(t.scrollLeft / (t.clientWidth || 1)), hint: document.querySelector('.media-viewer-hint').textContent.trim() };
});
check('Swiping moves to the next image', paged.index === 1, `landed on slide ${paged.index}`);
check('The viewer says which image is showing', /image 2 of/i.test(paged.hint), paged.hint);

// ---- Dragging down shrinks it back and dismisses ---------------------------------------------
await page.evaluate(() => { const t = document.querySelector('.media-viewer-track'); t.scrollTo({ left: 0, behavior: 'instant' }); });
await page.waitForTimeout(500);
const dialog = await page.locator('.media-viewer-dialog').boundingBox();
const startX = dialog.x + dialog.width / 2;
const startY = dialog.y + dialog.height / 2;
await page.touchscreen.tap(startX, startY); // dismiss any pending double-tap state
await page.waitForTimeout(350);

// Part-way through the drag the image must be measurably smaller and heading for the thumbnail.
await page.evaluate(({ x, y }) => {
  const dialogNode = document.querySelector('.media-viewer-dialog');
  const touch = (target, cx, cy) => new TouchEvent(target, { bubbles: true, cancelable: true, changedTouches: [new Touch({ identifier: 1, target: dialogNode, clientX: cx, clientY: cy })] });
  dialogNode.dispatchEvent(touch('touchstart', x, y));
  dialogNode.dispatchEvent(touch('touchmove', x, y + 140));
}, { x: startX, y: startY });
await page.waitForTimeout(120);
const mid = await page.evaluate(() => {
  const img = document.querySelector('.media-viewer-slide img');
  const box = img.getBoundingClientRect();
  return { w: box.width, flight: Number(getComputedStyle(document.querySelector('.media-viewer')).getPropertyValue('--media-flight')), backdrop: Number(getComputedStyle(document.querySelector('.media-viewer-backdrop')).opacity), transform: img.style.transform };
});
check('Dragging down starts the journey home', mid.flight > 0.1 && mid.flight < 1, `flight ${mid.flight}`);
check('The image shrinks as it travels', /scale\(0\.\d+\)/.test(mid.transform), mid.transform);
check('The page behind is uncovered as it goes', mid.backdrop < 0.95, `backdrop ${mid.backdrop}`);

await page.evaluate(({ x, y }) => {
  const dialogNode = document.querySelector('.media-viewer-dialog');
  dialogNode.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [new Touch({ identifier: 1, target: dialogNode, clientX: x, clientY: y + 140 })] }));
}, { x: startX, y: startY });
await page.waitForTimeout(700);
const afterDrag = await page.evaluate(() => ({
  hidden: document.querySelector('.media-viewer').hidden,
  bodyLocked: document.body.classList.contains('media-viewer-open'),
  scrollable: getComputedStyle(document.body).position !== 'fixed',
}));
check('Letting go past the threshold closes the viewer', afterDrag.hidden);
check('The page is scrollable again afterwards', afterDrag.scrollable && !afterDrag.bodyLocked, JSON.stringify(afterDrag));

// A short drag must spring back rather than closing, or the viewer is unusable.
await page.click('#detail-media-stage');
await page.waitForTimeout(700);
await page.evaluate(({ x, y }) => {
  const dialogNode = document.querySelector('.media-viewer-dialog');
  const touch = (target, cx, cy) => new TouchEvent(target, { bubbles: true, cancelable: true, changedTouches: [new Touch({ identifier: 1, target: dialogNode, clientX: cx, clientY: cy })] });
  dialogNode.dispatchEvent(touch('touchstart', x, y));
  dialogNode.dispatchEvent(touch('touchmove', x, y + 30));
  dialogNode.dispatchEvent(touch('touchend', x, y + 30));
}, { x: startX, y: startY });
await page.waitForTimeout(500);
const afterNudge = await page.evaluate(() => ({ hidden: document.querySelector('.media-viewer').hidden, flight: getComputedStyle(document.querySelector('.media-viewer')).getPropertyValue('--media-flight').trim() }));
check('A short drag springs back instead of closing', !afterNudge.hidden && afterNudge.flight === '0', JSON.stringify(afterNudge));

// ---- Closing by the button also flies home ---------------------------------------------------
await page.click('.media-viewer-close');
await page.waitForTimeout(120);
const closing = await page.evaluate(() => ({ flight: Number(getComputedStyle(document.querySelector('.media-viewer')).getPropertyValue('--media-flight')), stillVisible: !document.querySelector('.media-viewer').hidden }));
check('Closing sends the image back rather than blinking it out', closing.flight === 1 && closing.stillVisible, JSON.stringify(closing));
await page.waitForTimeout(600);
check('The viewer is gone once it lands', await page.evaluate(() => document.querySelector('.media-viewer').hidden));
check('And the page scrolls again', await page.evaluate(() => getComputedStyle(document.body).position !== 'fixed'));

// ---- It must still work when there is nowhere to fly from -------------------------------------
// Scrolling the stage out of view leaves no honest origin; the viewer should open plainly
// rather than growing from an off-screen point or throwing.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(400);
await page.evaluate((url) => window.RinovaMediaViewer.open([{ type: 'image', url }], 0, 'Fallback', document.getElementById('detail-media-stage')), GALLERY[0]);
await page.waitForTimeout(700);
const fallback = await page.evaluate(() => {
  const img = document.querySelector('.media-viewer-slide img');
  const box = img.getBoundingClientRect();
  return { open: !document.querySelector('.media-viewer').hidden, centred: Math.abs(box.left + box.width / 2 - window.innerWidth / 2) < 12 };
});
check('With no visible origin it still opens, centred', fallback.open && fallback.centred, JSON.stringify(fallback));
await page.evaluate(() => window.RinovaMediaViewer.close());
await page.waitForTimeout(600);
check('And still closes', await page.evaluate(() => document.querySelector('.media-viewer').hidden));

check('No console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
// Put the product's own gallery back.
await fetch(`${BASE}/api/admin/products/sku/${encodeURIComponent(target.sku)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ mediaJson: originalMedia, imageUrl: target.imageUrl || GALLERY[0] }) });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

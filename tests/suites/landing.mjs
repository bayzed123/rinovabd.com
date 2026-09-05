// The ad landing page: the page money is spent to send people to.
//
// Three things have to be true before a taka of ad budget is spent on it. The price on the page
// has to be the price the order is charged. The order form has to actually place an order. And
// the Purchase has to reach Meta once, not twice — the browser pixel and the Conversions API
// both report it, so both must carry the order code as the event id.
//
// The data block is checked deliberately: the campaign pages shipped for months with an
// HTML-escaped JSON payload that no browser could parse, so every campaign rendered empty
// without anything failing loudly.
import { chromium } from 'playwright';
import { BASE, launchOptions, api, adminToken, authHeaders, createChecker, collectConsoleErrors } from '../harness.mjs';
import { seedDeliveryCharges } from '../fixtures.mjs';

const { check, finish } = createChecker();
const token = await adminToken();
const auth = authHeaders(token);
const SKU = 'RNV-LP-COMBO-01';
const PATH = '/lp/silky-beauty-combo';

// Delivery has to cost something, or "free delivery" proves nothing.
const { inside } = await seedDeliveryCharges(token);

// Tracking ids the page can load. Restored at the end so no other suite inherits them.
const before = await api.get('/api/admin/tracking/settings', auth);
const restore = {
  gtmId: before.json.gtmId || '', ga4MeasurementId: before.json.ga4MeasurementId || '',
  metaPixelId: before.json.metaPixelId || '', gscSiteUrl: before.json.gscSiteUrl || '',
};
await api.send('/api/admin/tracking/settings', 'PUT', {
  ...restore, gtmId: 'GTM-LPTEST', ga4MeasurementId: 'G-LPTEST123', metaPixelId: '1234567890',
}, auth);

// ---- What the server sends -------------------------------------------------------------------
const page404 = await fetch(`${BASE}/lp/not-a-real-page`);
check('An unknown landing page is a 404', page404.status === 404, `HTTP ${page404.status}`);

const served = await fetch(`${BASE}${PATH}`);
const html = await served.text();
check('The landing page is served', served.ok, `HTTP ${served.status}`);

// Meta's ad crawler runs no JavaScript, so the card has to be in the HTML that comes back.
check('It carries an Open Graph title', /<meta property="og:title" content="[^"]{10,}"/.test(html));
check('And an Open Graph image', /<meta property="og:image" content="https?:[^"]+lp-combo\.jpg"/.test(html), (/og:image[^>]*/.exec(html) || [''])[0]);
check('And a canonical link to itself', html.includes(`<link rel="canonical" href="${BASE}${PATH}">`), (/rel="canonical"[^>]*/.exec(html) || [''])[0]);
check('It is left indexable', /content="index,follow"/.test(html));

const block = /<script id="lp-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
check('The data block was filled in', Boolean(block && block[1].trim()), 'empty or missing');
let data = null;
try { data = JSON.parse(block?.[1] || ''); } catch (error) { data = null; }
check('The data block is JSON a browser can parse', data !== null, (block?.[1] || '').slice(0, 90));
check('The tracking ids reach the page', data?.tracking?.tracking_gtm_id === 'GTM-LPTEST' && data?.tracking?.tracking_ga4_measurement_id === 'G-LPTEST123' && data?.tracking?.tracking_meta_pixel_id === '1234567890', JSON.stringify(data?.tracking || {}));
check('The product reaches the page priced', data?.product?.sku === SKU && Number(data?.product?.price) > 0, JSON.stringify(data?.product || {}).slice(0, 120));

// The same bug shipped on the campaign pages, so guard that payload too.
const campaign = await api.post('/api/admin/campaigns', { title: `LP Escape ${Date.now().toString(36).slice(-5)}`, description: 'Escaping check', active: 1 }, auth);
const campaignSlug = campaign.json.slug;
if (campaignSlug) {
  const campaignHtml = await (await fetch(`${BASE}/campaign/${campaignSlug}`)).text();
  const campaignBlock = /<script id="campaign-data" type="application\/json">([\s\S]*?)<\/script>/.exec(campaignHtml);
  let campaignData = null;
  try { campaignData = JSON.parse(campaignBlock?.[1] || ''); } catch { campaignData = null; }
  check('A campaign page also sends parseable JSON', campaignData !== null, (campaignBlock?.[1] || '').slice(0, 90));
  await api.send(`/api/admin/campaigns/${campaign.json.id}`, 'DELETE', undefined, auth);
} else {
  check('A campaign page also sends parseable JSON', false, `could not create a campaign: HTTP ${campaign.status}`);
}

// The raw asset path would serve the same page unfilled — no tracking, no confirmed price.
for (const path of ['/lp-silky-combo', '/lp-silky-combo.html']) {
  const raw = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  check(`${path} is sent to the real landing page`, raw.status === 301 && raw.headers.get('location') === PATH, `HTTP ${raw.status} → ${raw.headers.get('location')}`);
}

// ---- The promise the page makes ---------------------------------------------------------------
const quote = await api.post('/api/offers/validate', { deliveryFee: inside, code: '', items: [{ sku: SKU, quantity: 1 }] });
check('The shop confirms the advertised price', Number(quote.json.subtotal) === 850, `subtotal ${quote.json.subtotal}`);
check('And that delivery really is free', Number(quote.json.deliveryFee) === 0, `delivery ${quote.json.deliveryFee} (charge is ${inside})`);

// ---- The page in a browser --------------------------------------------------------------------
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });

// Nothing in a test should reach Google or Meta; answering with an empty script keeps the page
// working while still recording what it asked for.
const requested = [];
await context.route('**://*.googletagmanager.com/**', (route) => { requested.push(route.request().url()); route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); });
await context.route('**://connect.facebook.net/**', (route) => { requested.push(route.request().url()); route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); });

const browserPage = await context.newPage();
const errors = collectConsoleErrors(browserPage);
await browserPage.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' });

check('Tag Manager is loaded with the shop\'s container', requested.some((url) => /gtm\.js\?id=GTM-LPTEST/.test(url)), requested.join(' | ').slice(0, 160));
check('GA4 is loaded with the shop\'s measurement id', requested.some((url) => /gtag\/js\?id=G-LPTEST123/.test(url)), requested.join(' | ').slice(0, 160));
check('The Meta pixel is loaded', requested.some((url) => /fbevents\.js/.test(url)), requested.join(' | ').slice(0, 160));
const layer = await browserPage.evaluate(() => (window.dataLayer || []).map((entry) => (Array.isArray(entry) ? entry[0] : entry.event)).filter(Boolean));
check('A product view is reported', layer.includes('view_item'), layer.join(', '));

const priced = await browserPage.evaluate(() => ({
  subtotal: document.querySelector('#lp-subtotal')?.textContent.trim(),
  delivery: document.querySelector('#lp-delivery')?.textContent.trim(),
  total: document.querySelector('#lp-total')?.textContent.trim(),
  submit: document.querySelector('#lp-submit')?.textContent.trim(),
}));
check('The page shows the ৳850 price', /৮৫০/.test(priced.subtotal || '') && /৮৫০/.test(priced.total || ''), JSON.stringify(priced));
check('And says delivery is free', /ফ্রি/.test(priced.delivery || ''), priced.delivery);
check('The confirm button carries the amount payable', /৮৫০/.test(priced.submit || ''), priced.submit);

// Every order button has to reach the form, or the ad spend goes nowhere.
const ctaCount = await browserPage.locator('a.cta[href="#order"]').count();
check('The page repeats the order button down the page', ctaCount >= 4, `${ctaCount} buttons`);
check('The WhatsApp button is a WhatsApp link', /^https:\/\/wa\.me\/\d+/.test(await browserPage.getAttribute('#lp-whatsapp', 'href') || ''), await browserPage.getAttribute('#lp-whatsapp', 'href'));
check('The call button dials a number', /^tel:\+?\d+/.test(await browserPage.getAttribute('#lp-call', 'href') || ''), await browserPage.getAttribute('#lp-call', 'href'));
check('The footer links back to the shop', await browserPage.locator('footer.lp-foot a[href="/"]').count() > 0);

// A bad phone number must stop before an order is created.
const ordersBefore = (await api.get('/api/admin/orders', auth)).json.orders?.length ?? 0;
await browserPage.locator('a.cta[href="#order"]').first().click();
await browserPage.waitForTimeout(400);
await browserPage.fill('#lp-name', 'ল্যান্ডিং টেস্ট');
await browserPage.fill('#lp-phone', '12345');
await browserPage.fill('#lp-address', 'Malopara, Boalia, Rajshahi 6100');
await browserPage.click('#lp-submit');
await browserPage.waitForTimeout(600);
check('A wrong phone number is refused', !(await browserPage.locator('#lp-error').isHidden()), 'no error was shown');
const ordersAfterBadPhone = (await api.get('/api/admin/orders', auth)).json.orders?.length ?? 0;
check('And no order was created by it', ordersAfterBadPhone === ordersBefore, `${ordersBefore} → ${ordersAfterBadPhone}`);

// The real thing.
const phone = `017${String(Date.now()).slice(-8)}`;
await browserPage.fill('#lp-phone', phone);
await browserPage.click('#lp-submit');
await browserPage.waitForSelector('#lp-done', { state: 'visible', timeout: 20000 });
const code = (await browserPage.locator('#lp-order-code').textContent() || '').trim();
check('An order can be placed from the page', Boolean(code), 'no order code was shown');
check('The form is put away once the order is in', await browserPage.locator('#lp-form').isHidden());

const placed = (await api.get(`/api/admin/orders?q=${encodeURIComponent(phone)}`, auth)).json.orders?.[0];
check('The order really reached the shop', Boolean(placed), `nothing found for ${phone}`);
check('It is marked as coming from the ad page', /landing page/i.test(String(placed?.customerNote || '')), placed?.customerNote);
const charged = Number(placed?.subtotal ?? NaN) - Number(placed?.discount ?? 0) + Number(placed?.deliveryFee ?? 0);
check('It was charged the advertised total', charged === 850, `charged ${charged} (subtotal ${placed?.subtotal} − discount ${placed?.discount} + delivery ${placed?.deliveryFee})`);
check('With no delivery charge added', Number(placed?.deliveryFee) === 0, `delivery ${placed?.deliveryFee}`);

const afterOrder = await browserPage.evaluate(() => (window.dataLayer || []).map((entry) => (Array.isArray(entry) ? entry[0] : entry.event)).filter(Boolean));
check('The purchase is reported to GA4', afterOrder.includes('purchase'), afterOrder.join(', '));
check('The checkout step was counted', afterOrder.includes('begin_checkout'), afterOrder.join(', '));

check('No console errors on the landing page', errors.length === 0, errors.slice(0, 2).join(' | '));

// ---- The Meta event id, which is what stops the sale being counted twice ----------------------
// Defining fbq before the page loads makes lp.js use it instead of loading Meta's own, so the
// calls it makes can be read back.
const dedupeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await dedupeContext.addInitScript(() => {
  try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {}
  window.__pixelCalls = [];
  window.fbq = function (...args) { window.__pixelCalls.push(args); };
});
await dedupeContext.route('**://*.googletagmanager.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const dedupePage = await dedupeContext.newPage();
await dedupePage.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' });
const dedupePhone = `018${String(Date.now()).slice(-8)}`;
await dedupePage.fill('#lp-name', 'পিক্সেল টেস্ট');
await dedupePage.fill('#lp-phone', dedupePhone);
await dedupePage.fill('#lp-address', 'Malopara, Boalia, Rajshahi 6100');
await dedupePage.click('#lp-submit');
await dedupePage.waitForSelector('#lp-done', { state: 'visible', timeout: 20000 });
const dedupeCode = (await dedupePage.locator('#lp-order-code').textContent() || '').trim();
const calls = await dedupePage.evaluate(() => window.__pixelCalls);
const viewContent = calls.find((call) => call[1] === 'ViewContent');
const purchase = calls.find((call) => call[1] === 'Purchase');
check('The pixel reports a product view', Boolean(viewContent), JSON.stringify(calls).slice(0, 140));
check('The pixel reports the purchase', Boolean(purchase), JSON.stringify(calls).slice(0, 140));
check('The purchase carries the value and currency', Number(purchase?.[2]?.value) === 850 && purchase?.[2]?.currency === 'BDT', JSON.stringify(purchase?.[2] || {}));
// The Conversions API sends the same Purchase with the order code as its event id; without a
// matching id here Meta counts one sale as two and every reported cost per purchase is halved.
const placedForPixel = (await api.get(`/api/admin/orders?q=${encodeURIComponent(dedupePhone)}`, auth)).json.orders?.[0];
check('The purchase carries an event id that matches the order', Boolean(purchase?.[3]?.eventID) && purchase[3].eventID === placedForPixel?.orderCode, `eventID ${purchase?.[3]?.eventID} vs order ${placedForPixel?.orderCode} (shown ${dedupeCode})`);

// ---- When the combo runs out -----------------------------------------------------------------
// Paying for a click that lands on a form the shop cannot fulfil is worse than saying so.
const stockBefore = Number((await api.get(`/api/admin/products?q=${SKU}`, auth)).json.products?.find((product) => product.sku === SKU)?.stock ?? 100);
await api.post(`/api/admin/products/sku/${SKU}/stock`, { mode: 'set', quantity: 0, reason: 'adjustment' }, auth);
const soldOutPage = await context.newPage();
await soldOutPage.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' });
check('A sold-out combo says so', await soldOutPage.locator('#lp-soldout').isVisible());
check('And the order form is taken away', await soldOutPage.locator('#lp-form').isHidden());
await soldOutPage.close();
await api.post(`/api/admin/products/sku/${SKU}/stock`, { mode: 'set', quantity: stockBefore, reason: 'adjustment' }, auth);
const restored = (await api.get(`/api/admin/products?q=${SKU}`, auth)).json.products?.find((product) => product.sku === SKU);
check('Stock is put back for the next run', Number(restored?.stock) === stockBefore, `stock ${restored?.stock}`);

await browser.close();
await api.send('/api/admin/tracking/settings', 'PUT', restore, auth);
finish();

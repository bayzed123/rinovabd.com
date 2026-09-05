// A campaign page the owner builds in Campaign Studio.
//
// The campaign page used to be a grid of cards linking back to the shop: an ad click had to
// travel to a second page to become an order, and mostly did not. It is now the same ad landing
// page format as the built-in ones, so this checks the thing that matters — that a campaign made
// the way the owner makes it comes out as a page that takes an order at the advertised price.
import { chromium } from 'playwright';
import { BASE, launchOptions, api, adminToken, authHeaders, createChecker, collectConsoleErrors } from '../harness.mjs';
import { seedDeliveryCharges } from '../fixtures.mjs';

const { check, finish } = createChecker();
const token = await adminToken();
const auth = authHeaders(token);
const stamp = Date.now().toString(36).slice(-6);

const { inside } = await seedDeliveryCharges(token);

// A product for the campaign to sell, priced so the discount is visible on the page.
const SKU = `RNV-CAMP-${stamp}`;
const created = await api.post('/api/admin/products', {
  name: `Campaign Serum ${stamp}`, sku: SKU, price: 700, compareAtPrice: 1200, costPrice: 300,
  stock: 25, status: 'active', shortDescription: 'ক্যাম্পেইন টেস্ট প্রোডাক্ট',
}, auth);
check('A product can be made for the campaign', created.status === 201, `HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 120)}`);
const productId = created.json.product?.id;

// ---- The owner makes the campaign, exactly as the dashboard does -----------------------------
const campaign = await api.post('/api/admin/campaigns', {
  title: `Winter Glow ${stamp}`,
  eyebrow: 'সীমিত সময়ের অফার',
  description: 'প্রথম লাইনটি একটি প্যারাগ্রাফ।\nদ্বিতীয় লাইনটি আলাদা প্যারাগ্রাফ হয়ে আসবে।',
  imageUrl: '/assets/lp-combo.jpg',
  productIds: [productId],
  active: 1,
}, auth);
check('The owner can create a campaign', campaign.status === 201 && Boolean(campaign.json.slug), `HTTP ${campaign.status} ${JSON.stringify(campaign.json).slice(0, 120)}`);
const slug = campaign.json.slug;
const PATH = `/campaign/${slug}`;
check('It hands back the ad link', String(campaign.json.url || '').endsWith(PATH), campaign.json.url);

// ---- What the server sends --------------------------------------------------------------------
const served = await fetch(`${BASE}${PATH}`);
const html = await served.text();
check('The campaign page is served', served.ok, `HTTP ${served.status}`);
check('It uses the ad landing page format', html.includes('/lp.css') && html.includes('/lp-order.js'), 'the landing stylesheet and order engine are not on the page');
check('It carries the order form', html.includes('id="lp-form"') && html.includes('id="lp-submit"'));
check('Meta gets an Open Graph card without running scripts', /<meta property="og:title" content="[^"]{5,}"/.test(html) && /<meta property="og:image"/.test(html));

const block = /<script id="campaign-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
let data = null;
try { data = JSON.parse(block?.[1] || ''); } catch { data = null; }
check('The injected data is JSON a browser can parse', data !== null, (block?.[1] || '').slice(0, 90));
check('The campaign product reaches the page', data?.products?.[0]?.sku === SKU, JSON.stringify(data?.products || []).slice(0, 120));
check('So does the shop phone number, which the page offers to call', Boolean(data?.shop?.phone), JSON.stringify(data?.shop || {}));

// ---- The page in a browser ---------------------------------------------------------------------
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
await context.route('**://*.googletagmanager.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await context.route('**://connect.facebook.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await context.newPage();
const errors = collectConsoleErrors(page);
await page.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' });

const shown = await page.evaluate(() => ({
  title: document.querySelector('#campaign-title')?.textContent.trim(),
  eyebrow: document.querySelector('#campaign-eyebrow')?.textContent.trim(),
  paragraphs: [...document.querySelectorAll('#campaign-description p')].map((node) => node.textContent.trim()),
  priceNow: document.querySelector('#campaign-price-now')?.textContent.trim(),
  priceOld: document.querySelector('#campaign-price-old')?.textContent.trim(),
  image: document.querySelector('#campaign-media img')?.getAttribute('src'),
  subtotal: document.querySelector('#lp-subtotal')?.textContent.trim(),
  total: document.querySelector('#lp-total')?.textContent.trim(),
  submit: document.querySelector('#lp-submit')?.textContent.trim(),
  ctas: document.querySelectorAll('a.cta[href="#order"]').length,
  callHref: document.querySelector('#lp-call')?.getAttribute('href'),
}));
check('The headline the owner typed is the headline on the page', shown.title === `Winter Glow ${stamp}`, shown.title);
check('And the small line above it', /সীমিত সময়ের/.test(shown.eyebrow || ''), shown.eyebrow);
check('Each line of the description becomes its own paragraph', shown.paragraphs.length === 2, JSON.stringify(shown.paragraphs));
check('The picture the owner chose is shown', /lp-combo\.jpg/.test(shown.image || ''), shown.image);
check('The offer price is the headline number', /৭০০/.test(shown.priceNow || ''), shown.priceNow);
check('With the old price struck through beside it', /১,?২০০/.test(shown.priceOld || ''), shown.priceOld);
check('The order button is repeated down the page', shown.ctas >= 2, `${shown.ctas} buttons`);
check('The call button dials the shop', /^tel:\+?\d+/.test(shown.callHref || ''), shown.callHref);
check('The summary is priced from the shop, not the markup', /৭০০/.test(shown.subtotal || '') && /৭০০/.test(shown.total || ''), JSON.stringify(shown));
check('The confirm button carries the amount payable', /৭০০/.test(shown.submit || ''), shown.submit);

// Whatever the shop says about delivery is what the page has to say. Asserting a fixed number
// here would only test which offers happened to exist when the suite ran; asserting agreement
// tests the thing that matters — that the page never promises what the order would not honour.
const quoted = await api.post('/api/offers/validate', { deliveryFee: inside, code: '', items: [{ sku: SKU, quantity: 1 }] });
const shopDelivery = Number(quoted.json.deliveryFee ?? inside);
const delivery = await page.locator('#lp-delivery').textContent();
check('The page quotes the delivery the shop would charge', shopDelivery > 0 ? !/ফ্রি/.test(delivery || '') : /ফ্রি/.test(delivery || ''), `page says "${delivery}", shop charges ${shopDelivery}`);
check('The free-delivery banner only shows when delivery really is free', await page.locator('#lp-free-band').isHidden() === (shopDelivery > 0), `banner hidden: ${await page.locator('#lp-free-band').isHidden()}, shop charges ${shopDelivery}`);

// ---- An order placed from the campaign page -----------------------------------------------------
const phone = `019${String(Date.now()).slice(-8)}`;
await page.locator('a.cta[href="#order"]').first().click();
await page.fill('#lp-name', 'ক্যাম্পেইন টেস্ট');
await page.fill('#lp-phone', '123');
await page.fill('#lp-address', 'Malopara, Boalia, Rajshahi 6100');
await page.click('#lp-submit');
await page.waitForTimeout(600);
check('A wrong phone number is refused', !(await page.locator('#lp-error').isHidden()), 'no error was shown');

await page.fill('#lp-phone', phone);
await page.click('#lp-submit');
await page.waitForSelector('#lp-done', { state: 'visible', timeout: 20000 });
check('An order can be placed from the campaign page', Boolean((await page.locator('#lp-order-code').textContent() || '').trim()), 'no order code shown');

const placed = (await api.get(`/api/admin/orders?q=${encodeURIComponent(phone)}`, auth)).json.orders?.[0];
check('The order reaches the shop', Boolean(placed), `nothing found for ${phone}`);
check('It is charged the advertised price', Number(placed?.subtotal) === 700, `subtotal ${placed?.subtotal}`);
check('With the delivery the shop charges', Number(placed?.deliveryFee) === shopDelivery, `delivery ${placed?.deliveryFee}, expected ${shopDelivery}`);
check('And it is marked as coming from this campaign', new RegExp(`Winter Glow ${stamp}`).test(String(placed?.customerNote || '')), placed?.customerNote);

const events = await page.evaluate(() => (window.dataLayer || []).map((entry) => (Array.isArray(entry) ? entry[0] : entry.event)).filter(Boolean));
check('The campaign view is reported', events.includes('campaign_view'), events.join(', '));
check('So is the product view and the purchase', events.includes('view_item') && events.includes('purchase'), events.join(', '));
check('No console errors on the campaign page', errors.length === 0, errors.slice(0, 2).join(' | '));

// ---- A paused campaign is still the owner's to check -------------------------------------------
await api.send(`/api/admin/campaigns/${campaign.json.id}`, 'PATCH', { active: false }, auth);
const closed = await fetch(`${BASE}${PATH}`);
check('A paused campaign is closed to customers', closed.status === 404, `HTTP ${closed.status}`);

// ---- A campaign where the owner picked nothing still has to be orderable -----------------------
// It falls back to a few featured products, and the customer chooses between them. The fallback
// is deliberately short: a landing page that offers two dozen choices sells none of them.
const empty = await api.post('/api/admin/campaigns', { title: `Empty Campaign ${stamp}`, description: 'No products picked', active: 1 }, auth);
const emptyPage = await context.newPage();
await emptyPage.goto(`${BASE}/campaign/${empty.json.slug}`, { waitUntil: 'networkidle' });
const fallback = await emptyPage.evaluate(() => ({
  picks: document.querySelectorAll('[data-lp-pick]').length,
  formShown: !document.getElementById('lp-form')?.hidden,
  total: document.getElementById('lp-total')?.textContent.trim(),
}));
check('A campaign with nothing picked still offers something to buy', fallback.picks > 0 && fallback.formShown, JSON.stringify(fallback));
check('And not the whole catalogue', fallback.picks <= 6, `${fallback.picks} choices`);
check('It is priced too', /[০-৯]/.test(fallback.total || ''), fallback.total);

// Choosing a different product must re-price the page, not leave the first one's total showing.
if (fallback.picks > 1) {
  const first = await emptyPage.locator('#lp-total').textContent();
  // A customer taps the card, not the radio inside it — the radio is only there to hold the choice.
  await emptyPage.locator('.pick.choice').nth(1).click();
  await emptyPage.waitForFunction((was) => document.getElementById('lp-total')?.textContent.trim() !== was, first.trim(), { timeout: 8000 }).catch(() => {});
  const second = await emptyPage.locator('#lp-total').textContent();
  check('Choosing another product re-prices the order', first.trim() !== second.trim(), `${first} → ${second}`);
} else {
  check('Choosing another product re-prices the order', true, 'only one product to choose from');
}

await browser.close();
// Leave the shop as the other suites expect to find it.
await api.send(`/api/admin/campaigns/${campaign.json.id}`, 'DELETE', undefined, auth);
await api.send(`/api/admin/campaigns/${empty.json.id}`, 'DELETE', undefined, auth);
finish();

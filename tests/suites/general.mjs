import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';
import { seedCustomer, seedShop } from '../fixtures.mjs';


const OUT = process.env.RINOVA_TEST_ARTIFACTS || new URL('../artifacts', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };

// This suite reads the shop as a customer and as the owner, so the shop has to be set up:
// delivery charges, bKash, and a customer for the support screens to find.
await seedShop();
const supportCustomer = await seedCustomer('Support Test');

const browser = await chromium.launch(launchOptions());


// On mobile the rail is off-canvas, so open the drawer before tapping a nav item.
async function gotoView(page, view, mobile) {
  if (mobile) { await page.click('#mobile-menu'); await page.waitForTimeout(350); }
  await page.click(`.nav-item[data-view="${view}"]`);
  await page.waitForTimeout(mobile ? 900 : 700);
}

async function newPage(size) {
  const context = await browser.newContext({ viewport: size, ignoreHTTPSErrors: true });
  // Pre-answer the analytics consent banner so it never sits over the controls under test.
  await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  const external = /googletagmanager|google-analytics|fonts\.(googleapis|gstatic)|jsdelivr|smartgentools|ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|status of 409/i;
  page.on('console', (msg) => { if (msg.type() === 'error' && !external.test(msg.text())) errors.push(msg.text()); });
  page.on('pageerror', (error) => { if (!external.test(String(error))) errors.push(String(error)); });
  return { context, page, errors };
}

// ---------- Module 1: product page "More to explore" ----------
{
  const { context, page, errors } = await newPage({ width: 390, height: 844 });
  const products = await (await fetch(`${BASE}/api/products`)).json();
  const slug = products.products[0].slug || products.products[0].id;
  await page.goto(`${BASE}/products/${slug}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-related-row]', { timeout: 15000 });
  const row = page.locator('[data-related-row]');
  const box = await row.boundingBox();
  const metrics = await row.evaluate((el) => ({
    display: getComputedStyle(el).display,
    overflowX: getComputedStyle(el).overflowX,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    cards: el.children.length,
    cardWidth: el.children[0]?.getBoundingClientRect().width ?? 0,
  }));
  check('M1 related row is a vertical stack (not a carousel)', metrics.display === 'grid' && metrics.overflowX !== 'auto' && metrics.overflowX !== 'scroll', JSON.stringify(metrics));
  check('M1 related row does not scroll horizontally', metrics.scrollWidth <= metrics.clientWidth + 1, `scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`);
  check('M1 cards fill the mobile width', metrics.cardWidth > box.width * 0.9, `card=${Math.round(metrics.cardWidth)} row=${Math.round(box.width)}`);
  const arrows = await page.locator('.related-section button, [data-related-prev], [data-related-next], .related-nav').count();
  check('M1 no carousel arrow buttons', arrows === 0, `found ${arrows}`);
  const bodyScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check('M1 page has no horizontal overflow', bodyScroll);
  // Rebuilt review composer.
  const composer = page.locator('.review-write');
  check('Review box is the rebuilt composer', (await composer.count()) === 1 && (await page.locator('.review-form-card').count()) === 0);
  const stars = page.locator('.star-choice');
  check('Review rating uses a star picker', (await stars.count()) === 5);
  await stars.nth(3).click();
  await page.waitForTimeout(200);
  check('Choosing a rating gives written feedback', /4 \/ 5/.test(await page.locator('#review-rating-label').textContent()), await page.locator('#review-rating-label').textContent());
  check('Rating is recorded for submission', (await page.locator('#review-form [name="rating"]').inputValue()) === '4');
  await composer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/12-review-composer.png` });
  await page.screenshot({ path: `${OUT}/01-product-related-mobile.png`, fullPage: false });
  check('M1 no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ---------- Module 2 + payments: checkout ----------
{
  const { context, page, errors } = await newPage({ width: 390, height: 844 });
  const products = await (await fetch(`${BASE}/api/products`)).json();
  const p = products.products[0];
  await page.goto(`${BASE}/checkout.html`);
  await page.evaluate((item) => localStorage.setItem('rinova-bag', JSON.stringify([{ ...item, quantity: 1 }])), p);
  await page.goto(`${BASE}/checkout.html`, { waitUntil: 'networkidle' });

  const partner = page.locator('#delivery-partner');
  const partnerText = (await partner.innerText()).replace(/\s+/g, ' ').trim();
  check('M2 delivery partner shows Steadfast', /delivery partner: steadfast/i.test(partnerText), partnerText);
  // It must be a plain note now, not a form control the customer can touch.
  const editable = await partner.evaluate((el) => el.querySelectorAll('input, select, textarea, [contenteditable]').length);
  check('M2 delivery partner is locked / uneditable', editable === 0, `${editable} editable controls`);
  const submitBox = await page.locator('#checkout-form button[type=submit]').boundingBox();
  const partnerBox = await partner.boundingBox();
  const cardTop = await page.locator('.checkout-card').first().boundingBox();
  check('M2 courier note sits just above Place order, not at the top', partnerBox.y > cardTop.y + 120 && partnerBox.y < submitBox.y, `note=${Math.round(partnerBox.y)} card=${Math.round(cardTop.y)} submit=${Math.round(submitBox.y)}`);

  await page.waitForFunction(() => document.querySelectorAll('#checkout-payment-method option').length >= 2, null, { timeout: 10000 });
  const methods = await page.locator('#checkout-payment-method option').allTextContents();
  check('Payment methods come from the admin config', methods.length === 2 && /cash/i.test(methods[0]) && /bkash/i.test(methods[1]), methods.join(' / '));

  const trxHiddenForCod = await page.locator('#checkout-trx-field').isHidden();
  check('bKash transaction field hidden for cash on delivery', trxHiddenForCod);
  await page.selectOption('#checkout-payment-method', 'bkash');
  await page.waitForTimeout(150);
  const trxVisible = await page.locator('#checkout-trx-field').isVisible();
  const noteVisible = await page.locator('#bkash-payment-note').isVisible();
  const noteText = await page.locator('#bkash-payment-note').textContent();
  check('bKash advance reveals the transaction ID field', trxVisible);
  check('bKash Send Money instructions shown with the number', noteVisible && /01738745949/.test(noteText || ''), (noteText || '').trim().slice(0, 120));

  await page.fill('#checkout-name', 'Playwright Buyer');
  await page.fill('#checkout-phone', '01710000009');
  await page.fill('#checkout-district', 'Dhaka');
  await page.fill('#checkout-upazila', 'Dhanmondi');
  await page.fill('#checkout-address', 'Road 27, Dhanmondi');
  await page.waitForTimeout(700);
  const delivery = await page.locator('#delivery').textContent();
  check('Delivery charge resolves from the district', /90/.test(delivery || ''), (delivery || '').trim());
  await page.screenshot({ path: `${OUT}/02-checkout-mobile.png`, fullPage: true });

  await page.click('#checkout-form button[type=submit]');
  await page.waitForTimeout(400);
  const blocked = await page.evaluate(() => {
    const input = document.querySelector('#checkout-trx-id');
    return { required: input.required, valid: input.checkValidity(), stillOnForm: document.querySelector('#success').hidden };
  });
  check('Advance order without a transaction ID is blocked', blocked.required && !blocked.valid && blocked.stillOnForm, JSON.stringify(blocked));

  await page.fill('#checkout-trx-id', 'TRX-PW-001');
  await page.click('#checkout-form button[type=submit]');
  await page.waitForSelector('#success:not([hidden])', { timeout: 15000 });
  // Read the code from the invoice link — adjacent <strong> tags concatenate in textContent.
  const invoiceHref = await page.locator('#success a[href^="/invoice"]').getAttribute('href');
  const orderCode = decodeURIComponent(new URL(invoiceHref, BASE).searchParams.get('order') || '');
  check('Order placed with bKash advance', /^RNV-/.test(orderCode), orderCode || invoiceHref);
  check('Checkout has no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  // ---------- Module 3: invoice (same session, so the customer token is present) ----------
  {
    await page.setViewportSize({ width: 1100, height: 1400 });
    await page.goto(`${BASE}/invoice.html?order=${orderCode}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.invoice-head', { timeout: 15000 });
    const text = await page.locator('#invoice-root').innerText();
    check('M3 invoice has a Ship From block', /SHIP FROM/i.test(text));
    check('M3 Ship From carries shop name, phone and address', /Rinova BD/.test(text) && /1738-745949/.test(text) && /Rajshahi/.test(text));
    check('M3 invoice has a Ship To block with the customer', /Ship To/i.test(text) && /Playwright Buyer/.test(text) && /Dhanmondi/.test(text));
    check('Invoice number uses the INV- prefix', /INV-\d{6}/.test(text) && !/RNV-\d{6}/.test(text), (text.match(/(INV|RNV)-\d{6}/g) || []).join(' '));
    const disclaimer = 'Please note that you can inspect the product upon delivery by paying the delivery charge while the delivery person is present. Any complaints regarding missing, incorrect, or damaged items will not be accepted once the delivery person has left. Thank you for shopping with us!';
    const footer = (await page.locator('.invoice-footer').innerText()).replace(/\s+/g, ' ').trim();
    check('M3 exact footer disclaimer present', footer.includes(disclaimer), footer.slice(0, 90) + '…');
    const shipFromTop = await page.locator('.invoice-head').boundingBox();
    const shipToTop = await page.locator('.bill-grid').boundingBox();
    check('M3 Ship From sits above Ship To', shipFromTop.y < shipToTop.y, `${Math.round(shipFromTop.y)} < ${Math.round(shipToTop.y)}`);
    await page.screenshot({ path: `${OUT}/03-invoice.png`, fullPage: true });
    check('Invoice has no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  }
  await context.close();
}

// ---------- Module 4 + admin redesign ----------
for (const [label, size] of [['desktop', { width: 1440, height: 950 }], ['mobile', { width: 390, height: 844 }]]) {
  const { context, page, errors } = await newPage(size);
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await page.fill('#login-username', ADMIN_USERNAME);
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.screenshot({ path: `${OUT}/04-admin-login-${label}.png` });
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('#app-shell:not(.hidden)', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/05-admin-overview-${label}.png`, fullPage: false });

  if (label === 'desktop') {
    const sidebar = await page.locator('.sidebar').boundingBox();
    check('Admin sidebar is a fixed rail on desktop', sidebar.x === 0 && sidebar.width > 200 && sidebar.height > 600, JSON.stringify(sidebar));
    const activeMarker = await page.locator('.nav-item.active').evaluate((el) => getComputedStyle(el, '::before').width);
    check('Active nav item has a location marker', activeMarker !== 'auto' && parseFloat(activeMarker) > 0, activeMarker);
  } else {
    const drawerHidden = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right <= 1);
    check('Mobile sidebar starts off-canvas', drawerHidden);
    await page.click('#mobile-menu');
    await page.waitForTimeout(400);
    const drawerOpen = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().left >= -1);
    const backdrop = await page.locator('#sidebar-backdrop').isVisible();
    check('Mobile menu opens the premium drawer with a backdrop', drawerOpen && backdrop);
    await page.screenshot({ path: `${OUT}/06-admin-drawer-mobile.png` });
    // The backdrop sits beneath the drawer, so click the exposed strip on the right.
    await page.mouse.click(size.width - 20, size.height / 2);
    await page.waitForTimeout(400);
    check('Backdrop tap closes the drawer', await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right <= 1));
  }

  const mobile = label === 'mobile';
  // Settings view — grouped panels with the payment toggles
  await gotoView(page, 'settings', mobile);
  await page.waitForTimeout(700);
  const groups = await page.locator('#settings-form .settings-group').count();
  check(`Settings grouped into panels (${label})`, groups >= 4, `${groups} groups`);
  const codToggle = await page.locator('#settings-form select[name="payment_cod_enabled"]').count();
  const bkashToggle = await page.locator('#settings-form select[name="payment_bkash_enabled"]').count();
  check(`Payment method toggles present in Settings (${label})`, codToggle === 1 && bkashToggle === 1);
  await page.screenshot({ path: `${OUT}/07-admin-settings-${label}.png`, fullPage: true });

  // Orders view -> order details editor
  await gotoView(page, 'orders', mobile);
  await page.waitForSelector('#orders-table tr', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/08-admin-orders-${label}.png`, fullPage: false });

  const firstOrderBtn = page.locator('[data-order-details]').first();
  if (await firstOrderBtn.count()) {
    await firstOrderBtn.click();
    await page.waitForSelector('#order-customer-form', { timeout: 15000 });
    await page.waitForTimeout(500);
    check(`M4 edit customer form (${label})`, (await page.locator('#order-customer-form input[name="name"]').count()) === 1);
    check(`M4 copy-to-clipboard button (${label})`, (await page.locator('[data-copy-customer]').count()) === 1);
    const copyBlock = await page.locator('#order-copy-text').evaluate((el) => ({ ws: getComputedStyle(el).whiteSpace, lines: el.textContent.split('\n').length }));
    check(`M4 courier copy block keeps line breaks (${label})`, copyBlock.ws === 'pre-line' && copyBlock.lines >= 3, JSON.stringify(copyBlock));
    check(`M4 order item editor rows (${label})`, (await page.locator('[data-order-item-row]').count()) >= 1);
    check(`M4 add-product button (${label})`, (await page.locator('[data-add-order-item]').count()) === 1);

    // Dynamic recalculation on quantity change
    const before = await page.locator('#order-detail-total').textContent();
    const qty = page.locator('[data-order-item-quantity]').first();
    await qty.fill(String(Number(await qty.inputValue()) + 1));
    await qty.dispatchEvent('input');
    await page.waitForTimeout(300);
    const after = await page.locator('#order-detail-total').textContent();
    check(`M4 total recalculates live on quantity change (${label})`, before !== after && !/৳0$/.test(after), `${before} -> ${after}`);

    // Adding a product recalculates too
    await page.click('[data-add-order-item]');
    await page.waitForTimeout(300);
    const afterAdd = await page.locator('#order-detail-total').textContent();
    check(`M4 total recalculates when a product is added (${label})`, afterAdd !== after, `${after} -> ${afterAdd}`);
    check(`M4 payment card shows the transaction ID (${label})`, /TRX-PW-001|—/.test(await page.locator('.order-payment-card').innerText()));
    await page.screenshot({ path: `${OUT}/09-admin-order-detail-${label}.png`, fullPage: true });
  } else {
    check(`M4 order details reachable (${label})`, false, 'no order rows');
  }

  if (label === 'desktop') {
    // ---------- Campaign Studio ----------
    await gotoView(page, 'campaigns', mobile);
    await page.waitForSelector('#campaign-form', { timeout: 15000 });
    await page.waitForTimeout(900);
    check('Campaign Studio has no CTA label/URL jargon', (await page.locator('#campaign-form [name="ctaLabel"], #campaign-form [name="ctaUrl"]').count()) === 0);
    const runId = Date.now().toString(36);
    const campaignTitle = `Playwright Ad ${runId}`;
    const campaignSlug = `playwright-ad-${runId}`;
    await page.fill('#campaign-form [name="title"]', campaignTitle);
    await page.waitForTimeout(250);
    const slugValue = await page.inputValue('#campaign-slug');
    const urlPreview = await page.locator('#campaign-url-preview').textContent();
    check('Campaign link is generated from the name', slugValue === campaignSlug && urlPreview.includes(`/campaign/${campaignSlug}`), `${slugValue} · ${urlPreview}`);
    const pickerBoxes = page.locator('#campaign-product-picker input[type="checkbox"]');
    check('Campaign product picker lists products', (await pickerBoxes.count()) > 0);
    await pickerBoxes.first().check();
    await pickerBoxes.nth(1).check();
    check('Selected product count updates', (await page.locator('#campaign-selected-count').textContent()).includes('2 selected'));
    await page.selectOption('#campaign-form [name="active"]', '1');
    await page.fill('#campaign-form [name="description"]', 'Two picks for this ad.');
    await page.click('#campaign-submit');
    await page.waitForTimeout(1800);
    const created = await page.locator('#campaign-list').innerText();
    check('New campaign appears with its live link', created.includes(campaignSlug) && /active/i.test(created), created.split('\n').slice(0, 3).join(' | '));
    check('Campaign row offers copy / open / edit / pause / delete', (await page.locator('[data-campaign-copy]').count()) > 0 && (await page.locator('[data-campaign-edit]').count()) > 0 && (await page.locator('[data-campaign-delete]').count()) > 0);
    await page.screenshot({ path: `${OUT}/10-campaign-studio.png`, fullPage: true });

    // The campaign page must actually render for a customer, with the Meta share card in the HTML.
    const liveHtml = await (await fetch(`${BASE}/campaign/${campaignSlug}`)).text();
    check('Campaign page serves real HTML (not the storefront fallback)', liveHtml.includes('campaign-data') && liveHtml.includes(campaignTitle), liveHtml.slice(0, 60));
    check('Campaign page carries Open Graph tags for Meta ads', /og:title/.test(liveHtml) && /og:image/.test(liveHtml) && /og:url/.test(liveHtml) && /robots" content="index/.test(liveHtml));

    // Re-using a link must be refused with a message the owner can act on.
    await page.fill('#campaign-form [name="title"]', campaignTitle);
    await page.fill('#campaign-slug', campaignSlug);
    await page.click('#campaign-submit');
    await page.waitForTimeout(1200);
    check('Duplicate campaign link is refused clearly', /already used/i.test(await page.locator('#campaign-message').textContent()), await page.locator('#campaign-message').textContent());
    await page.click('#campaign-cancel');
    await page.waitForTimeout(300);

    // ---------- product editor: clothing options + gallery + bulk pricing ----------
    await gotoView(page, 'products', mobile);
    await page.waitForTimeout(900);
    await page.click('#new-product');
    await page.waitForSelector('#product-form', { timeout: 10000 });
    check('Gallery is a visual manager, not a JSON textarea', (await page.locator('#gallery-manager').count()) === 1 && (await page.locator('textarea[name="mediaJson"]').count()) === 0);
    check('Bulk pricing is a row editor, not a JSON field', (await page.locator('#tier-rows').count()) === 1 && (await page.locator('input[name="volumeTiers"][type="hidden"]').count()) === 1);
    await page.click('#tier-add');
    await page.waitForTimeout(200);
    check('Adding a bulk price shows plain-language inputs', (await page.locator('.tier-row').count()) === 1);

    const options = page.locator('#product-category option');
    const clothingValue = await options.evaluateAll((nodes) => { const hit = nodes.find((n) => /clothing/i.test(n.textContent)); return hit ? hit.value : ''; });
    check('Clothing category exists', Boolean(clothingValue), clothingValue);
    await page.selectOption('#product-category', clothingValue);
    await page.waitForTimeout(350);
    const optionsText = await page.locator('#product-options-body').innerText();
    check('Clothing shows size and colour pickers', /সাইজ|Size/i.test(optionsText) && /রঙ|Colour/i.test(optionsText));
    const sizeChips = page.locator('[data-option-group="size"] .option-chip');
    check('Clothing size presets are offered', (await sizeChips.count()) >= 6, `${await sizeChips.count()} chips`);
    await sizeChips.filter({ hasText: 'M' }).first().click();
    await page.locator('[data-option-group="color"] .option-chip').first().click();
    await page.waitForTimeout(200);
    check('Chosen size and colour highlight', (await page.locator('.option-chip.selected').count()) >= 2);
    check('Weight field is relabelled for clothing', /কুরিয়ার ওজন/.test(await page.locator('#weight-label').textContent()));
    check('Clothing detail fields present (fabric, fit…)', (await page.locator('[data-option-detail]').count()) >= 4);
    await page.screenshot({ path: `${OUT}/11-product-clothing-options.png`, fullPage: true });
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check(`Admin has no horizontal overflow (${label})`, overflow);
  check(`Admin console clean (${label})`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

// ---------- footer: no duplicates, no admin links ----------
{
  const { context, page, errors } = await newPage({ width: 1280, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.site-footer', { timeout: 15000 });
  const links = await page.locator('.site-footer a').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
  const internal = links.filter((href) => href && href.startsWith('/'));
  const duplicates = internal.filter((href, index) => internal.indexOf(href) !== index);
  check('Footer has no duplicate internal links', duplicates.length === 0, duplicates.join(', '));
  check('Footer exposes no admin link', !links.some((href) => (href || '').includes('/admin')), links.filter((h) => (h || '').includes('/admin')).join(', '));
  check('Footer drops the developer-only robots/xml links', !links.some((href) => /robots\.txt|sitemap\.xml/.test(href || '')));
  check('Footer keeps one site map link', internal.filter((href) => href === '/sitemap.html').length === 1);
  check('Footer has real contact details', (await page.locator('.footer-contact a').count()) === 3);
  const noHorizontal = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check('Home page has no horizontal overflow', noHorizontal);
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/13-footer.png` });
  check('Home page console clean', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// ---------- admin: Team & support ----------
{
  const { context, page, errors } = await newPage({ width: 1440, height: 950 });
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await page.fill('#login-username', ADMIN_USERNAME);
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('#app-shell:not(.hidden)', { timeout: 20000 });
  await page.click('.nav-item[data-view="team"]');
  await page.waitForTimeout(1600);

  check('Owner sees the staff login manager', await page.locator('#staff-panel').isVisible());
  check('Staff form asks for a security question', (await page.locator('#staff-security-question option').count()) >= 3);
  const staffUser = `pw${Date.now().toString(36).slice(-6)}`;
  await page.fill('#staff-form [name="username"]', staffUser);
  await page.fill('#staff-form [name="displayName"]', 'Playwright Staff');
  await page.fill('#staff-form [name="password"]', 'StaffPass2026');
  await page.fill('#staff-form [name="securityAnswer"]', 'Rajshahi');
  await page.click('#staff-form button[type=submit]');
  await page.waitForTimeout(1500);
  check('Owner can create a staff login', (await page.locator('#staff-list').innerText()).includes(staffUser), (await page.locator('#staff-message').textContent()).slice(0, 80));

  await page.fill('#customer-search', supportCustomer.phone);
  await page.waitForTimeout(900);
  check('Customer support search finds the customer', (await page.locator('#customer-list').innerText()).includes(supportCustomer.name), `searched ${supportCustomer.phone}`);
  check('Support offers a temporary password, never a stored one', (await page.locator('[data-customer-reset]').count()) >= 1 && !/current password|show password/i.test(await page.locator('#customer-list').innerText()));

  const sheets = await page.locator('#sheets-list').innerText();
  check('Both business sheets are listed', /Sales & order leads/.test(sheets) && /Customer accounts/.test(sheets), sheets.split('\n')[0]);
  check('Developer health sheet stays hidden from the owner', !(await page.locator('#sheets-list').innerHTML()).includes('10VO_Wxq'));
  await page.screenshot({ path: `${OUT}/14-team-support.png`, fullPage: true });
  check('Team view console clean', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILURES:'); failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`)); process.exit(1); }

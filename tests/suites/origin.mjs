// Focused verification for the GitHub-Pages/Worker split-origin fixes.
import { chromium } from 'playwright';
import { BASE, launchOptions, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';


const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext();
await context.addInitScript(() => { try { localStorage.setItem('rinova-analytics-consent', 'denied'); } catch {} });
const page = await context.newPage();

// 1. robots.txt must exist as a real static file for the Pages-hosted domain.
const robots = await page.goto(`${BASE}/robots.txt`);
const robotsBody = await robots.text();
check('robots.txt is served', robots.status() === 200, `status ${robots.status()}`);
check('robots.txt disallows the admin dashboard', /Disallow:\s*\/admin/.test(robotsBody));
check('robots.txt still allows the storefront', /Allow:\s*\/\s*$/m.test(robotsBody));

// 2. Campaign Studio must build the ad link from the API origin, not the page origin —
//    on the live site those differ (Pages vs Worker) and location.origin yields a dead link.
await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
await page.fill('#login-username', ADMIN_USERNAME);
await page.fill('#login-password', ADMIN_PASSWORD);
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 });
await page.click('.nav-item[data-view="campaigns"]');
await page.waitForSelector('#campaign-form', { timeout: 15000 });

const sameOriginPreview = await page.locator('#campaign-url-prefix').textContent();
check('Campaign prefix uses the API origin when same-origin', sameOriginPreview.startsWith(BASE), sameOriginPreview);

// Repoint the API base at a different origin, exactly as production does, and re-trigger the
// live preview through a real input event.
const FAKE = 'https://rinovabd-worker.abdussalam8480.workers.dev';
await page.evaluate((fake) => { window.RINOVA_API_BASE = `${fake}/api`; }, FAKE);
await page.fill('#campaign-slug', 'winter-glow-edit');
await page.waitForTimeout(300);
const preview = await page.locator('#campaign-url-preview').textContent();
check('Ad link points at the Worker origin, not the dashboard origin',
  preview.trim() === `${FAKE}/campaign/winter-glow-edit`, preview.trim());
check('Ad link no longer points at the static host', !preview.includes('127.0.0.1'), preview.trim());

// 3. The 404 shim on the static host must forward a brand-domain campaign link to the Worker.
const shim = await page.evaluate(async (base) => {
  const html = await (await fetch(`${base}/404.html`)).text();
  // Both routes appear inside escaped regex literals in the shim, so match that form.
  return { hasCampaign: /campaign\\\/|\/campaign\//.test(html), hasProducts: /products\\\/|\/products\//.test(html), hasRuntime: /runtime-config/.test(html) };
}, BASE);
check('404 shim forwards campaign links', shim.hasCampaign);
check('404 shim still forwards product links', shim.hasProducts);
check('404 shim loads runtime config so it knows the Worker origin', shim.hasRuntime);

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

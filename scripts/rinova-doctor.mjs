#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const TARGET_URL = String(process.env.TARGET_URL || 'https://rinovabd-worker.abdussalam8480.workers.dev').replace(/\/+$/, '');
const STRICT = /^(1|true|yes)$/i.test(String(process.env.DOCTOR_STRICT || 'false'));
const RUN_KEY = String(process.env.GITHUB_RUN_ID || `local-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`);
const configuredReportDir = String(process.env.DOCTOR_REPORT_DIR || '').trim();
const OUTPUT_DIR = resolve(ROOT, configuredReportDir || join('Doctor-report', 'runs', `run-${RUN_KEY}`));
const FIX_DIR = join(OUTPUT_DIR, 'Medicine-or-fixd');
const reportLines = [];
const results = [];
const sitemapLinks = [];
const startedAt = new Date().toISOString();

function rel(file) { return relative(ROOT, file) || '.'; }
function escapeMd(value) { return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
function read(file) { return readFileSync(join(ROOT, file), 'utf8'); }
function fileExists(file) { return existsSync(join(ROOT, file)); }
function envSet(names) { return names.some((name) => Boolean(process.env[name])); }
function envName(names) { return names.find((name) => Boolean(process.env[name])) || names[0]; }
function sourceLocation(area, extra = '') {
  const locations = {
    'Root path': '.github/workflows/doctor.yml:24-27', 'Repository files': 'scripts/rinova-doctor.mjs:75-92', 'Static assets': 'web/assets/:1',
    'Workflow configuration': '.github/workflows/doctor.yml:1-91', 'CI/CD workflow': '.github/workflows/rinovabd-ci-cd.yml:1-105',
    Toolchain: 'package.json:1-16', Workspace: 'package.json:5-12; pnpm-workspace.yaml:1-4', 'Wrangler bindings': 'worker/wrangler.toml:1-39',
    Migrations: 'worker/migrations/:1', 'Secret safety': 'scripts/rinova-doctor.mjs:222-232; .github/workflows/doctor.yml:35-53',
    'Developer tooling': 'scripts/rinova-doctor.mjs:234-240', Secrets: '.github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32',
    'Cloudflare account': 'scripts/rinova-doctor.mjs:157-218', 'Cloudflare D1': 'worker/wrangler.toml:13-18; worker/src/index.ts:1-8',
    'Live D1 schema': 'worker/migrations/:1; worker/src/index.ts:1-8', 'Cloudflare KV': 'worker/wrangler.toml:26-29; worker/src/index.ts:1-8',
    'Cloudflare Worker': 'worker/wrangler.toml:1-4', 'Optional R2': 'worker/wrangler.toml:27-34; worker/src/index.ts:1-8',
    'Live website': 'worker/src/index.ts:875-1085; deployed URL', 'Public endpoint': 'worker/src/index.ts:875-1085',
    Sitemap: 'worker/src/index.ts:1010-1050; deployed /sitemap.xml', 'Sitemap link': 'worker/src/index.ts:1010-1050; URL from deployed /sitemap.xml',
    'API security': 'worker/src/index.ts:1-8; protected route',
  };
  return extra ? `${locations[area] || 'repository root'}; ${extra}` : (locations[area] || 'repository root');
}
function add(status, area, message, fix = '', location = sourceLocation(area)) {
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  results.push({ status, area, message, fix, location });
  const suffix = fix ? ` — Fix: ${fix}` : '';
  console.log(`${icon} [${area}] ${message}${suffix}`);
  reportLines.push(`| ${icon} ${status} | ${escapeMd(area)} | ${escapeMd(message)} | ${escapeMd(location)} | ${escapeMd(fix)} |`);
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { redirect: 'follow', ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 300); }
    return { response, body, text };
  } finally { clearTimeout(timer); }
}

async function publicCheck(path, expected = [200]) {
  const url = path.startsWith('http') ? path : `${TARGET_URL}${path}`;
  try {
    const result = await request(url);
    if (!expected.includes(result.response.status)) {
      add('FAIL', path.includes('admin') || path.includes('account') ? 'API security' : 'Public endpoint', `${url} returned HTTP ${result.response.status}`, `Check the deployed route and Worker code for ${url}.`, sourceLocation(path.includes('admin') || path.includes('account') ? 'API security' : 'Public endpoint', url));
      return null;
    }
    add('PASS', path.includes('admin') || path.includes('account') ? 'API security' : path === '/' ? 'Live website' : 'Public endpoint', `${url} returned HTTP ${result.response.status}`, '', sourceLocation(path.includes('admin') || path.includes('account') ? 'API security' : path === '/' ? 'Live website' : 'Public endpoint', url));
    return result;
  } catch (error) {
    add('FAIL', path === '/' ? 'Live website' : 'Public endpoint', `${url} could not be reached (${error.name === 'AbortError' ? 'timeout' : 'network error'})`, `Check TARGET_URL and Worker availability: ${TARGET_URL}.`, sourceLocation(path === '/' ? 'Live website' : 'Public endpoint', url));
    return null;
  }
}

async function cloudflareRequest(path, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUD_FLARE_API;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUD_FLARE_ACCOUNT_ID;
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok || body?.success === false) { const code = body?.errors?.[0]?.code; const error = new Error(`HTTP ${response.status}${code ? ` / Cloudflare code ${code}` : ''}`); error.status = response.status; error.code = code; throw error; }
  return { body: body?.result, accountId };
}

function checkRootAndFiles() {
  const expectedRoot = process.env.GITHUB_WORKSPACE ? resolve(process.env.GITHUB_WORKSPACE) : ROOT;
  if (resolve(ROOT) === expectedRoot) add('PASS', 'Root path', `Doctor running from repository root ${rel(ROOT)}`);
  else add('FAIL', 'Root path', `Doctor root mismatch: ${rel(ROOT)}`, 'Use the checked-out repository root; do not use a developer-specific absolute path.');
  const required = [
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'web/build.mjs', 'web/index.html', 'web/styles.css', 'web/app.js', 'web/account.html', 'web/account.js',
    'web/checkout.html', 'web/checkout.js', 'web/product.html', 'web/product.js', 'web/blog.html', 'web/blog.js', 'web/admin/index.html', 'web/admin/app.js', 'web/admin/styles.css',
    'web/admin/guide/index.html', 'worker/package.json', 'worker/src/index.ts', 'worker/wrangler.toml', 'worker/schema.sql', 'scripts/rinova-doctor.mjs', 'Doctor-report/README.md', 'Doctor-report/Medicine-or-fixd/README.md',
    '.github/workflows/rinovabd-ci-cd.yml', '.github/workflows/doctor.yml',
  ];
  const missing = required.filter((file) => !fileExists(file));
  if (missing.length) add('FAIL', 'Repository files', `${missing.length} required path(s) missing: ${missing.join(', ')}`, 'Restore each missing path at the repository-relative location shown.');
  else add('PASS', 'Repository files', `${required.length} required application, workflow, report-guide and diagnostic paths are present`);
  if (fileExists('web/assets')) add('PASS', 'Static assets', 'web/assets directory is present');
  else add('FAIL', 'Static assets', 'web/assets directory is missing', 'Restore web/assets; storefront build and image URLs depend on it.');
}

function checkWorkflowFiles() {
  const doctor = read('.github/workflows/doctor.yml');
  const deploy = read('.github/workflows/rinovabd-ci-cd.yml');
  const doctorMarkers = [['workflow_dispatch:', 'manual trigger'], ['working-directory: .', 'root-aware workspace'], ['scripts/rinova-doctor.mjs', 'doctor script'], ['actions/upload-artifact@v4', 'redacted report artifact'], ['GITHUB_STEP_SUMMARY', 'job summary'], ['pnpm install --frozen-lockfile', 'locked dependency install'], ['Doctor-report/', 'per-run report directory'], ['DOCTOR_REPORT_DIR:', 'per-run report output'], ['contents: write', 'report commit permission'], ['Publish report files to Doctor-report', 'repository report publication'], ['git push origin', 'report push']];
  const missingDoctor = doctorMarkers.filter(([marker]) => !doctor.includes(marker)).map(([, label]) => label);
  if (missingDoctor.length) add('FAIL', 'Workflow configuration', `doctor.yml is missing: ${missingDoctor.join(', ')}`, 'Keep manual trigger, repository-root execution, report artifact, job summary, report write permission and Doctor-report repository publication in the workflow.');
  else add('PASS', 'Workflow configuration', 'doctor.yml has manual trigger, rooted execution and per-run report artifact configuration');
  const deployMarkers = ['pull_request:', 'push:', 'workflow_dispatch:', 'pnpm install --frozen-lockfile', 'pnpm build', 'cloudflare/wrangler-action@v3', 'workingDirectory: worker'];
  const missingDeploy = deployMarkers.filter((marker) => !deploy.includes(marker));
  if (missingDeploy.length) add('FAIL', 'CI/CD workflow', `rinovabd-ci-cd.yml is missing: ${missingDeploy.join(', ')}`, 'Restore the canonical validation/deploy markers and keep Worker commands scoped to worker/.');
  else add('PASS', 'CI/CD workflow', 'build, typecheck, deployment and manual trigger markers are present');
  if (/\/home\/ubuntu\/rinovabd\.com|C:\\Users\\|\/Users\//.test(doctor + deploy)) add('FAIL', 'Root path', 'A developer-specific absolute path is present in workflow YAML', 'Use repository-relative paths only.');
  else add('PASS', 'Root path', 'Workflow YAML contains no developer-specific absolute path');
}

function checkPackages() {
  const root = JSON.parse(read('package.json')); const worker = JSON.parse(read('worker/package.json')); const web = JSON.parse(read('web/package.json'));
  const missing = ['build', 'typecheck', 'test'].filter((name) => !root.scripts?.[name]);
  if (missing.length) add('FAIL', 'Toolchain', `root package.json is missing scripts: ${missing.join(', ')}`, 'Restore canonical build, typecheck and test scripts.'); else add('PASS', 'Toolchain', 'root build, typecheck and test scripts are available');
  if (worker.scripts?.typecheck && web.scripts?.build && Array.isArray(root.workspaces) && root.workspaces.includes('worker') && root.workspaces.includes('web')) add('PASS', 'Workspace', 'worker and web workspaces expose expected commands'); else add('FAIL', 'Workspace', 'worker/web workspace membership or scripts are incomplete', 'Check package.json and pnpm-workspace.yaml.');
}

function checkWrangler() {
  const text = read('worker/wrangler.toml');
  const required = [['name = "rinovabd-worker"', 'Worker name'], ['main = "src/index.ts"', 'Worker entrypoint'], ['migrations_dir = "migrations"', 'D1 migrations directory'], ['binding = "DB"', 'D1 DB binding'], ['binding = "CACHE"', 'KV CACHE binding'], ['[ai]', 'Workers AI section'], ['binding = "AI"', 'Workers AI binding'], ['[assets]', 'Assets section'], ['binding = "ASSETS"', 'Assets binding'], ['directory = "../web"', 'Assets root directory'], ['SHOP_NAME =', 'SHOP_NAME var'], ['SHOP_PHONE =', 'SHOP_PHONE var'], ['AI_MODEL =', 'AI_MODEL var'], ['WHATSAPP_NUMBER =', 'WhatsApp var']];
  const missing = required.filter(([marker]) => !text.includes(marker)).map(([, label]) => label);
  if (missing.length) add('FAIL', 'Wrangler bindings', `worker/wrangler.toml is missing: ${missing.join(', ')}`, 'Restore required D1, KV, Workers AI, assets and shop-variable bindings.'); else add('PASS', 'Wrangler bindings', 'D1, KV, Workers AI, static assets and shop variables are configured');
  if (/^\s*#\s*\[\[r2_buckets\]\]/m.test(text) && /PRODUCT_IMAGES/.test(text)) add('WARN', 'Optional R2', 'PRODUCT_IMAGES R2 binding is intentionally disabled', 'Enable R2, create rinovabd-product-images, uncomment the binding, then rerun doctor.yml.'); else if (/\[\[r2_buckets\]\]/.test(text) && /binding\s*=\s*"PRODUCT_IMAGES"/.test(text)) add('PASS', 'Optional R2', 'PRODUCT_IMAGES R2 binding is configured'); else add('WARN', 'Optional R2', 'PRODUCT_IMAGES R2 binding was not detected', 'Keep URL/static media workflows until R2 is enabled and bound.');
}

function checkMigrations() {
  const files = readdirSync(join(ROOT, 'worker/migrations')).filter((name) => /^\d+[-_].+\.sql$/.test(name)).sort();
  const numbers = files.map((name) => Number(name.match(/^\d+/)?.[0] || 0)); const gaps = []; for (let i = 0; i < numbers.length; i += 1) if (numbers[i] !== i + 1) gaps.push(i + 1);
  if (gaps.length) add('FAIL', 'Migrations', `Migration numbering has gap(s): ${gaps.join(', ')}`, 'Add or restore missing sequential migrations before deploying dependent Worker queries.'); else add('PASS', 'Migrations', `${files.length} sequential migration files found (${files[0]} through ${files.at(-1)})`);
  const editorNote = files.find((name) => /^0010[-_]/.test(name)); const blog = files.find((name) => /^0011[-_]/.test(name));
  if (!editorNote || !read(`worker/migrations/${editorNote}`).includes('editor_note')) add('FAIL', 'Migrations', 'Editor note migration is missing editor_note', 'Verify migration 0010 is committed and applied before Worker deployment.'); else add('PASS', 'Migrations', 'Editor note migration contains editor_note');
  if (!blog || !read(`worker/migrations/${blog}`).includes('blog_posts')) add('FAIL', 'Migrations', 'Blog editor migration is missing blog_posts changes', 'Verify the blog schema migration is committed and applied before CMS deployment.'); else add('PASS', 'Migrations', 'Blog editor/SEO/media migration is present');
}

function checkSecretSafeSource() {
  const files = ['.github/workflows/doctor.yml', '.github/workflows/rinovabd-ci-cd.yml', 'worker/wrangler.toml', 'scripts/rinova-doctor.mjs']; const suspicious = [];
  for (const file of files) { const text = read(file); if (/ADMIN_PASSWORD\s*=\s*["'][^$\n][^"']+|CLOUDFLARE_API_TOKEN\s*=\s*["'][^$\n][^"']+/.test(text)) suspicious.push(file); }
  if (suspicious.length) add('FAIL', 'Secret safety', `Possible hard-coded secret assignment found in: ${suspicious.join(', ')}`, 'Use GitHub or Worker secrets; never commit values.'); else add('PASS', 'Secret safety', 'Doctor/workflow/config files contain no obvious hard-coded secret assignment');
}

function checkLocalCommands() {
  try { execFileSync('node', ['--check', 'scripts/rinova-doctor.mjs'], { cwd: ROOT, stdio: 'pipe' }); add('PASS', 'Developer tooling', 'Doctor script passes node --check'); } catch { add('FAIL', 'Developer tooling', 'Doctor script failed node --check', 'Fix JavaScript syntax before running the manual workflow.'); }
}

async function checkCloudflareResources() {
  const tokenNames = ['CLOUDFLARE_API_TOKEN', 'CLOUD_FLARE_API']; const accountNames = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUD_FLARE_ACCOUNT_ID'];
  if (!envSet(tokenNames)) add('WARN', 'Secrets', `Cloudflare API token is ${envName(tokenNames)}: missing`, 'Add the token as a GitHub Actions secret; the value is never printed.'); else add('PASS', 'Secrets', `Cloudflare API token is ${envName(tokenNames)}: set (value hidden)`);
  if (!envSet(accountNames)) add('WARN', 'Secrets', `Cloudflare account ID is ${envName(accountNames)}: missing`, 'Add the account ID as a secret or variable; the value is never printed.'); else add('PASS', 'Secrets', `Cloudflare account ID is ${envName(accountNames)}: set (value hidden)`);
  const secretGroups = [{ label: 'Admin username (ADMIN_USERNAME)', names: ['ADMIN_USERNAME'], required: true }, { label: 'Admin password (ADMIN_PASSWORD)', names: ['ADMIN_PASSWORD'], required: true }, { label: 'Admin automation token (ADMIN_API_TOKEN)', names: ['ADMIN_API_TOKEN'] }, { label: 'Steadfast key pair (STEADFAST_API_KEY / STEADFAST_SECRET_KEY)', names: ['STEADFAST_API_KEY', 'STEADFAST_SECRET_KEY'] }, { label: 'Steadfast webhook token (STEADFAST_WEBHOOK_TOKEN)', names: ['STEADFAST_WEBHOOK_TOKEN'] }, { label: 'Gemini fallback (GEMINI_API_KEY / GEMINI_API_KEY_1 / GEMINI_API_KEY_2)', names: ['GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2'] }];
  for (const group of secretGroups) if (envSet(group.names)) add('PASS', 'Secrets', `${group.label}: set (value hidden)`); else add('WARN', 'Secrets', `${group.label}: not set`, group.required ? 'Set the Worker secret before using the associated production feature.' : 'Optional until the associated integration is intentionally activated.');
  if (!envSet(tokenNames) || !envSet(accountNames)) return;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUD_FLARE_ACCOUNT_ID;
  try { await cloudflareRequest(`/accounts/${accountId}`); add('PASS', 'Cloudflare account', 'Account API is reachable with the configured token'); } catch (error) { add('FAIL', 'Cloudflare account', `Account API rejected the token (${error.message})`, 'Review token scope and account ID; rotate the secret without printing it.'); return; }
  const config = read('worker/wrangler.toml'); const dbId = config.match(/database_id\s*=\s*"([^"]+)"/)?.[1]; const kvId = config.match(/id\s*=\s*"([^"]+)"[\s\S]{0,100}?binding\s*=\s*"CACHE"/)?.[1];
  try {
    const dbList = await cloudflareRequest(`/accounts/${accountId}/d1/database?name=rinovabd-db&per_page=50`); const db = Array.isArray(dbList.body) ? dbList.body.find((item) => item.name === 'rinovabd-db') : null;
    if (db && (!dbId || db.uuid === dbId)) add('PASS', 'Cloudflare D1', 'rinovabd-db is visible and matches Wrangler configuration'); else add('FAIL', 'Cloudflare D1', 'rinovabd-db is missing or does not match Wrangler configuration', 'Check D1 database name/ID and read permission.');
    if (db?.uuid) {
      const schema = await cloudflareRequest(`/accounts/${accountId}/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','orders','customer_sessions','blog_posts','product_reviews') ORDER BY name" }) }); const names = (schema.body?.[0]?.results || []).map((row) => row.name); const needed = ['blog_posts', 'customer_sessions', 'orders', 'product_reviews', 'products']; const missing = needed.filter((name) => !names.includes(name));
      if (missing.length) add('FAIL', 'Live D1 schema', `Required table(s) missing: ${missing.join(', ')}`, 'Apply the missing migration through the supported D1 process; no rows were read.'); else add('PASS', 'Live D1 schema', 'Required commerce, account, review and blog tables are present (schema only; no customer rows read)');
      const columns = await cloudflareRequest(`/accounts/${accountId}/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql: "SELECT name FROM pragma_table_info('products') WHERE name IN ('badges_json','editor_note') ORDER BY name" }) }); const columnNames = (columns.body?.[0]?.results || []).map((row) => row.name);
      if (columnNames.includes('badges_json') && columnNames.includes('editor_note')) add('PASS', 'Live D1 schema', 'Product badge and editor-note columns are present'); else add('FAIL', 'Live D1 schema', 'Product badge/editor-note columns are incomplete', 'Apply migrations 0009 and 0010 to live D1.');
    }
  } catch (error) { add('FAIL', 'Cloudflare D1', `D1 read-only check failed (${error.message})`, 'Review D1 read permission, database ID and migration state. No data was written.'); }
  try { const kvList = await cloudflareRequest(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`); const match = Array.isArray(kvList.body) ? kvList.body.find((item) => item.title === 'rinovabd-cache' || item.id === kvId) : null; if (match && (!kvId || match.id === kvId)) add('PASS', 'Cloudflare KV', 'rinovabd-cache is visible and matches Wrangler configuration'); else add('FAIL', 'Cloudflare KV', 'rinovabd-cache is missing or does not match Wrangler configuration', 'Check KV namespace ID and Workers KV read permission.'); } catch (error) { add('FAIL', 'Cloudflare KV', `KV read-only check failed (${error.message})`, 'Review Workers KV read permission and namespace configuration.'); }
  try { const scripts = await cloudflareRequest(`/accounts/${accountId}/workers/scripts`); const deployed = Array.isArray(scripts.body) && scripts.body.some((item) => item.id === 'rinovabd-worker'); if (deployed) add('PASS', 'Cloudflare Worker', 'rinovabd-worker is visible in the account'); else add('WARN', 'Cloudflare Worker', 'rinovabd-worker is not visible in the account', 'Deploy from main or check Workers Scripts:Read permission.'); } catch (error) { add('FAIL', 'Cloudflare Worker', `Worker list check failed (${error.message})`, 'Review Workers Scripts:Read permission and account ID.'); }
  try { const buckets = await cloudflareRequest(`/accounts/${accountId}/r2/buckets`); const names = (buckets.body?.buckets || []).map((item) => item.name); if (names.includes('rinovabd-product-images')) add('PASS', 'Optional R2', 'rinovabd-product-images bucket is visible'); else add('WARN', 'Optional R2', 'R2 API is available but rinovabd-product-images bucket is not present', 'Create and bind the bucket only after enabling R2.'); } catch (error) { if (error.code === 10042) add('WARN', 'Optional R2', 'R2 is not enabled for this account (Cloudflare code 10042)', 'Enable R2 before testing direct product/blog media uploads.'); else add('FAIL', 'Optional R2', `R2 read-only check failed (${error.message})`, 'Review Workers R2 Storage:Read permission; this doctor does not create buckets.'); }
}

function decodeXml(value) { return String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
async function checkSitemap(sitemapResult) {
  if (!sitemapResult) return;
  const urls = [...String(sitemapResult.text || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1]).trim()).filter(Boolean);
  if (!urls.length) { add('FAIL', 'Sitemap', 'Live sitemap returned no <loc> URLs', 'Check the sitemap generator in worker/src/index.ts and ensure active product/blog routes are present.'); return; }
  add('PASS', 'Sitemap', `Live sitemap contains ${urls.length} URL(s); checking each link individually`);
  const origin = new URL(TARGET_URL).origin;
  for (const url of urls) {
    let parsed;
    try { parsed = new URL(url); } catch { sitemapLinks.push({ url, status: 'invalid', ok: false, note: 'URL cannot be parsed' }); add('FAIL', 'Sitemap link', `${url} is not a valid URL`, 'Fix the sitemap URL generator so each <loc> is an absolute URL.', sourceLocation('Sitemap link', url)); continue; }
    if (parsed.origin !== origin) { sitemapLinks.push({ url, status: 'skipped', ok: false, note: `external origin ${parsed.origin}` }); add('WARN', 'Sitemap link', `${url} was not fetched because it is outside the target origin`, 'Keep sitemap links on the owned site or review the external origin intentionally.', sourceLocation('Sitemap link', url)); continue; }
    try {
      const result = await request(url); const ok = result.response.status >= 200 && result.response.status < 400; sitemapLinks.push({ url, status: result.response.status, ok, note: ok ? 'reachable' : 'HTTP error' });
      if (ok) add('PASS', 'Sitemap link', `${url} returned HTTP ${result.response.status}`, '', sourceLocation('Sitemap link', url)); else add('FAIL', 'Sitemap link', `${url} returned HTTP ${result.response.status}`, `Fix the route or sitemap entry for ${url}, then rerun doctor.yml.`, sourceLocation('Sitemap link', url));
    } catch (error) { sitemapLinks.push({ url, status: 'network error', ok: false, note: error.name === 'AbortError' ? 'timeout' : 'network error' }); add('FAIL', 'Sitemap link', `${url} could not be reached`, `Fix the route or deployment for ${url}, then rerun doctor.yml.`, sourceLocation('Sitemap link', url)); }
  }
}

function checkSecretSafeReport(report) { if (/ADMIN_PASSWORD\s*[:=]\s*[^$\n]*[A-Za-z0-9]{8}/.test(report) || /CLOUDFLARE_API_TOKEN\s*[:=]\s*[^$\n]*[A-Za-z0-9]{12}/.test(report)) throw new Error('Report safety check detected a possible secret value'); }

function writeReports() {
  mkdirSync(FIX_DIR, { recursive: true });
  const counts = results.reduce((acc, item) => { acc[item.status] += 1; return acc; }, { PASS: 0, WARN: 0, FAIL: 0 }); const overall = counts.FAIL ? 'ACTION REQUIRED' : counts.WARN ? 'READY WITH WARNINGS' : 'HEALTHY';
  const audit = ['# Rinova BD Doctor Audit Report', '', `- **Overall:** ${overall}`, `- **Started:** ${startedAt}`, `- **Repository root:** \`${rel(ROOT)}\``, `- **Target website:** \`${TARGET_URL}\``, `- **Report directory:** \`${rel(OUTPUT_DIR)}\``, '- **Mode:** Read-only. No customer rows, product rows, orders, KV values or secret values were printed or changed.', '', '| Result | Area | Finding | Root file / location | Developer fix |', '|---|---|---|---|---|', ...reportLines, '', '## Sitemap link summary', '', `- **Total URLs found:** ${sitemapLinks.length}`, `- **Reachable:** ${sitemapLinks.filter((item) => item.ok).length}`, `- **Needs attention:** ${sitemapLinks.filter((item) => !item.ok).length}`, '', 'See `sitemap-links.md` for every URL and HTTP result.', '', '## How to use this report', '', 'Open `Medicine-or-fixd/fix-report.md` for only the WARN/FAIL items. Each item includes a repository-relative root file, line-area reference, problem, required change and verification step. Line numbers refer to the checked-out commit and should be rechecked after edits.'].join('\n');
  const sitemapReport = ['# Sitemap Link Audit', '', `Target: ${TARGET_URL}/sitemap.xml`, '', '| Status | URL | Result | Note |', '|---|---|---|---|', ...sitemapLinks.map((item) => `| ${item.ok ? '✅ PASS' : item.status === 'skipped' ? '⚠️ WARN' : '❌ FAIL'} | ${escapeMd(item.url)} | ${escapeMd(item.status)} | ${escapeMd(item.note)} |`), ''].join('\n');
  const nonPass = results.filter((item) => item.status !== 'PASS'); const fixSections = nonPass.length ? nonPass.map((item, index) => [`## ${index + 1}. ${item.status}: ${item.area}`, '', `- **Root file / location:** \`${item.location}\``, `- **Problem found:** ${item.message}`, `- **What to change:** ${item.fix || 'Review the listed root file and correct the reported contract.'}`, '- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.', '- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.'].join('\n')).join('\n\n') : 'No WARN or FAIL findings. No medicine required for this run.';
  const fixReport = ['# Medicine-or-fixd Report', '', `- **Audit:** \`${rel(OUTPUT_DIR)}\``, `- **Overall:** ${overall}`, '- **Secret policy:** Names and set/missing status only; secret values are never written.', '', fixSections, ''].join('\n');
  const summary = { overall, counts, targetUrl: TARGET_URL, readOnly: true, startedAt, reportDirectory: rel(OUTPUT_DIR), files: ['audit-report.md', 'sitemap-links.md', 'summary.json', 'Medicine-or-fixd/fix-report.md'], sitemap: { total: sitemapLinks.length, reachable: sitemapLinks.filter((item) => item.ok).length, needsAttention: sitemapLinks.filter((item) => !item.ok) .length } };
  checkSecretSafeReport(audit + sitemapReport + fixReport + JSON.stringify(summary));
  writeFileSync(join(OUTPUT_DIR, 'audit-report.md'), `${audit}\n`, 'utf8'); writeFileSync(join(OUTPUT_DIR, 'sitemap-links.md'), `${sitemapReport}\n`, 'utf8'); writeFileSync(join(FIX_DIR, 'fix-report.md'), `${fixReport}\n`, 'utf8'); writeFileSync(join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const summaryMd = [`# Rinova BD Doctor`, '', `**${overall}** — ${counts.PASS} pass, ${counts.WARN} warning, ${counts.FAIL} fail`, '', `Report folder: \`${rel(OUTPUT_DIR)}\``, '', `Sitemap: ${sitemapLinks.filter((item) => item.ok).length}/${sitemapLinks.length} links reachable`, '', 'Open the uploaded artifact for `audit-report.md`, `sitemap-links.md`, and `Medicine-or-fixd/fix-report.md`.'].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryMd}\n`, { encoding: 'utf8', flag: 'a' });
  console.log(`\nDoctor result: ${overall} — ${counts.PASS} pass, ${counts.WARN} warning, ${counts.FAIL} fail`); console.log(`Reports written to ${rel(OUTPUT_DIR)}`);
  if (STRICT && counts.FAIL) process.exitCode = 1;
}

console.log(`\nRinova BD Doctor — read-only diagnostics\nRoot: ${ROOT}\nTarget: ${TARGET_URL}\n`);
checkRootAndFiles(); checkWorkflowFiles(); checkPackages(); checkWrangler(); checkMigrations(); checkSecretSafeSource(); checkLocalCommands(); await checkCloudflareResources();
await publicCheck('/'); await publicCheck('/api/health'); await publicCheck('/api/config'); await publicCheck('/api/categories'); await publicCheck('/api/products'); await publicCheck('/api/content/home');
const sitemapResult = await publicCheck('/sitemap.xml'); await checkSitemap(sitemapResult);
await publicCheck('/admin/'); await publicCheck('/account.html'); await publicCheck('/blog.html?slug=a-gentler-way-to-build-your-morning-routine');
for (const path of ['/api/admin/session', '/api/admin/products', '/api/admin/media-library', '/api/account/me', '/api/account/orders']) await publicCheck(path, [401]);
writeReports();

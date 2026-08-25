#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const TARGET_URL = String(process.env.TARGET_URL || 'https://rinovabd-worker.abdussalam8480.workers.dev').replace(/\/+$/, '');
const STRICT = /^(1|true|yes)$/i.test(String(process.env.DOCTOR_STRICT || 'false'));
const reportLines = [];
const results = [];
const startedAt = new Date().toISOString();

function rel(file) { return relative(ROOT, file) || '.'; }
function add(status, area, message, fix = '') {
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  results.push({ status, area, message, fix });
  const suffix = fix ? ` — Fix: ${fix}` : '';
  console.log(`${icon} [${area}] ${message}${suffix}`);
  reportLines.push(`| ${icon} ${status} | ${area} | ${message.replace(/\|/g, '\\|')} | ${fix.replace(/\|/g, '\\|')} |`);
}
function read(file) { return readFileSync(join(ROOT, file), 'utf8'); }
function fileExists(file) { return existsSync(join(ROOT, file)); }
function envSet(names) { return names.some((name) => Boolean(process.env[name])); }
function envName(names) { return names.find((name) => Boolean(process.env[name])) || names[0]; }
function jsonSafe(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { redirect: 'follow', ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 120); }
    return { response, body };
  } finally { clearTimeout(timer); }
}

async function publicCheck(path, expected = [200]) {
  try {
    const { response, body } = await request(`${TARGET_URL}${path}`);
    if (!expected.includes(response.status)) {
      add('FAIL', 'Public endpoint', `${path} returned HTTP ${response.status}`, `Check the deployed Worker route and TARGET_URL (${TARGET_URL}).`);
      return null;
    }
    add('PASS', 'Public endpoint', `${path} returned HTTP ${response.status}`);
    return { response, body };
  } catch (error) {
    add('FAIL', 'Public endpoint', `${path} could not be reached (${error.name === 'AbortError' ? 'timeout' : 'network error'})`, `Check TARGET_URL and Worker availability: ${TARGET_URL}.`);
    return null;
  }
}

async function cloudflareRequest(path, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUD_FLARE_API;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUD_FLARE_ACCOUNT_ID;
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok || body?.success === false) {
    const code = body?.errors?.[0]?.code;
    const error = new Error(`HTTP ${response.status}${code ? ` / Cloudflare code ${code}` : ''}`);
    error.status = response.status;
    error.code = code;
    throw error;
  }
  return { body: body?.result, accountId };
}

function checkRootAndFiles() {
  const expectedRoot = process.env.GITHUB_WORKSPACE ? resolve(process.env.GITHUB_WORKSPACE) : ROOT;
  if (resolve(ROOT) === expectedRoot) add('PASS', 'Root path', `Doctor running from repository root ${rel(ROOT)}`);
  else add('FAIL', 'Root path', `Doctor root mismatch: ${rel(ROOT)}`, 'Use GITHUB_WORKSPACE or run from the repository root; do not use a developer-specific absolute path.');
  const required = [
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'web/build.mjs', 'web/index.html', 'web/styles.css', 'web/app.js',
    'web/account.html', 'web/account.js', 'web/checkout.html', 'web/checkout.js', 'web/product.html', 'web/product.js',
    'web/blog.html', 'web/blog.js', 'web/admin/index.html', 'web/admin/app.js', 'web/admin/styles.css', 'web/admin/guide/index.html',
    'worker/package.json', 'worker/src/index.ts', 'worker/wrangler.toml', 'worker/schema.sql', 'scripts/rinova-doctor.mjs',
    '.github/workflows/rinovabd-ci-cd.yml', '.github/workflows/doctor.yml',
  ];
  const missing = required.filter((file) => !fileExists(file));
  if (missing.length) add('FAIL', 'Repository files', `${missing.length} required path(s) missing: ${missing.join(', ')}`, 'Restore the missing path(s) at the repository-relative location shown.');
  else add('PASS', 'Repository files', `${required.length} required application, workflow and diagnostic paths are present`);
  const assets = fileExists('web/assets');
  if (assets) add('PASS', 'Static assets', 'web/assets directory is present');
  else add('FAIL', 'Static assets', 'web/assets directory is missing', 'Restore web/assets; storefront build and image URLs depend on it.');
}

function checkWorkflowFiles() {
  const doctor = read('.github/workflows/doctor.yml');
  const deploy = read('.github/workflows/rinovabd-ci-cd.yml');
  const doctorMarkers = [
    ['workflow_dispatch:', 'manual trigger'], ['working-directory: .', 'root-aware workspace'], ['scripts/rinova-doctor.mjs', 'doctor script'],
    ['actions/upload-artifact@v4', 'redacted report artifact'], ['GITHUB_STEP_SUMMARY', 'job summary'], ['pnpm install --frozen-lockfile', 'locked dependency install'],
  ];
  const missingDoctor = doctorMarkers.filter(([marker]) => !doctor.includes(marker)).map(([, label]) => label);
  if (missingDoctor.length) add('FAIL', 'Workflow configuration', `doctor.yml is missing: ${missingDoctor.join(', ')}`, 'Keep the diagnostic rooted at GITHUB_WORKSPACE and publish the redacted report as a job summary/artifact.');
  else add('PASS', 'Workflow configuration', 'doctor.yml has manual trigger, rooted execution, locked install and redacted report output');
  const deployMarkers = ['pull_request:', 'push:', 'workflow_dispatch:', 'pnpm install --frozen-lockfile', 'pnpm build', 'cloudflare/wrangler-action@v3', 'workingDirectory: worker'];
  const missingDeploy = deployMarkers.filter((marker) => !deploy.includes(marker));
  if (missingDeploy.length) add('FAIL', 'CI/CD workflow', `rinovabd-ci-cd.yml is missing: ${missingDeploy.join(', ')}`, 'Restore the canonical validation/deploy markers and keep Worker commands scoped to worker/.');
  else add('PASS', 'CI/CD workflow', 'build, typecheck, deployment and manual trigger markers are present');
  if (/\/home\/ubuntu\/rinovabd\.com|C:\\Users\\|\/Users\//.test(doctor + deploy)) add('FAIL', 'Root path', 'A developer-specific absolute path is present in workflow YAML', 'Use ${{ github.workspace }} or repository-relative paths only.');
  else add('PASS', 'Root path', 'Workflow YAML contains no developer-specific absolute path');
}

function checkPackages() {
  const root = JSON.parse(read('package.json'));
  const worker = JSON.parse(read('worker/package.json'));
  const web = JSON.parse(read('web/package.json'));
  const scripts = root.scripts || {};
  const missing = ['build', 'typecheck', 'test'].filter((name) => !scripts[name]);
  if (missing.length) add('FAIL', 'Toolchain', `root package.json is missing scripts: ${missing.join(', ')}`, 'Restore canonical scripts so local and CI diagnosis use the same commands.');
  else add('PASS', 'Toolchain', 'root build, typecheck and test scripts are available');
  if (worker.scripts?.typecheck && web.scripts?.build && Array.isArray(root.workspaces) && root.workspaces.includes('worker') && root.workspaces.includes('web')) add('PASS', 'Workspace', 'worker and web workspaces expose their expected build commands');
  else add('FAIL', 'Workspace', 'worker/web workspace membership or scripts are incomplete', 'Check package.json files and pnpm-workspace.yaml.');
}

function checkWrangler() {
  const text = read('worker/wrangler.toml');
  const requiredMarkers = [
    ['name = "rinovabd-worker"', 'Worker name'], ['main = "src/index.ts"', 'Worker entrypoint'], ['migrations_dir = "migrations"', 'D1 migrations directory'],
    ['binding = "DB"', 'D1 DB binding'], ['binding = "CACHE"', 'KV CACHE binding'], ['[ai]', 'Workers AI section'], ['binding = "AI"', 'Workers AI binding'],
    ['[assets]', 'Assets section'], ['binding = "ASSETS"', 'Assets binding'], ['directory = "../web"', 'Assets root directory'],
    ['SHOP_NAME =', 'SHOP_NAME var'], ['SHOP_PHONE =', 'SHOP_PHONE var'], ['AI_MODEL =', 'AI_MODEL var'], ['WHATSAPP_NUMBER =', 'WhatsApp var'],
  ];
  const missing = requiredMarkers.filter(([marker]) => !text.includes(marker)).map(([, label]) => label);
  if (missing.length) add('FAIL', 'Wrangler bindings', `worker/wrangler.toml is missing: ${missing.join(', ')}`, 'Restore required DB, KV, AI, assets and public variable bindings.');
  else add('PASS', 'Wrangler bindings', 'D1, KV, Workers AI, static assets and shop variables are configured');
  if (/^\s*#\s*\[\[r2_buckets\]\]/m.test(text) && /PRODUCT_IMAGES/.test(text)) add('WARN', 'Optional R2', 'PRODUCT_IMAGES R2 binding is intentionally disabled', 'Enable R2, create rinovabd-product-images, uncomment the binding, then rerun this doctor.');
  else if (/\[\[r2_buckets\]\]/.test(text) && /binding\s*=\s*"PRODUCT_IMAGES"/.test(text)) add('PASS', 'Optional R2', 'PRODUCT_IMAGES R2 binding is configured');
  else add('WARN', 'Optional R2', 'PRODUCT_IMAGES R2 binding was not detected', 'Keep URL/static media workflows until R2 is enabled and bound.');
}

function checkMigrations() {
  const files = readdirSync(join(ROOT, 'worker/migrations')).filter((name) => /^\d+[-_].+\.sql$/.test(name)).sort();
  const numbers = files.map((name) => Number(name.match(/^\d+/)?.[0] || 0));
  const gaps = [];
  for (let i = 0; i < numbers.length; i += 1) if (numbers[i] !== i + 1) gaps.push(i + 1);
  if (gaps.length) add('FAIL', 'Migrations', `Migration numbering has gap(s): ${gaps.join(', ')}`, 'Add or restore the missing sequential migration before deploying dependent Worker queries.');
  else add('PASS', 'Migrations', `${files.length} sequential migration files found (${files[0]} through ${files.at(-1)})`);
  const editorNote = files.find((name) => /^0010[-_]/.test(name));
  const blog = files.find((name) => /^0011[-_]/.test(name));
  if (!editorNote || !read(`worker/migrations/${editorNote}`).includes('editor_note')) add('FAIL', 'Migrations', 'Editor note migration is missing editor_note', 'Verify migration 0010 is committed and applied before Worker deployment.');
  else add('PASS', 'Migrations', 'Editor note migration contains editor_note');
  if (!blog || !read(`worker/migrations/${blog}`).includes('blog_posts')) add('FAIL', 'Migrations', 'Blog editor migration is missing blog_posts changes', 'Verify the blog schema migration is committed and applied before CMS deployment.');
  else add('PASS', 'Migrations', 'Blog editor/SEO/media migration is present');
}

async function checkCloudflareResources() {
  const tokenNames = ['CLOUDFLARE_API_TOKEN', 'CLOUD_FLARE_API'];
  const accountNames = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUD_FLARE_ACCOUNT_ID'];
  if (!envSet(tokenNames)) add('WARN', 'Secrets', `Cloudflare API token is ${envName(tokenNames)}: missing`, 'Add the token as a GitHub Actions secret; values are never printed by this doctor.');
  else add('PASS', 'Secrets', `Cloudflare API token is ${envName(tokenNames)}: set (value hidden)`);
  if (!envSet(accountNames)) add('WARN', 'Secrets', `Cloudflare account ID is ${envName(accountNames)}: missing`, 'Add the account ID as a GitHub Actions secret or repository variable; the value is never printed.');
  else add('PASS', 'Secrets', `Cloudflare account ID is ${envName(accountNames)}: set (value hidden)`);
  const secretGroups = [
    { label: 'Admin username', names: ['ADMIN_USERNAME'], required: true }, { label: 'Admin password', names: ['ADMIN_PASSWORD'], required: true },
    { label: 'Admin automation token', names: ['ADMIN_API_TOKEN'], required: false }, { label: 'Steadfast key pair', names: ['STEADFAST_API_KEY', 'STEADFAST_SECRET_KEY'], required: false },
    { label: 'Steadfast webhook token', names: ['STEADFAST_WEBHOOK_TOKEN'], required: false }, { label: 'Gemini fallback', names: ['GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2'], required: false },
  ];
  for (const group of secretGroups) {
    const present = envSet(group.names);
    if (present) add('PASS', 'Secrets', `${group.label}: set (value hidden)`);
    else add(group.required ? 'WARN' : 'WARN', 'Secrets', `${group.label}: not set`, group.required ? 'Set the Worker secret(s) before using the associated production feature.' : 'Optional until the associated integration is activated.');
  }
  if (!envSet(tokenNames) || !envSet(accountNames)) return;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUD_FLARE_ACCOUNT_ID;
  try {
    await cloudflareRequest(`/accounts/${accountId}`);
    add('PASS', 'Cloudflare account', 'Account API is reachable with the configured token');
  } catch (error) { add('FAIL', 'Cloudflare account', `Account API rejected the token (${error.message})`, 'Review token scope and account ID; rotate the secret without printing it in logs.'); return; }
  const config = read('worker/wrangler.toml');
  const dbId = config.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
  const kvId = config.match(/binding\s*=\s*"CACHE"[\s\S]{0,100}?id\s*=\s*"([^"]+)"/)?.[1] || config.match(/id\s*=\s*"([^"]+)"[\s\S]{0,100}?binding\s*=\s*"CACHE"/)?.[1];
  try {
    const dbList = await cloudflareRequest(`/accounts/${accountId}/d1/database?name=rinovabd-db&per_page=50`);
    const db = Array.isArray(dbList.body) ? dbList.body.find((item) => item.name === 'rinovabd-db') : null;
    if (db && (!dbId || db.uuid === dbId)) add('PASS', 'Cloudflare D1', 'rinovabd-db is visible and matches Wrangler configuration');
    else add('FAIL', 'Cloudflare D1', 'rinovabd-db is missing or does not match Wrangler configuration', 'Check D1 database name/ID and the read permission for this token.');
    if (db?.uuid) {
      const schema = await cloudflareRequest(`/accounts/${accountId}/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','orders','customer_sessions','blog_posts','product_reviews') ORDER BY name" }) });
      const names = (schema.body?.[0]?.results || []).map((row) => row.name);
      const needed = ['blog_posts', 'customer_sessions', 'orders', 'product_reviews', 'products'];
      const missing = needed.filter((name) => !names.includes(name));
      if (missing.length) add('FAIL', 'Live D1 schema', `Required table(s) missing: ${missing.join(', ')}`, 'Apply the missing migration through the supported D1 migration process, then rerun the doctor.');
      else add('PASS', 'Live D1 schema', 'Required commerce, account, review and blog tables are present (schema only; no customer rows read)');
      const productColumns = await cloudflareRequest(`/accounts/${accountId}/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql: "SELECT name FROM pragma_table_info('products') WHERE name IN ('badges_json','editor_note') ORDER BY name" }) });
      const columns = (productColumns.body?.[0]?.results || []).map((row) => row.name);
      if (columns.includes('badges_json') && columns.includes('editor_note')) add('PASS', 'Live D1 schema', 'Product merchandising badge and editor-note columns are present');
      else add('FAIL', 'Live D1 schema', 'Product badge/editor-note columns are incomplete', 'Apply migrations 0009 and 0010 to the live database.');
    }
  } catch (error) { add('FAIL', 'Cloudflare D1', `D1 read-only check failed (${error.message})`, 'Review D1:Read/Edit scope, database ID and migration state. No data was written.'); }
  try {
    const kvList = await cloudflareRequest(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
    const match = Array.isArray(kvList.body) ? kvList.body.find((item) => item.title === 'rinovabd-cache' || item.id === kvId) : null;
    if (match && (!kvId || match.id === kvId)) add('PASS', 'Cloudflare KV', 'rinovabd-cache is visible and matches Wrangler configuration');
    else add('FAIL', 'Cloudflare KV', 'rinovabd-cache is missing or does not match Wrangler configuration', 'Check KV namespace ID and Workers KV read permission.');
  } catch (error) { add('FAIL', 'Cloudflare KV', `KV read-only check failed (${error.message})`, 'Review Workers KV Storage:Read permission and namespace configuration.'); }
  try {
    const scripts = await cloudflareRequest(`/accounts/${accountId}/workers/scripts`);
    const deployed = Array.isArray(scripts.body) && scripts.body.some((item) => item.id === 'rinovabd-worker');
    if (deployed) add('PASS', 'Cloudflare Worker', 'rinovabd-worker is visible in the account');
    else add('WARN', 'Cloudflare Worker', 'rinovabd-worker is not visible in the account', 'Deploy from main or check Workers Scripts:Read permission.');
  } catch (error) { add('FAIL', 'Cloudflare Worker', `Worker list check failed (${error.message})`, 'Review Workers Scripts:Read permission and account ID.'); }
  try {
    const buckets = await cloudflareRequest(`/accounts/${accountId}/r2/buckets`);
    const names = (buckets.body?.buckets || []).map((item) => item.name);
    if (names.includes('rinovabd-product-images')) add('PASS', 'Optional R2', 'rinovabd-product-images bucket is visible');
    else add('WARN', 'Optional R2', 'R2 API is available but rinovabd-product-images bucket is not present', 'Create and bind the bucket only when the owner enables R2.');
  } catch (error) {
    if (error.code === 10042) add('WARN', 'Optional R2', 'R2 is not enabled for this account (Cloudflare code 10042)', 'Enable R2 before testing direct product/blog media uploads.');
    else add('FAIL', 'Optional R2', `R2 read-only check failed (${error.message})`, 'Review Workers R2 Storage:Read permission; this doctor does not create buckets.');
  }
}

function checkSecretSafeSource() {
  const files = ['.github/workflows/doctor.yml', '.github/workflows/rinovabd-ci-cd.yml', 'worker/wrangler.toml', 'scripts/rinova-doctor.mjs'];
  const suspicious = [];
  for (const file of files) {
    const text = read(file);
    if (/ADMIN_PASSWORD\s*=\s*["'][^$\n][^"']+["']|CLOUDFLARE_API_TOKEN\s*=\s*["'][^$\n][^"']+["']/.test(text)) suspicious.push(file);
  }
  if (suspicious.length) add('FAIL', 'Secret safety', `Possible hard-coded secret assignment found in: ${suspicious.join(', ')}`, 'Use GitHub secrets or Worker secrets; never commit secret values.');
  else add('PASS', 'Secret safety', 'Doctor/workflow/config files contain no obvious hard-coded secret assignment');
}

function checkLocalCommands() {
  try { execFileSync('node', ['--check', 'scripts/rinova-doctor.mjs'], { cwd: ROOT, stdio: 'pipe' }); add('PASS', 'Developer tooling', 'Doctor script passes node --check'); }
  catch { add('FAIL', 'Developer tooling', 'Doctor script failed node --check', 'Fix JavaScript syntax before running the manual workflow.'); }
}

function writeReport() {
  const counts = results.reduce((acc, item) => { acc[item.status] += 1; return acc; }, { PASS: 0, WARN: 0, FAIL: 0 });
  const overall = counts.FAIL ? 'ACTION REQUIRED' : counts.WARN ? 'READY WITH WARNINGS' : 'HEALTHY';
  const report = [
    '# Rinova BD Doctor Report', '', `- **Overall:** ${overall}`, `- **Started:** ${startedAt}`, `- **Repository root:** \`${rel(ROOT)}\``, `- **Target URL:** \`${TARGET_URL}\``, '- **Mode:** Read-only diagnostics; no customer rows, product rows, orders, KV values or secret values were printed.', '',
    '| Result | Area | Finding | Developer fix |', '|---|---|---|---|', ...reportLines, '',
    '## Interpretation', '',
    '- `PASS` means the diagnostic observed the expected contract.',
    '- `WARN` means an optional integration or a missing credential was reported without exposing its value.',
    '- `FAIL` means a required path, workflow contract, resource, schema element or endpoint needs developer action.',
    '- The default manual run exits successfully so the complete report remains visible. Set the workflow `strict` input to `true` when you want FAIL findings to fail the job.',
  ].join('\n');
  writeFileSync(join(ROOT, 'doctor-report.md'), `${report}\n`, 'utf8');
  writeFileSync(join(ROOT, 'doctor-summary.json'), `${JSON.stringify({ overall, counts, targetUrl: TARGET_URL, readOnly: true }, null, 2)}\n`, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`, { encoding: 'utf8', flag: 'a' });
  console.log(`\nDoctor result: ${overall} — ${counts.PASS} pass, ${counts.WARN} warning, ${counts.FAIL} fail`);
  if (STRICT && counts.FAIL) process.exitCode = 1;
}

console.log(`\nRinova BD Doctor — read-only diagnostics\nRoot: ${ROOT}\nTarget: ${TARGET_URL}\n`);
checkRootAndFiles();
checkWorkflowFiles();
checkPackages();
checkWrangler();
checkMigrations();
checkSecretSafeSource();
checkLocalCommands();
await checkCloudflareResources();
await publicCheck('/api/health');
await publicCheck('/api/config');
await publicCheck('/api/categories');
await publicCheck('/api/products');
await publicCheck('/api/content/home');
await publicCheck('/sitemap.xml');
await publicCheck('/admin/');
await publicCheck('/account.html');
await publicCheck('/blog.html?slug=a-gentler-way-to-build-your-morning-routine');
for (const path of ['/api/admin/session', '/api/admin/products', '/api/admin/media-library', '/api/account/me', '/api/account/orders']) await publicCheck(path, [401]);
writeReport();

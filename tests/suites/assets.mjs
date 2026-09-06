// Every /assets/ image the shop points at must actually exist.
//
// This is the bug that made the suite worth writing: `/assets/beauty-flatlay.jpg` is the
// storefront's fallback image — what a product or category with no photo of its own falls back
// to — and the file had never been committed. Four seeded categories and every image-less
// product rendered a browser's broken-image glyph on the live shop, and nothing failed, because
// the Assets binding answers a miss with the SPA shell: HTTP 200, HTML body, undecodable as an
// image. A 200 is not proof the picture is there.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE } from '../harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ASSETS = join(ROOT, 'web', 'assets');

const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'} · ${n}${d ? ` — ${d}` : ''}`); };

/** Every file that can name an image, minus the assets folder itself and the build output. */
function sources(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.wrangler', 'assets', 'dist', 'Doctor-report', 'backup'].includes(entry.name)) continue;
      sources(path, found);
    } else if (/\.(js|html|ts|sql|css)$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

const files = [
  ...sources(join(ROOT, 'web')),
  ...sources(join(ROOT, 'worker', 'src')),
  ...sources(join(ROOT, 'worker', 'migrations')),
  join(ROOT, 'worker', 'schema.sql'),
];

// A reference is only a real one when it names a file extension. The admin editor shows
// `/assets/your-offer-banner.webp` as placeholder text in an empty input — that is an example
// for the owner to replace, not a path the shop ever requests, so placeholders are listed and
// skipped by name rather than by guesswork.
// A repair migration has to name the broken path in order to fix it, so a file can declare
// `assets-scan: allow-missing <file>` to say the mention is deliberate history rather than a
// live reference. Keep that list short — every entry is a picture nobody is allowed to ask for.
const PLACEHOLDERS = new Set(['category-image.webp', 'your-offer-banner.webp']);
const allowed = new Set();
const referenced = new Map();
const texts = files.map((file) => [file, readFileSync(file, 'utf8')]);
for (const [, text] of texts) {
  for (const match of text.matchAll(/assets-scan:\s*allow-missing\s+([A-Za-z0-9._-]+)/g)) allowed.add(match[1]);
}
for (const [file, text] of texts) {
  for (const match of text.matchAll(/\/assets\/([A-Za-z0-9._-]+\.[A-Za-z0-9]{2,5})\b/g)) {
    if (PLACEHOLDERS.has(match[1]) || allowed.has(match[1])) continue;
    if (!referenced.has(match[1])) referenced.set(match[1], file.replace(`${ROOT}/`, ''));
  }
}

const onDisk = new Set(readdirSync(ASSETS));
const missing = [...referenced.entries()].filter(([name]) => !onDisk.has(name));
check(
  'Every /assets/ image named in the code and seed data is committed',
  missing.length === 0,
  missing.map(([name, where]) => `${name} (${where})`).join(', '),
);
check('The scan found the references it was meant to find', referenced.size > 20, `${referenced.size} referenced`);

// The fallback deserves its own check: it is the one image a shop with no photography still
// shows, so losing it breaks every product at once.
check('The storefront fallback image is committed', onDisk.has('beauty-flatlay.jpg'));

// And the Worker must serve it as an image, not as the SPA shell with a 200 stapled to it.
for (const name of ['beauty-flatlay.jpg', 'rinova-hero-skincare.webp']) {
  const response = await fetch(`${BASE}/assets/${name}`);
  const type = response.headers.get('content-type') || '';
  const bytes = Number(response.headers.get('content-length') || 0);
  check(
    `The Worker serves /assets/${name} as a real image`,
    response.ok && type.startsWith('image/'),
    `${response.status} ${type} ${bytes || '?'}B`,
  );
}

// The seeded categories are what a fresh shop opens on, so none of them may point at a gap.
const categories = await (await fetch(`${BASE}/api/categories`)).json();
const rows = Array.isArray(categories) ? categories : (categories.categories || []);
const broken = [];
for (const row of rows) {
  const url = String(row.imageUrl || row.image_url || '');
  if (!url.startsWith('/assets/')) continue;
  const name = url.slice('/assets/'.length);
  if (!onDisk.has(name)) broken.push(`${row.name} → ${url}`);
}
check('No live category points at an image that was never shipped', broken.length === 0, broken.join(', '));
check('The category list came back at all', rows.length > 0, `${rows.length} categories`);

// Nothing in web/assets should be a zero-byte husk — an interrupted copy reads as "present".
const empty = [...onDisk].filter((name) => statSync(join(ASSETS, name)).size === 0);
check('No committed asset is an empty file', empty.length === 0, empty.join(', '));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);

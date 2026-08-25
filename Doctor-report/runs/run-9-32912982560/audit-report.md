# Rinova BD Doctor Audit Report

- **Overall:** READY WITH WARNINGS
- **Started:** 2026-08-25T23:56:53.869Z
- **Repository root:** `.`
- **Target website:** `https://rinovabd-worker.abdussalam8480.workers.dev`
- **Report directory:** `Doctor-report/runs/run-9-32912982560`
- **Mode:** Read-only. No customer rows, product rows, orders, KV values or secret values were printed or changed.

| Result | Area | Finding | Root file / location | Developer fix |
|---|---|---|---|---|
| ✅ PASS | Root path | Doctor running from repository root . | .github/workflows/doctor.yml:24-27 |  |
| ✅ PASS | Repository files | 28 required application, workflow, report-guide and diagnostic paths are present | scripts/rinova-doctor.mjs:75-92 |  |
| ✅ PASS | Static assets | web/assets directory is present | web/assets/:1 |  |
| ✅ PASS | Workflow configuration | doctor.yml has manual trigger, rooted execution and per-run report artifact configuration | .github/workflows/doctor.yml:1-91 |  |
| ✅ PASS | CI/CD workflow | build, typecheck, deployment and manual trigger markers are present | .github/workflows/rinovabd-ci-cd.yml:1-105 |  |
| ✅ PASS | Root path | Workflow YAML contains no developer-specific absolute path | .github/workflows/doctor.yml:24-27 |  |
| ✅ PASS | Toolchain | root build, typecheck and test scripts are available | package.json:1-16 |  |
| ✅ PASS | Workspace | worker and web workspaces expose expected commands | package.json:5-12; pnpm-workspace.yaml:1-4 |  |
| ✅ PASS | Wrangler bindings | D1, KV, Workers AI, static assets and shop variables are configured | worker/wrangler.toml:1-39 |  |
| ⚠️ WARN | Optional R2 | PRODUCT_IMAGES R2 binding is intentionally disabled | worker/wrangler.toml:27-34; worker/src/index.ts:1-8 | Enable R2, create rinovabd-product-images, uncomment the binding, then rerun doctor.yml. |
| ✅ PASS | Migrations | 11 sequential migration files found (0001_initial.sql through 0011-blog-editor-seo-media.sql) | worker/migrations/:1 |  |
| ✅ PASS | Migrations | Editor note migration contains editor_note | worker/migrations/:1 |  |
| ✅ PASS | Migrations | Blog editor/SEO/media migration is present | worker/migrations/:1 |  |
| ✅ PASS | Secret safety | Doctor/workflow/config files contain no obvious hard-coded secret assignment | scripts/rinova-doctor.mjs:222-232; .github/workflows/doctor.yml:35-53 |  |
| ✅ PASS | Developer tooling | Doctor script passes node --check | scripts/rinova-doctor.mjs:234-240 |  |
| ✅ PASS | Secrets | Cloudflare API token is CLOUDFLARE_API_TOKEN: set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Cloudflare account ID is CLOUDFLARE_ACCOUNT_ID: set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Admin username (ADMIN_USERNAME): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Admin password (ADMIN_PASSWORD): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ⚠️ WARN | Secrets | Admin automation token (ADMIN_API_TOKEN): not set | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 | Optional until the associated integration is intentionally activated. |
| ✅ PASS | Secrets | Steadfast key pair (STEADFAST_API_KEY / STEADFAST_SECRET_KEY): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ⚠️ WARN | Secrets | Steadfast webhook token (STEADFAST_WEBHOOK_TOKEN): not set | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 | Optional until the associated integration is intentionally activated. |
| ⚠️ WARN | Secrets | Gemini fallback (GEMINI_API_KEY / GEMINI_API_KEY_1 / GEMINI_API_KEY_2): not set | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 | Optional until the associated integration is intentionally activated. |
| ✅ PASS | Cloudflare account | Account API is reachable with the configured token | scripts/rinova-doctor.mjs:157-218 |  |
| ✅ PASS | Cloudflare D1 | rinovabd-db is visible and matches Wrangler configuration | worker/wrangler.toml:13-18; worker/src/index.ts:1-8 |  |
| ✅ PASS | Live D1 schema | Required commerce, account, review and blog tables are present (schema only; no customer rows read) | worker/migrations/:1; worker/src/index.ts:1-8 |  |
| ✅ PASS | Live D1 schema | Product badge and editor-note columns are present | worker/migrations/:1; worker/src/index.ts:1-8 |  |
| ✅ PASS | Cloudflare KV | rinovabd-cache is visible and matches Wrangler configuration | worker/wrangler.toml:26-29; worker/src/index.ts:1-8 |  |
| ✅ PASS | Cloudflare Worker | rinovabd-worker is visible in the account | worker/wrangler.toml:1-4 |  |
| ⚠️ WARN | Optional R2 | R2 is not enabled for this account (Cloudflare code 10042) | worker/wrangler.toml:27-34; worker/src/index.ts:1-8 | Enable R2 before testing direct product/blog media uploads. |
| ✅ PASS | Live website | https://rinovabd-worker.abdussalam8480.workers.dev/ returned HTTP 200 | worker/src/index.ts:875-1085; deployed URL; https://rinovabd-worker.abdussalam8480.workers.dev/ |  |
| ✅ PASS | Public endpoint | https://rinovabd-worker.abdussalam8480.workers.dev/api/health returned HTTP 200 | worker/src/index.ts:875-1085; https://rinovabd-worker.abdussalam8480.workers.dev/api/health |  |
| ✅ PASS | Public endpoint | https://rinovabd-worker.abdussalam8480.workers.dev/api/config returned HTTP 200 | worker/src/index.ts:875-1085; https://rinovabd-worker.abdussalam8480.workers.dev/api/config |  |
| ✅ PASS | Public endpoint | https://rinovabd-worker.abdussalam8480.workers.dev/api/categories returned HTTP 200 | worker/src/index.ts:875-1085; https://rinovabd-worker.abdussalam8480.workers.dev/api/categories |  |
| ✅ PASS | Public endpoint | https://rinovabd-worker.abdussalam8480.workers.dev/api/products returned HTTP 200 | worker/src/index.ts:875-1085; https://rinovabd-worker.abdussalam8480.workers.dev/api/products |  |
| ✅ PASS | Public endpoint | https://rinovabd-worker.abdussalam8480.workers.dev/api/content/home returned HTTP 200 | worker/src/index.ts:875-1085; https://rinovabd-worker.abdussalam8480.workers.dev/api/content/home |  |
| ✅ PASS | Public endpoint | https://rinovabd-worker.abdussalam8480.workers.dev/sitemap.xml returned HTTP 200 | worker/src/index.ts:875-1085; https://rinovabd-worker.abdussalam8480.workers.dev/sitemap.xml |  |
| ✅ PASS | Sitemap | Live sitemap contains 23 URL(s); checking each link individually | worker/src/index.ts:1023-1031; deployed /sitemap.xml |  |
| ✅ PASS | Sitemap SEO | Sitemap URLs are unique | worker/src/index.ts:1023-1031; clean product URL generator |  |
| ✅ PASS | Sitemap SEO | No legacy product query URLs are present | worker/src/index.ts:1023-1031; clean product URL generator |  |
| ✅ PASS | Sitemap SEO | 22 product URL(s) use unique clean slugs without query strings | worker/src/index.ts:1023-1031; clean product URL generator |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/blush-and-bloom-gift-set has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/blush-and-bloom-gift-set |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-glow-makeup-edit has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-glow-makeup-edit |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-crush-blush-duo has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-crush-blush-duo |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-baked-blush-compact has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-baked-blush-compact |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-face-wash-collection has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-face-wash-collection |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-white has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-white |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-50ml has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-50ml |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-green has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-green |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/dew-ritual-hydrating-serum has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/dew-ritual-hydrating-serum |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/cloud-cleanse-gentle-face-wash has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/cloud-cleanse-gentle-face-wash |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/soft-glow-spf-50-sunscreen has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/soft-glow-spf-50-sunscreen |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-petal-lip-tint has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-petal-lip-tint |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/radiant-glow-makeup-edit has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/radiant-glow-makeup-edit |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/complete-makeup-collection has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/complete-makeup-collection |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/everyday-makeup-essentials has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/everyday-makeup-essentials |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-glow-lip-blush-edit has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-glow-lip-blush-edit |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/glow-bloom-skincare-duo has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/glow-bloom-skincare-duo |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/beet-vitamin-a-serum-shot has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/beet-vitamin-a-serum-shot |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-water-70-glow-serum has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-water-70-glow-serum |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-petal-pressed-blush has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-petal-pressed-blush |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-blush-duo has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-blush-duo |  |
| ✅ PASS | Product SEO | https://rinovabd-worker.abdussalam8480.workers.dev/products/marble-rose-baked-blush has matching canonical and Product JSON-LD URLs | worker/src/index.ts:1023-1031; clean product URL generator; https://rinovabd-worker.abdussalam8480.workers.dev/products/marble-rose-baked-blush |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/ returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/ |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/blush-and-bloom-gift-set returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/blush-and-bloom-gift-set |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-glow-makeup-edit returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-glow-makeup-edit |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-crush-blush-duo returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/coral-crush-blush-duo |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-baked-blush-compact returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-baked-blush-compact |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-face-wash-collection returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-face-wash-collection |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-white returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-white |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-50ml returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-50ml |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-green returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/himalaya-purifying-neem-face-wash-150ml-green |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/dew-ritual-hydrating-serum returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/dew-ritual-hydrating-serum |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/cloud-cleanse-gentle-face-wash returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/cloud-cleanse-gentle-face-wash |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/soft-glow-spf-50-sunscreen returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/soft-glow-spf-50-sunscreen |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-petal-lip-tint returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-petal-lip-tint |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/radiant-glow-makeup-edit returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/radiant-glow-makeup-edit |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/complete-makeup-collection returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/complete-makeup-collection |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/everyday-makeup-essentials returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/everyday-makeup-essentials |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-glow-lip-blush-edit returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-glow-lip-blush-edit |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/glow-bloom-skincare-duo returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/glow-bloom-skincare-duo |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/beet-vitamin-a-serum-shot returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/beet-vitamin-a-serum-shot |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-water-70-glow-serum returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-water-70-glow-serum |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-petal-pressed-blush returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/pink-petal-pressed-blush |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-blush-duo returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/rose-gold-blush-duo |  |
| ✅ PASS | Sitemap link | https://rinovabd-worker.abdussalam8480.workers.dev/products/marble-rose-baked-blush returned HTTP 200 | worker/src/index.ts:1023-1031; URL from deployed /sitemap.xml; https://rinovabd-worker.abdussalam8480.workers.dev/products/marble-rose-baked-blush |  |
| ✅ PASS | API security | https://rinovabd-worker.abdussalam8480.workers.dev/admin/ returned HTTP 200 | worker/src/index.ts:1-8; protected route; https://rinovabd-worker.abdussalam8480.workers.dev/admin/ |  |
| ✅ PASS | API security | https://rinovabd-worker.abdussalam8480.workers.dev/account.html returned HTTP 200 | worker/src/index.ts:1-8; protected route; https://rinovabd-worker.abdussalam8480.workers.dev/account.html |  |
| ✅ PASS | Public endpoint | https://rinovabd-worker.abdussalam8480.workers.dev/blog.html?slug=a-gentler-way-to-build-your-morning-routine returned HTTP 200 | worker/src/index.ts:875-1085; https://rinovabd-worker.abdussalam8480.workers.dev/blog.html?slug=a-gentler-way-to-build-your-morning-routine |  |
| ✅ PASS | API security | https://rinovabd-worker.abdussalam8480.workers.dev/api/admin/session returned HTTP 401 | worker/src/index.ts:1-8; protected route; https://rinovabd-worker.abdussalam8480.workers.dev/api/admin/session |  |
| ✅ PASS | API security | https://rinovabd-worker.abdussalam8480.workers.dev/api/admin/products returned HTTP 401 | worker/src/index.ts:1-8; protected route; https://rinovabd-worker.abdussalam8480.workers.dev/api/admin/products |  |
| ✅ PASS | API security | https://rinovabd-worker.abdussalam8480.workers.dev/api/admin/media-library returned HTTP 401 | worker/src/index.ts:1-8; protected route; https://rinovabd-worker.abdussalam8480.workers.dev/api/admin/media-library |  |
| ✅ PASS | API security | https://rinovabd-worker.abdussalam8480.workers.dev/api/account/me returned HTTP 401 | worker/src/index.ts:1-8; protected route; https://rinovabd-worker.abdussalam8480.workers.dev/api/account/me |  |
| ✅ PASS | API security | https://rinovabd-worker.abdussalam8480.workers.dev/api/account/orders returned HTTP 401 | worker/src/index.ts:1-8; protected route; https://rinovabd-worker.abdussalam8480.workers.dev/api/account/orders |  |

## Sitemap link summary

- **Total URLs found:** 23
- **Reachable:** 23
- **Needs attention:** 0

See `sitemap-links.md` for every URL and HTTP result.

## How to use this report

Open `Medicine-or-fixd/fix-report.md` for only the WARN/FAIL items. Each item includes a repository-relative root file, line-area reference, problem, required change and verification step. Line numbers refer to the checked-out commit and should be rechecked after edits.

# Rinova BD Doctor Audit Report

- **Overall:** ACTION REQUIRED
- **Started:** 2026-08-27T22:17:10.508Z
- **Repository root:** `.`
- **Target website:** `https://rinovabd.com`
- **Report directory:** `Doctor-report/runs/run-10-33121856520`
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
| ✅ PASS | Migrations | 13 sequential migration files found (0001_initial.sql through 0013-admin-notifications.sql) | worker/migrations/:1 |  |
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
| ❌ FAIL | Live website | https://rinovabd.com/ could not be reached (network error) | worker/src/index.ts:875-1085; deployed URL; https://rinovabd.com/ | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/health could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/health | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/config could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/config | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/categories could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/categories | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/products could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/products | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/content/home could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/content/home | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/sitemap.xml could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/sitemap.xml | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/admin/ could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/admin/ | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/account.html could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/account.html | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/blog.html?slug=a-gentler-way-to-build-your-morning-routine could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/blog.html?slug=a-gentler-way-to-build-your-morning-routine | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/admin/session could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/admin/session | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/admin/products could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/admin/products | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/admin/media-library could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/admin/media-library | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/account/me could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/account/me | Check TARGET_URL and Worker availability: https://rinovabd.com. |
| ❌ FAIL | Public endpoint | https://rinovabd.com/api/account/orders could not be reached (network error) | worker/src/index.ts:875-1085; https://rinovabd.com/api/account/orders | Check TARGET_URL and Worker availability: https://rinovabd.com. |

## Sitemap link summary

- **Total URLs found:** 0
- **Reachable:** 0
- **Needs attention:** 0

See `sitemap-links.md` for every URL and HTTP result.

## How to use this report

Open `Medicine-or-fixd/fix-report.md` for only the WARN/FAIL items. Each item includes a repository-relative root file, line-area reference, problem, required change and verification step. Line numbers refer to the checked-out commit and should be rechecked after edits.

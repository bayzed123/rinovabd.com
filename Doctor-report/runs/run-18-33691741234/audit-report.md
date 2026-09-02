# Rinova BD Doctor Audit Report

- **Overall:** ACTION REQUIRED
- **Started:** 2026-09-02T22:43:27.924Z
- **Repository root:** `.`
- **Target website:** `Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 `
- **Report directory:** `Doctor-report/runs/run-18-33691741234`
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
| ✅ PASS | Optional R2 | Cross-account R2 S3 media path is configured; native PRODUCT_IMAGES binding is not required | worker/wrangler.toml:14-16,24-28; worker/src/r2-s3.ts:3-40; .github/workflows/rinovabd-ci-cd.yml:92-131 | No medicine: keep the signed S3 adapter, Worker secret sync and public media URL together. |
| ✅ PASS | Migrations | 18 sequential migration files found (0001_initial.sql through 0018-staff-accounts.sql) | worker/migrations/:1 |  |
| ✅ PASS | Migrations | Editor note migration contains editor_note | worker/migrations/:1 |  |
| ✅ PASS | Migrations | Blog editor/SEO/media migration is present | worker/migrations/:1 |  |
| ✅ PASS | Secret safety | Doctor/workflow/config files contain no obvious hard-coded secret assignment | scripts/rinova-doctor.mjs:222-232; .github/workflows/doctor.yml:35-53 |  |
| ✅ PASS | Developer tooling | Doctor script passes node --check | scripts/rinova-doctor.mjs:234-240 |  |
| ✅ PASS | Secrets | Cloudflare API token is CLOUDFLARE_API_TOKEN: set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Cloudflare account ID is CLOUDFLARE_ACCOUNT_ID: set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Admin username (ADMIN_USERNAME): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Admin password (ADMIN_PASSWORD): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Admin automation token (ADMIN_API_TOKEN): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Steadfast key pair (STEADFAST_API_KEY / STEADFAST_SECRET_KEY): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Steadfast webhook token (STEADFAST_WEBHOOK_TOKEN): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Gemini fallback (GEMINI_API_KEY / GEMINI_API_KEY_1 / GEMINI_API_KEY_2): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Secrets | Cross-account R2 credentials (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY): set (value hidden) | .github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32 |  |
| ✅ PASS | Cloudflare account | Account API is reachable with the configured token | scripts/rinova-doctor.mjs:157-218 |  |
| ✅ PASS | Cloudflare D1 | rinovabd-db is visible and matches Wrangler configuration | worker/wrangler.toml:13-18; worker/src/index.ts:1-8 |  |
| ✅ PASS | Live D1 schema | Required commerce, account, review and blog tables are present (schema only; no customer rows read) | worker/migrations/:1; worker/src/index.ts:1-8 |  |
| ✅ PASS | Live D1 schema | Product badge and editor-note columns are present | worker/migrations/:1; worker/src/index.ts:1-8 |  |
| ✅ PASS | Cloudflare KV | rinovabd-cache is visible and matches Wrangler configuration | worker/wrangler.toml:26-29; worker/src/index.ts:1-8 |  |
| ✅ PASS | Cloudflare Worker | rinovabd-worker is visible in the account | worker/wrangler.toml:1-4 |  |
| ✅ PASS | Optional R2 | Worker-account R2 API is not enabled, but the configured cross-account R2 S3 path is the active media architecture | worker/wrangler.toml:14-16,24-28; worker/src/r2-s3.ts:3-40; .github/workflows/rinovabd-ci-cd.yml:92-131 | No medicine: do not enable a second native bucket unless the deployment architecture is intentionally changed. |
| ❌ FAIL | Live website | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 / could not be reached (network error) | worker/src/index.ts:875-1085; deployed URL; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 / | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/health could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/health | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/config could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/config | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/categories could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/categories | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/products could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/products | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/content/home could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/content/home | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /sitemap.xml could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /sitemap.xml | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /admin/ could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /admin/ | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /account.html could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /account.html | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /blog.html?slug=a-gentler-way-to-build-your-morning-routine could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /blog.html?slug=a-gentler-way-to-build-your-morning-routine | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/session could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/session | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/products could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/products | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/media-library could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/media-library | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/me could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/me | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |
| ❌ FAIL | Public endpoint | Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/orders could not be reached (network error) | worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/orders | Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 . |

## Sitemap link summary

- **Total URLs found:** 0
- **Reachable:** 0
- **Needs attention:** 0

See `sitemap-links.md` for every URL and HTTP result.

## How to use this report

Open `Medicine-or-fixd/fix-report.md` for only the WARN/FAIL items. Each item includes a repository-relative root file, line-area reference, problem, required change and verification step. Line numbers refer to the checked-out commit and should be rechecked after edits.

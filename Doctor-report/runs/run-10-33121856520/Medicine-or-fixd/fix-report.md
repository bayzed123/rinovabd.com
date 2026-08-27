# Medicine-or-fixd Report

- **Audit:** `Doctor-report/runs/run-10-33121856520`
- **Overall:** ACTION REQUIRED
- **Secret policy:** Names and set/missing status only; secret values are never written.

## 1. WARN: Optional R2

- **Root file / location:** `worker/wrangler.toml:27-34; worker/src/index.ts:1-8`
- **Problem found:** PRODUCT_IMAGES R2 binding is intentionally disabled
- **What to change:** Enable R2, create rinovabd-product-images, uncomment the binding, then rerun doctor.yml.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 2. WARN: Secrets

- **Root file / location:** `.github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32`
- **Problem found:** Admin automation token (ADMIN_API_TOKEN): not set
- **What to change:** Optional until the associated integration is intentionally activated.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 3. WARN: Secrets

- **Root file / location:** `.github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32`
- **Problem found:** Steadfast webhook token (STEADFAST_WEBHOOK_TOKEN): not set
- **What to change:** Optional until the associated integration is intentionally activated.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 4. WARN: Secrets

- **Root file / location:** `.github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32`
- **Problem found:** Gemini fallback (GEMINI_API_KEY / GEMINI_API_KEY_1 / GEMINI_API_KEY_2): not set
- **What to change:** Optional until the associated integration is intentionally activated.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 5. WARN: Optional R2

- **Root file / location:** `worker/wrangler.toml:27-34; worker/src/index.ts:1-8`
- **Problem found:** R2 is not enabled for this account (Cloudflare code 10042)
- **What to change:** Enable R2 before testing direct product/blog media uploads.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 6. FAIL: Live website

- **Root file / location:** `worker/src/index.ts:875-1085; deployed URL; https://rinovabd.com/`
- **Problem found:** https://rinovabd.com/ could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 7. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/health`
- **Problem found:** https://rinovabd.com/api/health could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 8. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/config`
- **Problem found:** https://rinovabd.com/api/config could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 9. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/categories`
- **Problem found:** https://rinovabd.com/api/categories could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 10. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/products`
- **Problem found:** https://rinovabd.com/api/products could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 11. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/content/home`
- **Problem found:** https://rinovabd.com/api/content/home could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 12. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/sitemap.xml`
- **Problem found:** https://rinovabd.com/sitemap.xml could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 13. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/admin/`
- **Problem found:** https://rinovabd.com/admin/ could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 14. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/account.html`
- **Problem found:** https://rinovabd.com/account.html could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 15. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/blog.html?slug=a-gentler-way-to-build-your-morning-routine`
- **Problem found:** https://rinovabd.com/blog.html?slug=a-gentler-way-to-build-your-morning-routine could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 16. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/admin/session`
- **Problem found:** https://rinovabd.com/api/admin/session could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 17. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/admin/products`
- **Problem found:** https://rinovabd.com/api/admin/products could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 18. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/admin/media-library`
- **Problem found:** https://rinovabd.com/api/admin/media-library could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 19. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/account/me`
- **Problem found:** https://rinovabd.com/api/account/me could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 20. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; https://rinovabd.com/api/account/orders`
- **Problem found:** https://rinovabd.com/api/account/orders could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: https://rinovabd.com.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.


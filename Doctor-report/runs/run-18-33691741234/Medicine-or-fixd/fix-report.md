# Medicine-or-fixd Report

- **Audit:** `Doctor-report/runs/run-18-33691741234`
- **Overall:** ACTION REQUIRED
- **Secret policy:** Names and set/missing status only; secret values are never written.

## 1. FAIL: Live website

- **Root file / location:** `worker/src/index.ts:875-1085; deployed URL; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 / could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 2. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/health`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/health could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 3. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/config`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/config could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 4. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/categories`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/categories could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 5. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/products`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/products could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 6. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/content/home`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/content/home could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 7. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /sitemap.xml`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /sitemap.xml could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 8. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /admin/`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /admin/ could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 9. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /account.html`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /account.html could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 10. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /blog.html?slug=a-gentler-way-to-build-your-morning-routine`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /blog.html?slug=a-gentler-way-to-build-your-morning-routine could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 11. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/session`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/session could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 12. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/products`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/products could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 13. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/media-library`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/admin/media-library could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 14. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/me`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/me could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 15. FAIL: Public endpoint

- **Root file / location:** `worker/src/index.ts:875-1085; Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/orders`
- **Problem found:** Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 /api/account/orders could not be reached (network error)
- **What to change:** Check TARGET_URL and Worker availability: Check  why https://github.com/bayzed123/rinovabd.com/actions/runs/33689766357/job/100445669998#step:7:1 .
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.


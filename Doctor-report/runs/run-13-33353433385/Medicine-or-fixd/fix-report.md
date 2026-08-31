# Medicine-or-fixd Report

- **Audit:** `Doctor-report/runs/run-13-33353433385`
- **Overall:** READY WITH WARNINGS
- **Secret policy:** Names and set/missing status only; secret values are never written.

## 1. WARN: Secrets

- **Root file / location:** `.github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32`
- **Problem found:** Admin automation token (ADMIN_API_TOKEN): not set
- **What to change:** Optional until the associated integration is intentionally activated.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.

## 2. WARN: Secrets

- **Root file / location:** `.github/workflows/doctor.yml:35-53; worker/src/index.ts:1-32`
- **Problem found:** Gemini fallback (GEMINI_API_KEY / GEMINI_API_KEY_1 / GEMINI_API_KEY_2): not set
- **What to change:** Optional until the associated integration is intentionally activated.
- **Verification:** Rerun `doctor.yml` manually with the same target URL. Use `strict: true` when you want this finding to fail the job.
- **Secret handling:** If a secret is involved, use only the named GitHub/Worker secret; never paste its value into this report or source code.


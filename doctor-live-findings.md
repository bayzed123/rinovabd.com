# Rinova BD Doctor — latest manual run

Manual workflow run: `32906146625`

Commit checked: `6c05d79`

Target: `https://rinovabd-worker.abdussalam8480.workers.dev`

## Result

The read-only doctor workflow completed successfully with **39 PASS, 5 WARN, 0 FAIL**. The report artifact was uploaded by the workflow and the job summary contains the same redacted table.

The workflow validated repository-relative root paths, required application and workflow files, static assets, manual workflow markers, locked dependency installation, build/typecheck scripts, Wrangler D1/KV/Workers AI/assets bindings, all 11 sequential migration files, editor-note and blog migrations, secret-safe source configuration, public health/config/catalogue/CMS/sitemap/admin/account/blog endpoints, and unauthenticated protection for admin and customer account endpoints. No customer rows, product rows, order rows, KV values or secret values were printed or changed.

## Expected warnings

| Area | Warning | Developer action |
|---|---|---|
| Optional R2 | `PRODUCT_IMAGES` binding is disabled and the account reports R2 code 10042 | Enable R2, create `rinovabd-product-images`, uncomment the binding in `worker/wrangler.toml`, and rerun the doctor |
| Optional integration | Admin automation token is not set | Add only if an external admin automation needs it |
| Optional integration | Steadfast webhook token is not set | Add only if the extra callback bearer guard is required |
| Optional integration | Gemini fallback is not set | Add only if the fallback provider is intentionally activated |

The default workflow uses `strict: false` so the full report stays visible. Use `strict: true` when a CI gate is desired; required `FAIL` findings will then fail the job. The doctor’s local generated `doctor-report.md` and `doctor-summary.json` files are ignored by Git.

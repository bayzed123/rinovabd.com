# Rinova BD Doctor Reports

Every manual GitHub Actions run of `doctor.yml` writes a separate report directory under `Doctor-report/runs/`. The run folder is named with the workflow run number and run ID so earlier audits are never overwritten.

Each run contains:

| File or folder | Purpose |
|---|---|
| `audit-report.md` | Complete repository, configuration, Cloudflare resource, live website, API security, and toolchain audit |
| `sitemap-links.md` | Every URL found in the live `sitemap.xml`, checked individually with HTTP status and a developer location when a route fails |
| `summary.json` | Machine-readable counts and report paths with no customer rows or secret values |
| `Medicine-or-fixd/fix-report.md` | Action list for every FAIL/WARN with root file, line number, faulty contract, required change, and verification command |
| `Medicine-or-fixd/` | Supporting fix notes for the current manual run |

The report is read-only. It does not create, update or delete products, orders, customers, D1 rows, KV values, buckets, Workers or secrets. Secret checks report only the secret name and whether it is set. Never paste secret values into a report, issue, commit or chat message.

Use `strict: false` to keep the complete report visible while investigating. Use `strict: true` to fail the doctor job when a required FAIL finding exists. Optional integrations such as R2, Gemini fallback, Steadfast webhook token and admin automation token are reported as warnings until intentionally enabled.

# Medicine-or-fixd

This folder contains developer remediation instructions generated for an individual doctor run. The main `fix-report.md` records only non-pass findings. Every item includes:

1. **Root file and line:** repository-relative path and current 1-based line number.
2. **Problem found:** the observed invalid, missing or unavailable contract.
3. **What to change:** the exact configuration, code or resource action required.
4. **Verification:** the command or manual check to rerun after the fix.

Line numbers are generated from the checked-out commit and may change after edits. Always rerun `doctor.yml` after applying a fix. Secret values are never written; only secret names and set/missing status are allowed in these reports.

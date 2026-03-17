# Security Automation

## Dependency Audit

`Dependency Audit` workflow (`.github/workflows/dependency-audit.yml`) runs on a weekly schedule and can be triggered manually.

The workflow fails only when Critical vulnerabilities are reported by `pnpm audit --prod`.
Lower-severity findings are recorded in workflow logs and step summary.

## If Audit Fails

1. Open the workflow run and review `Dependency Audit` step output.
2. Open issue `#5397` for any `Critical` findings and coordinate remediation there.
3. For non-critical updates, track follow-up in `#5396` only if the issue remains unaddressed.

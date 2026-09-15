# TP 0.34 — Deployment Observability & RC Promotion Gate

## Objective

Add a read-only promotion-readiness layer that reconciles the deployed Web Lab runtime against the expected release manifest without granting deployment, merge, publishing, rollback, DNS, secret, or infrastructure authority.

## Implemented

- `scripts/lib/promotion-readiness.mjs`
  - pure deterministic evaluator
  - statuses: `READY` or `NOT_READY`
  - blockers for degraded health, SHA/version/channel drift, invalid manifest fingerprint, and missing security headers
  - warning for manifests older than 72 hours
  - explicit authority disclosure: READY is advisory only
- `scripts/rc-promotion-gate.mjs`
  - HTTPS-only deployment target
  - rejects embedded URL credentials
  - 10 second bounded network timeout
  - reads root, `/api/health`, and `/release-manifest.json`
  - compares deployed identity with a local expected release manifest
  - no mutation capability
- `scripts/promotion-readiness-selftest.mjs`
  - validates READY path
  - validates degraded deployment fail-closed behavior
  - validates SHA mismatch fail-closed behavior
  - validates missing security-header blockers
  - validates stale-manifest warning without fabricating deployment failure
- `scripts/deployment-contract-check.mjs`
  - enforces promotion-gate contract and advisory disclosure
- `package.json`
  - `release:promotion-selftest`
  - `release:promotion-gate`
  - promotion self-test is part of release/test validation

## Promotion semantics

`READY` means the observed deployment identity and bounded delivery controls match the expected release snapshot at assessment time. It does **not** mean:

- merge is authorized;
- deployment is authorized;
- production promotion is authorized;
- rollback is authorized;
- infrastructure mutation is authorized;
- business correctness or security perfection has been proven.

## Gate 1 validation

Frozen pre-checkpoint implementation head: `7fb9821c51c28c21ec6b1df71e726213ff485d80`

- `npm ci`: PASS — 0 vulnerabilities
- lint: PASS — 0 warnings / 0 errors
- web production build: PASS
- Electron main/preload build: PASS
- deployment contract: PASS
- RC promotion readiness self-test: PASS
- release smoke: PASS
- release manifest: PASS
- system/security regression: 298/298 PASS
- largest JS chunk: 352,320 bytes

## Known boundaries

- Promotion assessment requires a deployment URL supplied explicitly by the operator.
- CI does not call an external deployment URL.
- The evaluator does not attest availability over time; it is a point-in-time observation.
- A 72-hour manifest age is a warning, not automatic failure.
- No Cloudflare API token, deployment command, DNS change, release publication, rollback action, or `main` merge is introduced.

## Next gate

The checkpoint commit must pass a frozen-SHA validation gate and then a pull-request-triggered Gate 2 before merge into `refactor/mio-web-lab-v2`.

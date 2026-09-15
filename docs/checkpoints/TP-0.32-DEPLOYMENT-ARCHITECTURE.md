# TP 0.32 — Deployment Architecture & RC Distribution

## Scope

TP 0.32 defines a truthful deployment/distribution contract on top of the validated TP 0.31 release-readiness baseline. It does not deploy, publish, sign, create secrets, or merge to `main`.

## Added

- `src/release/ReleaseMetadata.ts`
  - typed Web/Desktop release identity;
  - bounded version/channel/SHA/deployment ID;
  - defaults to `development/local` instead of fabricating deployed identity.
- Top bar release/runtime badge
  - distinguishes `WEB LAB` vs `DESKTOP`;
  - surfaces channel + short SHA;
  - native window controls are shown only when the desktop bridge exists.
- `functions/api/health.ts`
  - GET/HEAD readiness metadata endpoint;
  - no-store response;
  - exposes only bounded non-secret deployment identity;
  - explicitly does not claim external-provider/network health.
- `.env.example`
  - public `VITE_MIO_*` release metadata;
  - server-side `MIO_*` metadata;
  - secret values remain deployment-platform managed.
- `scripts/deployment-contract-check.mjs`
  - validates required environment names;
  - fails if non-empty secret-like values are committed to `.env.example`;
  - verifies bounded health controls;
  - verifies renderer release identity inputs;
  - verifies Windows `nsis` + `portable` targets and packaging allowlist.
- `docs/deployment/RC_DISTRIBUTION.md`
  - Cloudflare/Web Lab build contract;
  - post-deployment verification checklist;
  - explicit rollback strategy;
  - Windows RC distribution boundary.

## CI enforcement

The existing validation gate remains authoritative. `npm test` now runs `release:deployment-contract` before release smoke/manifest and the full regression/security suite.

## Gate 1 result

Validated implementation head: `5d5d83dc2abbc4caa24983bf8d4e5af21936b81f`

- dependency audit: **0 vulnerabilities**
- lint: **0 warnings / 0 errors**
- release preflight: **PASS**
- web production build: **PASS**
- Electron main/preload build: **PASS**
- deployment contract: **PASS**
- health route contract: `/api/health`
- Windows RC targets: `nsis`, `portable`
- release smoke: **PASS**
- release manifest: **PASS**
- JS chunks: **35**
- largest JS chunk: **352,320 bytes**
- system/security regression: **298/298 PASS**

## Security / authority invariants

No change to:

- L0–L5 permission policy;
- L4 dry-run or L5 explicit destructive approval;
- scoped grants and one-shot consumption;
- STOP MIO;
- sandbox/service/capability gates;
- DATA_ONLY project knowledge context;
- memory governance;
- desktop workspace authority;
- server-side-only provider secrets.

Deployment metadata is descriptive, not authority. `/api/health` readiness does not imply AI-provider, network, user-data, business-result, or desktop capability health.

## Explicit boundaries remaining

- No live Cloudflare deployment was performed by this milestone.
- No production domain/DNS mutation was performed.
- No installer signing or publisher certificate is configured.
- No GitHub Release or binary artifact publication was performed.
- Windows installer smoke/malware/signature checks require a later release milestone/operator environment.
- Rollback is a hosting/deployment operation and does not roll back project/user data.

## Merge rule

Only merge to `refactor/mio-web-lab-v2` after the frozen checkpoint SHA passes both push and PR validation. `main` remains untouched unless the user explicitly authorizes promotion.

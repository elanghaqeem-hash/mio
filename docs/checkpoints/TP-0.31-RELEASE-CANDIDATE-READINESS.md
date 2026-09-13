# TP 0.31 — Release Candidate & Deployment Readiness Checkpoint

## Purpose

TP 0.31 adds deterministic release-readiness validation for MIO Web Lab / Technology Preview and the shared Electron desktop build without introducing deployment automation, new secrets, or any additional runtime authority.

## What was added

### Release preflight
`scripts/release-preflight.mjs` validates the minimum release contract before compilation:
- required build/configuration files are readable;
- package remains `private: true` for Technology Preview scope;
- Electron entry resolves inside `dist-electron/`;
- web/Electron build, lint, and test scripts remain present;
- Electron package metadata contains `appId` and `productName`;
- package file allowlist explicitly includes `dist/**/*` and `dist-electron/**/*`;
- package dependency declarations remain aligned with the root lockfile entry.

The preflight is validation-only and does not deploy or execute privileged operating-system actions.

### Deterministic build smoke check
`scripts/release-smoke.mjs` validates the outputs produced by the existing CI build:
- `dist/index.html` exists and is non-empty;
- `dist-electron/main.js` exists and is non-empty;
- `dist-electron/preload.js` exists and is non-empty;
- web JavaScript assets are present;
- every emitted JavaScript chunk remains below the 500 KiB release budget;
- built HTML references application assets.

### Release manifest
`scripts/generate-release-manifest.mjs` generates `dist/release-manifest.json` with:
- schema version;
- product/package/version;
- release channel;
- exact `GITHUB_SHA` when available;
- UTC generation timestamp;
- Node/platform/architecture metadata;
- per-file SHA-256 and byte size for web and Electron outputs;
- deterministic manifest SHA-256;
- explicit disclosure that the manifest grants no deployment or privileged authority.

The manifest is generated from compiled artifacts. It is not trusted input and does not alter application permissions.

### Existing CI enforcement
The GitHub workflow file itself was intentionally not modified after connector safety controls rejected a workflow mutation.

Instead, the release checks are enforced through commands that the existing validation gate already runs:
- `npm run build` begins with `release:preflight`;
- `npm test` begins with `release:smoke` and `release:manifest` after web and Electron builds have completed.

This preserves the existing CI authority boundary while making release readiness mandatory.

## Gate 1 results

Verified head before checkpoint: `dc57db330c887aeea89d645dfab12dce1a60fab2`.

- npm install/audit: **PASS — 0 vulnerabilities**
- lint: **PASS — 0 warnings / 0 errors**
- release preflight: **PASS**
- web production build: **PASS**
- Electron main/preload build: **PASS**
- release smoke: **PASS**
- JavaScript chunks discovered: **35**
- largest JavaScript chunk: `three-vendor-f-fJsSoF.js` — **352,320 bytes**
- no JavaScript chunk exceeds the **500 KiB** release budget
- release manifest: **CREATED**
- build SHA captured: `dc57db330c887aeea89d645dfab12dce1a60fab2`
- release channel: `technology-preview`
- web artifact files hashed: **39**
- Electron artifact files hashed: **5**
- manifest SHA-256: `a03045d02d039724b44e50a2e21c90c06699280482bee301961010b4c87a2bda`
- system/security regression: **298/298 PASS**

## Security and governance invariants

TP 0.31 does not alter the security constitution:

`SECURITY → PERMISSION → SANDBOX → VALIDATION → AUDIT`

Unchanged controls include:
- L0–L5 permission model;
- scoped L4 execution and explicit L5 destructive authority;
- STOP MIO behavior;
- task/resource governance;
- DATA_ONLY knowledge handling;
- memory promotion/deletion governance;
- bounded desktop workspace bridge;
- sandbox and result validation;
- evidence package disclosure boundaries.

## Deployment boundary

This milestone proves release readiness only. It does **not**:
- deploy MIO to Cloudflare or another host;
- publish a GitHub Release;
- sign installers;
- upload Windows packages;
- create/update secrets;
- auto-merge to `main`;
- grant filesystem, network, process, or OS authority.

Actual deployment and installer publication remain explicit future actions under separate authorization and milestone controls.

## Freeze rule

After this checkpoint commit, no milestone source changes are permitted before the frozen-SHA validation completes. Merge is permitted only to `refactor/mio-web-lab-v2` after the exact checkpoint SHA passes validation and the pull request is mergeable. `main` remains outside the milestone merge target.

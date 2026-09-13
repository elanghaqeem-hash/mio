# TP 0.33 — Cloudflare Pages Delivery & Post-Deploy Verification

## Scope

TP 0.33 hardens the Web Lab RC delivery contract without adding deployment authority.

### Added
- `public/_headers` with bounded static security and cache policy.
- `scripts/verify-deployment.mjs` for read-only HTTPS deployment verification.
- `npm run deploy:verify -- https://<deployment-origin>` command.
- Deployment contract checks that fail closed when delivery headers or verifier guardrails drift.

## Post-deploy verifier

The verifier:
- requires an explicit HTTPS origin;
- rejects credentials embedded in the URL;
- uses a 10 second abort timeout;
- requests the root document and checks it returns HTML;
- requires `X-Content-Type-Options: nosniff` on the root response;
- requests `/api/health`;
- requires `status=ready` plus non-empty version, channel, and release SHA;
- performs no deployment, rollback, mutation, authentication, or secret management.

## Static delivery contract

The checked-in Pages-compatible `_headers` file requires:
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`;
- a restrictive `Permissions-Policy`;
- `Cross-Origin-Opener-Policy: same-origin`;
- immutable long-lived cache policy for fingerprinted assets;
- `no-store` for `/index.html`.

## Validation

Implementation Gate 1 head: `b57cda13055ada305866a5a19730df9ad1e55f41`

- dependency install/audit: PASS, 0 vulnerabilities;
- lint: PASS;
- web production build: PASS;
- Electron main/preload build: PASS;
- deployment contract: PASS;
- release smoke: PASS;
- release manifest generation: PASS;
- system/security regression suite: PASS.

## Explicit boundaries

TP 0.33 does **not**:
- deploy to Cloudflare Pages;
- create or modify Cloudflare projects;
- store or request deployment credentials;
- change DNS or custom domains;
- execute rollback;
- publish a GitHub release;
- sign or distribute Windows installers;
- expand filesystem, process, network, model, memory, or agent authority;
- merge to `main`.

A live deployment must be initiated through the authorized hosting workflow, after which the read-only verifier can be run against the resulting HTTPS origin.

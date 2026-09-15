# MIO Release Candidate Distribution Contract

## Purpose

This document defines how the validated integration build may be distributed for Technology Preview / Release Candidate testing without changing MIO authority boundaries. It is a deployment contract, not an instruction to auto-deploy.

## Web Lab / Cloudflare Pages contract

- Source branch: an explicitly approved RC branch or integration snapshot; `main` is not implied.
- Framework/build: Vite application.
- Build command: `npm run build`.
- Build output: `dist`.
- Pages Functions: repository `functions/` directory, including `/api/health` and the bounded AI proxy.
- Public build metadata must be supplied only through `VITE_MIO_*` variables.
- Server-side release metadata uses `MIO_*` variables.
- Provider credentials such as `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `ANTHROPIC_API_KEY` must remain deployment-platform secrets and must never use the `VITE_` prefix.

## Required public metadata

- `VITE_MIO_RELEASE_VERSION`
- `VITE_MIO_RELEASE_CHANNEL`
- `VITE_MIO_RELEASE_SHA`
- `VITE_MIO_DEPLOYMENT_ID`

These values are intentionally visible in the browser bundle and release banner. They must not contain secrets.

## Health/readiness route

`GET /api/health` returns bounded deployment identity and readiness metadata only. It does not claim that external model providers, the network, user credentials, or downstream services are healthy. It does not expose secret values.

A deployment is eligible for RC verification only when:

1. `/api/health` responds with HTTP 200.
2. returned release SHA matches the intended validated commit/snapshot;
3. release channel and deployment ID match the deployment record;
4. static app loads and displays the same short SHA/channel in the top bar;
5. no runtime capability is presented as available merely because deployment succeeded.

## Deployment verification

After a manual deployment, verify:

1. root page returns successfully;
2. `/api/health` returns the expected metadata;
3. release banner identity matches the health endpoint;
4. Web Lab remains unable to access desktop-only filesystem/OS capabilities;
5. AI proxy without configured secret fails closed rather than falling back to a browser secret;
6. STOP MIO, permission boundaries, DATA_ONLY context, and Security Dashboard remain functional.

This milestone does not automate these network checks because deployment itself is not authorized by the validation pipeline.

## Rollback strategy

A rollback is an explicit operator action. Keep the previous validated deployment identifier and commit SHA before promoting an RC. If post-deployment verification fails:

1. stop promotion of the affected RC;
2. restore/redeploy the previous validated deployment snapshot in the hosting platform;
3. verify `/api/health` reports the restored SHA/deployment ID;
4. record the failed RC and reason outside the application runtime;
5. do not mutate project knowledge, memory, or user data as part of rollback.

Rollback is deployment-state restoration, not application-data rollback.

## Windows RC packaging

The desktop packaging contract retains both `nsis` and `portable` targets. Only `dist/**/*` and `dist-electron/**/*` are included by the configured packaging allowlist. Packaging remains a separate explicit operator/build action (`npm run dist:win`); this repository does not auto-publish or sign an installer.

Before external desktop distribution, code-signing identity, installer signing, publisher metadata, malware scanning, and Windows smoke testing must be handled as a separate release milestone.

## Non-goals

This contract does not:

- deploy automatically;
- merge to `main`;
- create or rotate secrets;
- publish a GitHub release;
- sign installers;
- grant new filesystem, process, network, tool, model, or destructive authority;
- treat deployment success as product/business-result correctness.

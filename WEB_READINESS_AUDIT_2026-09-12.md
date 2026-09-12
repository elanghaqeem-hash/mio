# MIO V2 — Web Readiness, Research & Motion Audit

Date: 2026-09-12
Target: `audit/security-hardening-2026-09-12`

## Executive status

MIO now has a dual-runtime architecture: hardened Electron desktop and browser/Cloudflare Pages. Browser operation no longer assumes Electron preload APIs. Privileged capabilities degrade to explicit browser-safe alternatives or are marked unavailable.

This audit does not assert that MIO is bug-free or immune to cyber attack. It records implemented controls and validation requirements.

## Research live search

### Implemented

- Same-origin browser endpoint: `POST /api/research`.
- Cloudflare Pages Function contains a fixed upstream allowlist; it is not an arbitrary proxy.
- Optional general web search through Brave Search when `BRAVE_SEARCH_API_KEY` is set server-side.
- Zero-secret live fallback through Wikipedia Indonesia and Crossref.
- Query length limit, upstream timeout, output sanitation, result cap, redirect rejection and no-store responses.
- Browser never receives search API credentials.
- Retrieved snippets remain `UNKNOWN / UNVERIFIED`; retrieval is not presented as factual verification.
- Desktop can reuse the deployed HTTPS Research Function through the persisted `research.webEndpoint` setting.

## Motion pose estimation

### Implemented

- Exact npm dependency: `@mediapipe/tasks-vision@1.0.0`.
- MediaPipe WASM is copied from the locked npm dependency during `prebuild`.
- Official Pose Landmarker Lite model is vendored under `public/mediapipe/models/`.
- SHA-256 recorded in `pose_landmarker_lite.task.sha256`.
- `scripts/prepare-mediapipe.mjs` recomputes SHA-256 and fails the build on model tampering.
- Camera access requires MIO L4 approval plus browser/Electron media permission.
- `VIDEO` inference uses `PoseLandmarker.detectForVideo()` against actual camera frames.
- UI reports actual landmark count, inference FPS and visibility-derived confidence.
- Derived gesture labels are deterministic landmark heuristics and are explicitly identified as such.
- No camera frame is sent to MIO Pages Functions or AI providers.
- Current 33-landmark pose can be transferred to Animation and becomes editable data-backed coordinate tracks.

## Cloudflare Pages web runtime

### Browser bridge

When Electron `window.mioDesktop` is absent, MIO installs a restricted browser bridge with:

- IndexedDB settings/project/audit persistence.
- Web Notification fallback.
- File System Access API folder authorization, scoped relative paths, move/read/write/list and overwrite protection where supported.
- Browser runtime/security telemetry.
- Same-origin `/api/*` access for Research and cloud AI.
- Explicit rejection of browser-side provider-secret management.
- No native window/tray operations.

### Pages Functions

- `/api/capabilities` exposes only non-secret configuration state.
- `/api/research` implements live source retrieval.
- `/api/ai` proxies only allowlisted OpenAI, Anthropic or Gemini providers using server-side secrets.
- Provider endpoints are fixed; the browser cannot provide arbitrary upstream URLs.
- Cloud AI providers must pass a real connection test before the web Model Router accepts them for inference.
- CLI and localhost Ollama remain desktop-only.

### Deployment/security files

- `wrangler.toml`: Pages build output `dist` and compatibility date.
- `public/_routes.json`: only `/api/*` invokes Pages Functions.
- `public/_headers`: CSP, HSTS, no-referrer, nosniff, DENY framing, restricted Permissions Policy and same-origin runtime connection policy.
- `CLOUDFLARE_PAGES_DEPLOYMENT.md`: deployment and smoke-test runbook.

## Electron → browser fallback matrix

| Electron capability | Browser behavior |
|---|---|
| SQLite | IndexedDB |
| OS safeStorage | Cloudflare server-side encrypted secrets |
| IPC filesystem | User-authorized File System Access API where supported |
| Native window controls/tray | Hidden / unavailable |
| CLI providers | Unavailable in web |
| Ollama localhost | Unavailable in web |
| Native media permission dialog | Browser HTTPS permission + MIO permission flow |
| Research network connector | Same-origin Pages Function |
| Cloud AI calls | Same-origin Pages Function |

## CI / merge gates

The repository Security & Quality Gate checks:

1. locked dependency installation;
2. `npm audit --audit-level=high`;
3. lint;
4. security/unit tests;
5. syntax validation for all Cloudflare Pages Functions;
6. MediaPipe model checksum validation as part of `npm run build`;
7. Vite/TypeScript web build;
8. Electron TypeScript build.

## Remaining runtime validation before public production

Even with a green CI, perform deployment smoke tests on the actual Cloudflare preview URL:

- `/api/capabilities` and `/api/research` response behavior;
- camera permission denial/approval/revocation;
- real Pose Landmarker performance on target browsers/devices;
- pose transfer to Animation;
- IndexedDB persistence after reload;
- browser filesystem behavior on a supported browser and graceful rejection on unsupported browsers;
- configured AI provider connection tests, quota/rate errors and timeout behavior;
- CSP/Permissions-Policy in browser developer security tooling;
- independent application VAPT before processing sensitive or production information.

## Conclusion

The repository is prepared for a Cloudflare Pages preview deployment through Git integration. Zero-secret trial mode supports the application UI, browser persistence, local MediaPipe pose estimation and live public Research fallback. General web Research and cloud AI can be enabled without rebuilding browser code by adding server-side Cloudflare secrets/variables.

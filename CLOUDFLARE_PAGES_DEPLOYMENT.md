# MIO V2 — Cloudflare Pages Deployment

MIO supports two runtimes from the same codebase:

- **Electron desktop**: SQLite, OS `safeStorage`, CLI providers, local Ollama, native filesystem IPC.
- **Web / Cloudflare Pages**: IndexedDB, Cloudflare server-side secrets, Pages Functions, browser File System Access API, HTTPS camera, local MediaPipe pose inference.

The browser fallback is installed automatically when Electron's `window.mioDesktop` preload bridge is absent.

## 1. Connect GitHub to Cloudflare Pages

In Cloudflare Dashboard:

1. Open **Workers & Pages**.
2. Create a **Pages** application and choose **Connect to Git**.
3. Select repository `elanghaqeem-hash/mio`.
4. For trial deployment, select production branch `audit/security-hardening-2026-09-12`. After review/merge, switch production to `main`.
5. Framework preset: **Vite**.
6. Build command: `npm run build`.
7. Build output directory: `dist`.
8. Root directory: repository root.
9. Recommended build variable: `NODE_VERSION=22`.

The checked-in `wrangler.toml` declares `pages_build_output_dir = "./dist"`. Pages Functions under `/functions` are deployed with the site.

## 2. Zero-secret trial mode

MIO can be deployed without external secrets. In this mode:

- UI and projects persist in browser IndexedDB.
- Camera and MediaPipe Pose Landmarker work locally after user permission.
- Research is live through Wikipedia Indonesia + Crossref.
- FILES mode uses the browser File System Access API where supported.
- Cloud AI chat remains disabled until at least one provider is configured and passes a real connection test.

## 3. Optional full-web Research

Add this as an encrypted Cloudflare secret:

- `BRAVE_SEARCH_API_KEY`

When present, `/api/research` automatically uses Brave Search for general web coverage. If it is absent, the endpoint transparently uses Wikipedia Indonesia + Crossref.

The browser never receives the Brave key. `/api/research` is an allowlisted server-side connector and is not an arbitrary URL proxy.

## 4. Optional cloud AI providers

For every provider, configure both the secret key and model variable in Cloudflare Pages project settings.

### OpenAI

- Secret: `OPENAI_API_KEY`
- Variable: `OPENAI_MODEL`

### Anthropic

- Secret: `ANTHROPIC_API_KEY`
- Variable: `ANTHROPIC_MODEL`

### Google Gemini

- Secret: `GEMINI_API_KEY`
- Variable: `GEMINI_MODEL`

Do **not** prefix these with `VITE_`. `VITE_*` variables can be bundled into browser JavaScript. These values belong only to Pages Functions.

After deploying, open **Settings → AI API Cloud Connections** and use **TEST**. MIO routes chat to a web AI provider only after a real connection test succeeds.

## 5. Motion / MediaPipe runtime

`@mediapipe/tasks-vision` is pinned in `package.json` and `package-lock.json`.

During `npm run build`, `scripts/prepare-mediapipe.mjs` copies the locked MediaPipe WASM runtime into `public/mediapipe/wasm`; Cloudflare therefore serves executable WASM from the MIO origin.

On first Motion use, the Pose Landmarker model is loaded from the official Google MediaPipe model store:

`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`

Video frames are processed locally in the browser/Electron renderer. MIO Pages Functions do not receive camera frames.

Camera access requires HTTPS (Cloudflare Pages provides HTTPS) and explicit browser permission.

## 6. Browser fallbacks

| Desktop capability | Web fallback |
|---|---|
| SQLite | IndexedDB |
| OS `safeStorage` API keys | Cloudflare encrypted secrets |
| Electron IPC filesystem | File System Access API after directory picker authorization |
| Native window controls / tray | Hidden / unavailable |
| CLI providers | Desktop-only; hidden in web settings |
| Ollama localhost | Desktop-only |
| Electron media permission gate | Browser HTTPS permission + MIO L4 approval |
| Research backend | Same-origin Cloudflare Pages Function |
| AI cloud backend | Same-origin Cloudflare Pages Function |

For FILES mode, Chromium-based Chrome/Edge currently provides the broadest File System Access API support. Unsupported browsers still load MIO but FILES mode reports the unavailable capability instead of faking an operation.

## 7. Security controls included

- CSP and security headers in `public/_headers`.
- No browser-side AI/Search secrets.
- Same-origin browser API calls (`/api/*`).
- Fixed upstream allowlist in Pages Functions; no arbitrary remote proxy.
- API input/output size limits and timeouts.
- No-store responses for research/AI/capability endpoints.
- MediaPipe JavaScript/WASM version locked by npm lockfile.
- Camera permission remains explicit and revocable.
- Research retrieval never automatically becomes a `VERIFIED` factual claim.

## 8. Post-deployment smoke test

After Cloudflare reports the deployment successful:

1. Open `/api/capabilities` and confirm JSON is returned.
2. Open MIO and verify the top badge says `WEB // CLOUDFLARE`.
3. In Settings set network to `ONLINE`.
4. Open Research and perform a search. The connector should report either `BRAVE SEARCH // LIVE WEB` or `WIKIPEDIA + CROSSREF // LIVE PUBLIC`.
5. Open Motion, approve camera access, confirm real `0-33` landmark telemetry reaches `33/33` when a body is visible, then transfer a capture to Animation.
6. Open Animation and confirm pose-derived coordinate tracks appear.
7. Open Security and confirm HTTPS/Secure Context, server-managed secrets, IndexedDB, CSP, no Electron/Node bridge, and same-origin API boundary are active.
8. If AI secrets/models were configured, run Settings → TEST, then send a Chat prompt and confirm the reported provider is the tested provider.

## 9. Desktop reuse of deployed Research

Once the Cloudflare Pages URL is known, desktop MIO can use the same research backend:

1. Open Desktop MIO → Settings → Research Live Search.
2. Enter the HTTPS Pages base URL, for example `https://mio.pages.dev`.
3. Save and switch MIO to ONLINE mode.

This keeps the desktop renderer from becoming an unrestricted search/API proxy while allowing both runtimes to share the hardened Research Function.

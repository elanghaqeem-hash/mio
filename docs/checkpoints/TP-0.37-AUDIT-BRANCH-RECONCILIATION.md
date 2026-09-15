# TP 0.37 — Audit Branch Reconciliation

Date: 2026-09-15  
Target: `main` after TP 0.36  
Source reviewed: `audit/security-hardening-2026-09-12` (`53adfe4`, 76 unique commits)

## Outcome

The audit branch is intentionally reconciled as a curated merge instead of a
raw file merge. Its history predates the TP 0.7–0.36 architecture and contains
older copies of routing, settings, project, security, and UI modules. Replacing
the current files with those copies would regress the validated task runtime,
knowledge governance, multi-provider routing, 60-request session grant, and
responsive web UI.

The branch inventory contained 41 named remote branches plus the remote HEAD
pointer. Milestone and TP branches had already been integrated semantically
through their completed PR sequence; their large `main..branch` commit counts
come from squash/rebase ancestry and do not identify missing product features.
The audit branch was the only remaining open development line requiring a
feature-level reconciliation.

## Feature filter

| Audit feature group | Decision | Reason / implementation |
|---|---|---|
| Same-origin Cloudflare research connector | **Integrated** | The current browser providers called Wikipedia and Crossref directly while production should enforce `connect-src 'self'`. TP 0.37 adds `/api/research`, bounded fixed-host retrieval, HTTPS-only result validation, sanitization, partial-provider error isolation, and an optional server-side `BRAVE_SEARCH_API_KEY`. |
| Cloudflare Pages Functions route boundary | **Integrated** | `public/_routes.json` now invokes Functions only for `/api/*`; static application paths remain static. |
| CSP and transport headers | **Integrated** | The web build now enforces same-origin connections, blocks objects/framing/forms outside the origin, and adds HSTS. Camera and microphone remain disabled because no validated sensor feature is shipped in this TP. |
| Research proxy tests | **Integrated** | Tests cover malformed input, bounded fallback retrieval, fixed HTTPS upstreams, HTML cleanup, secret non-disclosure, HTTPS result filtering, and browser response-contract validation. |
| Provider settings persistence and real readiness | **Already satisfied by main** | TP 0.35/0.36 persists autonomy/network/provider/model settings, verifies the selected provider, keeps cloud secrets server-side, supports OpenRouter/OpenAI/Gemini/Claude/Ollama/local routing, and fails honestly. |
| AI proxy from legacy `functions/api/ai.js` | **Superseded** | Current `/api/ai/generate.ts` has a typed common contract, normalized output/citations, model fallback, provider web-search support, project-context data boundaries, and broader tests. |
| Legacy browser fallback bridge | **Rejected** | It emulates desktop APIs in the browser and would blur the current explicit WebRuntimeAdapter/DesktopWorkspaceGateway boundary. |
| Older settings, project, security, telemetry, and workspace views | **Superseded** | Main contains later governed storage, measured telemetry, task lifecycle, project knowledge, scoped authorization, and responsive UI implementations. |
| Duplicate security CI workflow | **Rejected** | Existing `mio-validation.yml` and `cloudflare-web-build.yml` already run lint, web and Electron builds, tests, release checks, and Pages artifact verification without creating a competing gate. |
| MediaPipe camera pose inference and 5.78 MB vendored model | **Deferred** | Relevant to Motion/Animation, but it adds a pinned legacy runtime, a binary supply-chain artifact, camera permissions, and material iPad performance/privacy work. It must enter through a dedicated sensor TP with model provenance, reproducible checksum validation, consent UX, and device tests. Shipping it incidentally would contradict the current disabled-camera policy. |
| Electron SQLite persistence | **Deferred** | Relevant for a packaged desktop release. Main currently uses the StorageProvider abstraction with IndexedDB for Web Lab. SQLite needs a narrow desktop adapter plus migration/recovery tests; dropping in the audit service would create two persistence authorities. |
| Electron safeStorage API/CLI provider manager | **Deferred** | Cloudflare server secrets are the supported Web Lab authority. Desktop secret custody and CLI execution need an explicit trust/backend policy, per-provider process allowlists, cancellation, output bounds, and packaged OS tests. This is not required to make the current web deployment operational. |

## Problem analysis and fix

### Symptom

MIO could show an online state while the Research workspace returned no sources
or browser network/CSP errors.

### Root cause

`ResearchEngine` instantiated `WikipediaProvider` and `CrossrefProvider` in the
renderer. Those providers performed cross-origin fetches. A hardened production
CSP correctly allows only the MIO origin, so the application state and the
actual network execution path disagreed.

### Corrected path

1. Web research calls only the relative `/api/research` endpoint.
2. The Pages Function validates query length and caps results at 10.
3. The function calls only fixed HTTPS upstreams with a 12-second timeout and
   refuses redirects.
4. Returned HTML/control characters and non-HTTPS result URLs are removed.
5. The renderer validates the response contract again before the existing
   PolicyEngine, SourceEvaluator, citation, conflict, and governance stages.
6. Electron retains its previous public-provider behavior until a dedicated
   main-process research bridge is implemented; no desktop capability is
   falsely reported as complete.

## Configuration

No new secret is required for the safe fallback. Wikipedia Indonesia and
Crossref work without a key. General-web coverage is optional:

- Type: `Secret`
- Name: `BRAVE_SEARCH_API_KEY`
- Scope: the same Cloudflare Preview/Production environment as the deployment

After changing a Cloudflare variable, redeploy so the new Function receives it.

## Residual release gates

- Validate the deployed `/api/research` GET readiness response.
- Run at least one real Research query on the Preview URL.
- Confirm the CSP header is present on the deployed document.
- Do not claim general-web coverage unless readiness returns `fullWeb: true`.
- MediaPipe sensor and Electron-native storage/provider custody remain separate
  roadmap items and are not silently treated as production-ready.

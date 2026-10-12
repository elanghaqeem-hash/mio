# MIO-PRV-06 — Security Regression & Governance Freeze

Status: **06.01–06.04 IMPLEMENTED · VERIFIED (local)**. Exit gate **not met**: one open HIGH finding (S-1) needs an owner decision.

## 1. Named regression gate (06.01)

`npm run test:security` runs `src/tests/securityGate.ts`. That file lists 27 suites, each tagged with the threats it covers, and CI runs it as its own step ("Security regression gate").

`testHarnessIntegrityTests` fails the build in two cases:
- a gate suite is not also registered in the full harness, or is listed under a name that differs from its runner;
- a threat class has no suite.

| Threat class | Suites (besides `securityRegressionTests`) |
|---|---|
| Path traversal | desktopWorkspaceBridge, safeMutation, mutationRecovery, boundedZipReader, adapterIntegrity, privacySecurityHardening |
| SSRF | desktopBrowserBridge, mioLocalBrowserAgent, localInferenceBackend, researchProxy |
| Secret exposure | aiProxy, researchProxy, privacySecurityHardening, mioContract, mioVoiceWorkersAiGateway |
| Cross-project leakage | memoryGovernance, unifiedContextEngine, unifiedContextPipeline, scopedAuthorization |
| Resource exhaustion | resourceGovernance, modelRouterBudget, mioVoiceRateLimitGateway, mioVoiceWorkersAiGateway, taskScheduler, boundedZipReader, adapterIntegrity |
| Prompt injection | contextBoundary, unifiedContextEngine, unifiedContextPipeline, memoryGovernance, aiProxy |
| Permission | scopedAuthorization, capabilityGateway, securityPermissionCompletion, desktopBrowserBridge, modelRouterBudget |
| Emergency Stop | taskRuntime, taskScheduler, creativePipeline, scopedAuthorization |
| Audit | securityPermissionCompletion, resourceGovernance, mutationRecovery |

Evidence (local): `SECURITY REGRESSION GATE: 304/304 across 27 suites`. With the workspace-sandbox fix reverted, the gate exits 1.

## 2. Findings fixed in this milestone (06.02–06.04)

Each row has a regression test in `src/tests/securityRegressionTests.ts`. All 13 tests were run against the pre-fix code: every one fails there and passes with the fix.

| # | Severity | Finding | Fix |
|---|---|---|---|
| F-1 | **HIGH** | `WorkspaceSandbox.mutate` checked the target only lexically, so a symlinked directory inside the workspace let MKDIR, COPY, MOVE or RENAME write outside the authorized root. Reproduced: files were created outside the root. | The target's parent is canonicalized with `realpath` and must stay inside the root |
| F-2 | **HIGH** | Browser SSRF filter missed IPv4-mapped and IPv4-embedding IPv6 forms (`::ffff:169.254.169.254`, `::ffff:a9fe:a9fe`, NAT64, 6to4, Teredo, IPv4-compatible), site-local `fec0::/10`, and the reserved IPv4 ranges 198.18/15 and 192.0.0/24. A DNS AAAA answer in one of these forms reached cloud metadata or loopback. | Addresses are parsed byte-wise, and the embedded IPv4 is classified. Malformed addresses fail closed. A trailing dot in `localhost.` is normalized |
| F-3 | MEDIUM | The desktop browser gateway accepted content from a cross-origin redirect after the user had approved a different origin | The returned origin must equal the approved origin |
| F-4 | MEDIUM | The secret-key matcher used `\b`, so it missed `accessToken`, `clientSecret`, `OPENAI_API_KEY`, `privateKey` and similar keys. Value-only secrets were not redacted at all. | Keys are matched on their word parts. Value patterns cover `sk-…`, `AIza…`, JWTs, `Bearer`, and `x-api-key:`/`password=`-style text |
| F-5 | MEDIUM | `/api/ai/generate` echoed up to 700 characters of the upstream error body (which can contain a partial key) to the browser. The router also stored provider errors in provenance unredacted. | Both are redacted. Pages Functions use the same patterns, and a test enforces that the two copies stay identical |
| F-6 | MEDIUM | `/api/ai/generate` and `/api/research` buffered request bodies of any size | Bounded streaming read: 4 MiB for generate, 16 KiB for research. A declared or chunked overflow returns 413 without buffering |
| F-7 | MEDIUM | A permission request that omitted the project, path, resource, tool or origin could reuse a grant bound to a narrower scope | Every scope dimension must match exactly. All production consumers already build identical request and required scopes |
| F-8 | MEDIUM | STOP MIO did not abort model calls without a task id, did not block new model calls, did not stop voice, and the renderer STOP never reached the Electron main process (training jobs kept running) | The router aborts every in-flight call and refuses new calls and fallbacks while stopped. Device TTS and the chat voice session stop. A renderer STOP is forwarded once to main; a STOP echoed back from main is not forwarded again |
| F-9 | LOW | Audit gaps: STOP trigger and reset were not audited; clearing the audit log left no trace; audit `details` were stored unredacted | STOP and reset are `EMERGENCY_STOP` events; clearing leaves an `AUDIT_LOG_CLEARED` record; details are redacted |
| F-10 | LOW | The voice gateway token comparison was not constant-time | Uses the existing `constantTimeEqual` |

## 3. Open findings

| # | Severity | Finding | Why it is open |
|---|---|---|---|
| **S-1** | **HIGH** | `/api/ai/generate` and `/api/research` have no caller authentication or rate limit, and the client picks the model. On any deployment with provider keys configured, including public preview URLs, anyone can spend the owner's API quota. | Needs an owner decision on the access model: reuse the voice gateway's Cloudflare Access/session verification, a shared gateway token, or Cloudflare rate-limiting bindings. All of these change deployment settings and secrets, which this program does not do without explicit permission. |
| S-2 | MEDIUM | Electron main appends all renderer console output to `userData/renderer.log` | Needs a decision on what to keep: level filter plus redaction, or no file log |
| S-3 | MEDIUM | `ollamaEndpoint`, `proxyEndpoint` and `researchEndpoint` settings are not validated. Remote use is still behind a network-origin permission grant. | Tracked for PRV-02.02 (capability registry) |
| S-4 | MEDIUM | TOCTOU between `realpath` and `open`/`rename`; hard links to files outside the workspace | Needs `O_NOFOLLOW`/handle-based I/O in the desktop sandbox. Requires a symlink planted during an approved operation. |
| S-5 | MEDIUM | DNS rebinding: the SSRF check's `dns.lookup` and Chromium's own resolution are separate | Needs pinning the resolved address in the browser session (PRV-09 Computer Use foundation) |
| S-6 | LOW | Unbounded structures: `TaskScheduler` queue length, `ResourceGovernor.states` and its `override`, and `BoundedFileScanner` has no total-visited cap | Local DoS only; PRV-10 |
| S-7 | LOW | Not audited: model calls (in-memory provenance only), memory writes, workspace authorize/revoke, mutation-approval issuance | PRV-10 shared trace model |
| S-8 | LOW | Creative renders and 3D/animation work are not cancellable by STOP mid-step (checked between steps; SFX/Music suspend audio) | PRV-08 adapter contract |
| S-9 | INFO | `handlers.ts` OOXML entry regexes are double-escaped, so slide and worksheet text is never extracted | Functional bug, not security; PRV-04 |
| S-10 | INFO | `Sandbox.validatePath` is unused and weaker than the desktop sandbox | Remove or route through the desktop sandbox in PRV-05 |

By design: research sources without a `projectId` and user-level memory pass project isolation. They are web content and the user's own global preferences, not another project's data.

## 4. Exit gate

| Criterion | Status |
|---|---|
| Named regression gate runs in CI | PASS (local) / CI via the PRV-06 PR |
| Required threat cases covered | PASS (local) |
| Emergency Stop coverage: task, model, voice, creative | PASS for task, model and voice. Creative is between steps only (S-8) |
| Audit completeness check | PARTIAL (S-7) |
| No open critical/high finding affecting V1 | **FAIL: S-1** |

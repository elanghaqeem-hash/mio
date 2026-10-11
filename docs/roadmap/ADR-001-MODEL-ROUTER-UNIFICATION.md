# ADR-001 — Model Router Unification (MIO-PRV-02.01)

Status: **PROPOSED**. Awaiting owner decision on §5 before implementation.
Date: 2026-10-11 · Resolves tracker finding F-3 · Unblocks MIO-PRV-00.08 (T-18, #520)

## 1. Context

There are two model-routing systems:

| | `src/agents/ModelRouter.ts` (live) | `src/ai-orchestration/*` (T-15, unintegrated) |
|---|---|---|
| Used by | `AgentOrchestrator` (chat), Settings, `SystemPreferences` | its own tests only (and #520, not merged) |
| Provider choice | the single provider selected in Settings (`local_heuristic`, `mio_local`, `ollama`, or a cloud provider via the secure proxy) | best eligible route across many by workload capability, privacy, cost, local-first, and preference |
| Fallback | only to `LocalHeuristicProvider` (non-AI heuristic), and only if `allowOfflineFallback` | ordered bounded fallback across eligible routes |
| Permission integration | yes: `PermissionEngine` grants scoped to provider origin; revoked on config/network change | none |
| Resource budget | `ResourceGovernor` counts model calls per task | `AICostLedger`: USD reserve/settle against a limit |
| Cancellation / timeout | yes (`taskRuntime` cancellation handler, `AbortController`) | no |
| Resilience | readiness cache only | per-route circuit breaker |
| Privacy | remote use needs a grant; context wrapped as data-only | `LOCAL_ONLY` excludes remote routes; `RemoteProcessingPolicy` default-deny |
| Provenance | `taskRuntime.bindStepResult` | `AIProvenanceReceipt` (secret-free) |

Neither one satisfies PRV-02 alone. The live router has the safety integration but no cost governance, circuit breaking, or multi-route fallback. The T-15 layer has those but would bypass permissions and cancellation if used directly.

## 2. Decision (proposed)

**`ModelRouter` stays the single execution entry point. `ai-orchestration` becomes its internal policy layer.** Nothing calls `selectAIRoute` directly, including the T-18 bridge.

1. **Routes.** `ModelRouter` builds `AIModelRoute[]` from what is actually configured: the Settings-selected provider first, then any configured local runtimes (MIO Local, Ollama), then `local_heuristic` last. Each route gets capabilities and per-million cost estimates from a model capability registry (PRV-02.02).
2. **Selection.** `selectAIRoute` returns a typed "no eligible route" result instead of throwing (the throw is what breaks #520's test). Privacy is `LOCAL_ONLY` whenever the request carries project or memory context and remote processing is not explicitly enabled for it.
3. **Execution.** `executeWithBoundedFallback` wraps the existing `executeProvider`, so every attempt keeps the current permission grant check, `ResourceGovernor` preflight, cancellation, and timeout. Circuit breakers are kept per provider.
4. **Cost.** An `AICostLedger` per task and a monthly ledger reserve the estimated cost before a paid call and settle it after. Exhaustion fails closed to local routes only.
5. **Trace.** Each attempt emits an `AIProvenanceReceipt`, mapped to a `MioTraceSpan` via the PRV-01 adapter.
6. **T-18.** The agent ↔ file-intelligence bridge (#520) calls `ModelRouter`, not `selectAIRoute`.

## 3. Options considered

| Option | Verdict |
|---|---|
| A. Replace `ModelRouter` with `ai-orchestration` | **Rejected.** It would drop permission, cancellation, readiness, and context-safety integration, with high regression risk on the only live AI path. |
| B. `ModelRouter` executes; `ai-orchestration` decides (this ADR) | **Proposed.** It reuses both, keeps every existing safety check on every attempt, and turns the T-15/T-16 code from dead code into live controls. |
| C. Keep both as they are | **Rejected.** Duplication persists, and the cost and privacy controls stay inert. |

## 4. Consequences

- The T-15 cost ledger, circuit breaker, and fallback, and the T-16 `RemoteProcessingPolicy`/`SecretRedaction`, become INTEGRATED rather than test-only.
- Fallback stops being "cloud → non-AI heuristic" and becomes "chosen provider → configured local model → heuristic". That's a visible quality improvement offline.
- Existing safety tests (`modelRouterTests`, `aiProxyTests`, `mioLocalProviderTests`, …) must stay green unchanged. Any needed change to them is a behavior change and gets called out.

## 5. Decisions needed from the owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| D-1 | **Default spending limit for paid cloud providers.** Today, selecting a cloud provider in Settings lets it run with no USD cap. | (a) $0 by default: paid cloud runs only after a monthly budget is set explicitly. (b) Selecting a cloud provider counts as consent, with a default monthly cap (e.g. US$5) that is shown and editable. | (a) matches "never activate paid APIs without approval" most strictly but is a visible change for anyone already using cloud. (b) keeps current behavior working, adds a cap, and makes the consent explicit in the UI. |
| D-2 | **Cloud-to-cloud fallback.** If the chosen cloud provider fails, may the router try another configured cloud provider? | (a) No: fall back only to local routes. (b) Yes, but only for requests without project or memory context. | (a). Sending a prompt to a provider the user didn't pick is a privacy surprise; local fallback is always safe. |

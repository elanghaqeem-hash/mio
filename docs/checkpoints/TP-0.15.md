# TP 0.15 — Knowledge Source UX, Retrieval Citations & Context Controls

## Scope

TP 0.15 hardens project knowledge retrieval so retrieved project data remains distinct from trusted instructions and becomes visible/auditable in Chat.

## Implemented

- Added typed `ApplicationContextEnvelope` and `ApplicationContextSource` contracts to the model request layer.
- Project knowledge retrieval produces a `PROJECT_KNOWLEDGE` / `DATA_ONLY` application-context envelope.
- `AgentOrchestrator` exposes the actual project sources used, including asset ID, scoped URI, trust state, relevance score, source count, and whether project context was enabled.
- Project knowledge may be enabled/disabled from Chat.
- Individual source assets may be excluded from future retrieval in the current Chat session.
- Context-character budget is explicit and bounded.
- Chat renders VERIFIED / QUARANTINED trust badges and source lineage without claiming sentence-level model citations.
- `SecureProxyModelProvider` forwards application context separately from conversation messages.
- Cloudflare AI proxy validates application context and materializes it as provider input data, never provider instructions.
- Ollama materializes the same DATA_ONLY envelope only at the local-provider boundary.
- Existing policy, resource governance, scoped permission, cancellation, STOP MIO, and model validation remain in force.

## Security semantics

System instructions, user instructions, application context, and external document content remain separate trust categories inside MIO.

`QUARANTINED` project knowledge may provide factual context but never becomes instruction authority, permission authority, or long-term memory automatically.

Provider APIs do not expose a native application-data role. MIO therefore preserves the typed envelope internally until the provider boundary, then materializes it as a separately labeled data message before the actual user prompt. The secure proxy regression suite verifies the application context is not merged into provider `instructions`.

## Runtime truthfulness

- Retrieval remains bounded lexical retrieval; TP 0.15 does not claim vector/embedding search.
- Source UI reports only sources selected by the actual retrieval result.
- Source exclusion is session/UI state in this milestone; it is not yet a persisted project policy.
- Context source display is deterministic source attribution/lineage, not a claim that the model generated citation-perfect prose.
- PDF/Office/media parsing remains outside this milestone.
- No project retrieval action promotes data to long-term memory.

## Validation — Gate 1

Final implementation head: `a15ab90290baf92a5da8341a589c75f8f6c11315`

- npm audit: **0 vulnerabilities**
- lint: **0 errors / 34 baseline warnings**
- web build: **PASS**
- Electron main/preload build: **PASS**
- automated validation: **135/135 PASS**

New regression coverage proves:

- application context does not modify trusted system instruction text;
- application context is materialized as a separately labeled data message;
- the actual user prompt remains distinct and ordered after application context;
- typed context is consumed only at the provider edge;
- project application context is never merged into provider instructions;
- DATA_ONLY policy and source trust metadata survive the secure proxy boundary;
- explicit source exclusion removes the asset from future retrieval;
- typed context preserves source identity/trust state;
- context character budget is recorded and bounded;
- irrelevant queries inject no unrelated project data.

## Gate status

Gate 1: **PASS**

Gate 2: pending on this checkpoint commit. Do not merge until the checkpoint head passes the full validation workflow.

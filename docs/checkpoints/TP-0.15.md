# TP 0.15 — Knowledge Source UX, Retrieval Citations & Context Controls

## Scope

TP 0.15 hardens project knowledge retrieval so retrieved project data remains distinct from trusted instructions and becomes visible/auditable in Chat.

## Implemented

- Added typed `ApplicationContextEnvelope` and `ApplicationContextSource` contracts to the model request layer.
- Project knowledge retrieval now produces a `PROJECT_KNOWLEDGE` / `DATA_ONLY` application-context envelope.
- ModelRouter materializes application context only at the provider edge as a separately labeled data message before the actual user prompt.
- Retrieved project content is no longer concatenated into the trusted system instruction.
- Remote-model permission disclosure explicitly reports when selected project knowledge sources will leave the local runtime.
- Added project-knowledge enable/disable control in Chat.
- Added per-asset source exclusion for future retrieval in the current Chat session.
- Added explicit context-character budget support.
- Structured Chat responses now expose the actual project sources used, including asset ID, scoped URI, trust state, and relevance score.
- Chat UI renders VERIFIED / QUARANTINED source badges and source lineage.

## Security semantics

System instructions, user instructions, application context, and external document content remain separate trust categories inside MIO. `QUARANTINED` project knowledge may provide factual context but never becomes instruction authority, permission authority, or long-term memory automatically.

The provider edge currently must still serialize application context into a model-compatible message because upstream model APIs do not expose a native application-data role. MIO therefore labels the data boundary explicitly and inserts it as a separate user-role data message before the real user prompt. This is a transport adaptation, not a trust promotion.

## Runtime truthfulness

- Retrieval remains bounded lexical retrieval; TP 0.15 does not claim vector/embedding search.
- Source UI reports only sources selected by the actual retrieval result.
- Source exclusion is session/UI state in this milestone; it is not yet a persisted project policy.
- Context source display is source attribution/lineage, not a claim that the model generated citation-perfect prose.
- PDF/Office/media parsing remains outside this milestone.

## Validation

Gate 1 final implementation head `6d81290d195ede5b6060e069e6b960d2b7aaea95` passed the MIO Validation Gate:

- npm audit: 0 vulnerabilities
- lint: 0 errors / 34 baseline warnings
- web build: PASS
- Electron main/preload build: PASS
- automated validation: **132/132 PASS**

New regression coverage proves:

- application context does not modify trusted system instruction text;
- context is materialized as a distinct data message;
- the real user prompt remains separate and ordered after application context;
- typed context is consumed only at the ModelRouter edge;
- explicit source exclusion removes the asset from retrieval;
- typed context preserves source identity/trust state;
- context character budget is recorded and bounded;
- irrelevant queries inject no unrelated project data.

## Gate status

Gate 1: PASS

Gate 2: pending PR checkpoint validation.

# TP 0.22 — Governed Research → Project Knowledge Promotion

## Scope

TP 0.22 connects source-aware Research to governed Project Knowledge without allowing external content to become trusted knowledge, instruction authority, or durable memory automatically.

## Implemented

- Explicit research-source promotion into the active MIO Project.
- Promotion preview with fixed initial governance state: `QUARANTINED` trust and `UNKNOWN` freshness.
- Re-sanitization through `PolicyEngine` at the promotion boundary.
- Research provenance persisted with provider, provider source id, URL, citation label, query, source type, publication date, reliability metadata, epistemic status, and promotion timestamp.
- Date-and-query-intent revalidation advisory: `REVALIDATE_NOW`, `REVALIDATE_BEFORE_CRITICAL_USE`, or `REVIEW_RECOMMENDED`.
- Duplicate source-URL promotion prevention.
- Suspicious external research may be retained only as sanitized quarantined project data with threat metadata.
- Promoted research remains retrievable through the existing `DATA_ONLY` project context path.
- Research promotion is explicitly separated from Project Memory and Long-Term Memory promotion.
- Research Studio surfaces promotion trust/freshness preview, revalidation advisory, suspicious-content warning, and explicit `PROMOTE TO PROJECT` control.

## Security / Truthfulness Invariants

- Research reliability or epistemic status never auto-verifies the promoted project document.
- External research does not become system instructions.
- Promotion does not create Long-Term Memory or memory review candidates.
- Revalidation advisory is derived from known date/query-intent metadata only; it is not an online freshness verification.
- No background or hidden web revalidation is claimed.
- Duplicate URL prevention avoids silent multiplication of the same research source inside project knowledge.
- Existing security, permission, lineage, memory, and DATA_ONLY boundaries remain authoritative.

## Known Boundaries

- The advisory cannot determine whether a source has actually changed since publication.
- Source URL equality is a duplicate guardrail, not semantic deduplication.
- Full-page capture is not introduced; promotion uses the sanitized research excerpt currently available from the research provider.
- User review is still required before changing trust from `QUARANTINED` to `VERIFIED` or establishing a freshness horizon.

## Gate

Before merge, this checkpoint must pass dependency audit, lint, web build, Electron build, all existing system/security/memory/lineage tests, and the new research-promotion suite in one combined validation tree.

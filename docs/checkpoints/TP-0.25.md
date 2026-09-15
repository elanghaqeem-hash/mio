# TP 0.25 — Knowledge Review Inbox & Provenance Change Timeline

## Scope
TP 0.25 creates a derived, read-only triage layer over existing Project Knowledge Governance and Revalidation provenance. It does not add new authority or automatically mutate project knowledge.

## Implemented
- Derived Knowledge Review Inbox for active document sources.
- Explicit review reasons: QUARANTINED, STALE, UNKNOWN_FRESHNESS, REVALIDATION_DUE, SUSPICIOUS_CONTENT, OPEN_CONFLICT.
- Deterministic severity: CRITICAL, HIGH, MEDIUM, LOW.
- Suspicious-content or unresolved-conflict signals are prioritized CRITICAL for human review.
- Stale/revalidation-due signals are prioritized HIGH.
- Verified CURRENT sources without derived review debt are omitted from the inbox.
- Excluded and superseded sources are omitted from the active inbox.
- Unified provenance timeline combines project knowledge-governance history and asset-level revalidation history.
- Timeline supports per-source filtering and deterministic newest-first ordering.
- Project Overview surfaces the new inbox and unified timeline before governance action panels.

## Security / truthfulness
- Inbox is derived/read-only and cannot change trust, freshness, lineage, inclusion, or supersession by itself.
- CRITICAL is a triage severity, not truth confidence and not a claim that a source is false or malicious.
- OPEN_CONFLICT is inherited from bounded governance heuristics and remains a review signal, not semantic contradiction.
- Timeline reconstructs recorded governance/revalidation events and does not invent missing provenance.
- No network, model, memory, filesystem, or execution authority is added.

## Gate 1
Implementation head: `81e4fc547d2bd6d3d18924d7dfb5bb2f6e2a277b`

- dependency audit: PASS — 0 vulnerabilities
- lint: PASS — 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload build: PASS
- automated validation: **255/255 PASS**

New coverage verifies review-debt derivation, critical prioritization, explicit reasons, clean-source exclusion, governance + revalidation timeline composition, deterministic ordering, per-source filtering, excluded-source removal, and persistence reconstruction.

## Known boundaries
- Inbox severity is deterministic rule-based triage; it is not probabilistic risk scoring.
- Unified timeline currently combines knowledge-governance and revalidation events, not every generic project activity event.
- Revalidation history remains stored with assets while the timeline is reconstructed at read time.
- UI is read-only; users continue to perform trust, freshness, conflict, lineage, and supersession actions through the existing governance panels.

## Gate 2
Pending on the frozen checkpoint commit. Do not merge until the checkpoint push gate and PR-triggered gate both pass on the exact checkpoint SHA.

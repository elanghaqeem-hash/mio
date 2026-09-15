# TP 0.23 — Source Revalidation Queue & Controlled Refresh Comparison

## Scope
TP 0.23 extends governed Research → Project Knowledge with an explicit source revalidation workflow. It does not introduce background refresh, automatic verification, or autonomous source replacement.

## Implemented
- Advisory revalidation queue derived from active research-promoted project sources.
- Queue priority states: CRITICAL, HIGH, NORMAL.
- Explicit user preparation for controlled refresh; UI never claims a refresh already occurred.
- Bounded text-and-metadata comparison for a refreshed research candidate.
- Comparison exposes content change, bounded similarity, metadata changes, suspicious-content signals, and candidate trust/freshness.
- Candidate trust always begins QUARANTINED and freshness UNKNOWN.
- Explicit decisions: KEEP_EXISTING, UPDATE_METADATA, ACCEPT_VARIANCE, SUPERSEDE.
- KEEP_EXISTING preserves current governed content and records history.
- UPDATE_METADATA records latest checked metadata separately and does not replace source content.
- ACCEPT_VARIANCE creates a parallel quarantined source without superseding the existing source.
- SUPERSEDE creates a quarantined replacement and uses existing governance to exclude/link the prior source.
- Suspicious refresh candidates are re-sanitized at the comparison boundary.
- Revalidation decision history persists with project storage.

## Security / truthfulness
- Revalidation queue is advisory only; no polling/background job is introduced.
- A refresh candidate never becomes VERIFIED automatically.
- A refresh candidate never receives CURRENT freshness automatically.
- Similarity is a bounded lexical heuristic, not semantic equivalence or factual agreement.
- UPDATE_METADATA cannot silently overwrite source content.
- ACCEPT_VARIANCE and SUPERSEDE both require explicit user decisions.
- External refreshed content remains DATA_ONLY and cannot become instruction authority.
- Existing Memory Governance, Source Lineage, Corroboration, and Research Promotion boundaries remain intact.

## Gate 1
Implementation head `a8eb3eecbe8f87da5ef07fb46292900406bf81f1` passed:
- dependency audit: PASS — 0 vulnerabilities
- lint: PASS — 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload build: PASS
- automated validation: **242/242 PASS**

New regression coverage verifies queue creation and priority, bounded comparison, no auto-verification, KEEP/UPDATE/VARIANCE/SUPERSEDE semantics, superseded-source retrieval exclusion, fail-closed source lookup, suspicious candidate sanitization, and persistence.

## Known boundaries
- Queue generation does not prove that a source actually changed online.
- Similarity is token-set overlap and does not prove semantic equivalence.
- Refresh currently compares the governed excerpt against a user-initiated research result, not a full-page archived snapshot.
- The UI prepares controlled refresh but does not yet expose the final four-way decision dialog inline; the service and tests already enforce those decisions.
- Revalidation does not change Long-Term Memory or Project Memory.

## Gate 2
Pending on the frozen checkpoint commit. Do not merge until the PR-triggered MIO Validation Gate passes on the exact checkpoint SHA.

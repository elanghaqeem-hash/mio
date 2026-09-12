# TP 0.24 — Revalidation Review Workbench

## Scope
TP 0.24 closes the main UX gap left by TP 0.23 by exposing controlled refresh comparison and the four governance decisions directly in Research Studio. The underlying revalidation service and security semantics remain authoritative.

## Implemented
- Select a source from the revalidation queue as the explicit controlled-refresh target.
- Research button changes to RUN CONTROLLED REFRESH while a target is active.
- Refreshed research results can be selected explicitly as comparison candidates.
- Revalidation Review Workbench displays bounded old-vs-candidate excerpts.
- Workbench displays content-changed state, lexical similarity, metadata-change fields, candidate trust, candidate freshness, and suspicious-content signals.
- Explicit decision actions are available in the UI: KEEP EXISTING, UPDATE METADATA, ACCEPT VARIANCE, SUPERSEDE.
- SUPERSEDE receives an additional user confirmation before the service is called.
- Decision result is surfaced visibly and the revalidation queue is refreshed after application.
- Research promotion remains available outside an active revalidation workflow.

## Security / truthfulness
- Selecting a queue item does not perform background research.
- Research results are not applied until a candidate is explicitly compared and a governance action is chosen.
- Comparison candidate remains UNTRUSTED DATA with QUARANTINED trust and UNKNOWN freshness.
- Lexical similarity is explicitly disclosed as not semantic equivalence, factual agreement, or verification.
- SUPERSEDE does not auto-verify the replacement and requires an additional confirmation.
- The UI calls the existing fail-closed ResearchRevalidation service; it does not bypass project governance.
- No Project Memory or Long-Term Memory authority is added.

## Gate 1
Implementation head: `7afbdeafd8d8620705171ca44bb078ffb64fa35f`

- dependency audit: PASS — 0 vulnerabilities
- lint: PASS — 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload build: PASS
- automated validation: **242/242 PASS**

The complete TP 0.23 revalidation semantics suite remains green, including KEEP/UPDATE/VARIANCE/SUPERSEDE behavior, quarantine boundaries, fail-closed lookups, suspicious-content sanitization, DATA_ONLY retrieval, and persistence.

## Known boundaries
- Current supersede confirmation uses the browser confirmation surface; a shared MIO confirmation component can replace it in a later UI-hardening pass.
- Workbench compares bounded governed excerpts against bounded research-result excerpts, not archived full-page snapshots.
- Similarity remains deterministic token-set overlap, not semantic diffing.
- The workbench is scoped to one active governed source at a time.

## Gate 2
Pending on the frozen checkpoint commit. Do not merge until both the checkpoint push gate and PR-triggered validation pass on the exact checkpoint SHA.

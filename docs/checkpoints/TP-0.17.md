# TP 0.17 — Knowledge Governance Center & Provenance Timeline

## Scope
TP 0.17 exposes project-scoped knowledge governance as an explicit review workspace inside Project Context and adds persistent provenance/review history.

## Implemented
- Dedicated Knowledge Governance Center inside the existing PROJECT workspace; no new global mode or capability was introduced.
- Persistent governance event history for REGISTERED, INCLUDED, EXCLUDED, REVIEWED, and SUPERSEDED actions.
- Governance history is capped at the latest 500 events to bound project-state growth.
- Governance history survives StorageProvider round-trip.
- Existing project migration/backfill initializes missing governance history as an empty array.
- Source controls expose include/exclude, VERIFY with a 30-day freshness horizon, and QUARANTINE.
- Source rows surface scoped URI, trust, freshness, review timestamp/note, and supersession state.
- Project asset explorer now renders truthful VERIFIED / QUARANTINED / UNVERIFIED badges rather than labeling every asset VERIFIED.
- Governance event timeline displays the latest 50 events in the UI while retaining up to 500 in project state.

## Audit defect found and corrected
The first TP 0.17 build correctly failed because the stricter governance schema made `history` required while an older test fixture did not include it. The production schema was intentionally kept strict; the fixture was updated, while `ProjectManager.normalizeProject()` remains responsible for migrating older persisted projects.

## Security / truthfulness semantics
- Provenance history is mutable project metadata, not a cryptographic or immutable audit ledger.
- Verification is an explicit user governance decision; it does not elevate project content to instruction authority.
- Quarantined and stale sources remain lower-trust DATA_ONLY project context.
- Long-term memory, permission, capability, and tool/model security boundaries are unchanged.

## Validation baseline
Final implementation head: `ec02ca376f886f14dfe2d15fcea5ac10e339f186`

- npm dependency audit: 0 vulnerabilities
- lint: 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload TypeScript build: PASS
- automated validation: **143/143 PASS**
- governance provenance persistence: PASS

## Known boundaries
- Supersession is supported by ProjectManager and provenance history, but the TP 0.17 panel does not yet expose a replacement-source picker.
- VERIFY 30D uses a manual review horizon; it does not perform online freshness revalidation.
- Governance history is bounded project provenance metadata and can change through project rollback/restore.
- Evidence grounding remains the lexical heuristic introduced in TP 0.16, not semantic entailment or a truth oracle.

## Next safe direction
TP 0.18 should add a project Knowledge Review Queue with stale/quarantined source triage, explicit supersession workflow, replacement-source selection, and source-to-claim evidence inspection while preserving current DATA_ONLY boundaries.

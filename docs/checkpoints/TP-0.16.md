# TP 0.16 — Persistent Knowledge Governance & Evidence-Grounded Answers

## Scope
TP 0.16 extends project knowledge from retrieval-only context into persistent project-governed knowledge with bounded evidence support metadata.

## Implemented
- Knowledge governance is stored inside `MioProject` and persists with project state.
- Per-source persistent include/exclude policy.
- Per-source VERIFIED / QUARANTINED review state.
- Review timestamp, note, optional freshness horizon, and CURRENT / STALE / UNKNOWN freshness state.
- Source supersession: superseded documents are removed from active retrieval.
- Older stored projects are normalized/backfilled with governance records for document assets.
- Retrieval preserves source URI, trust, freshness, and review metadata.
- Trust/freshness can only adjust ranking after lexical relevance exists; governance metadata cannot create relevance from zero matches.
- Model responses can be audited against the exact application-context sources supplied to the model.
- Evidence claim status is explicitly `SUPPORTED`, `INFERENCE`, or `UNSUPPORTED` using `LEXICAL_EVIDENCE_HEURISTIC`.
- Evidence references retain asset ID, source URI, trust state, freshness, and overlapping terms.
- Chat surfaces persistent source exclusions, freshness, and evidence-audit counts/claim labels.
- Persistent governance survives StorageProvider round-trip.

## Security and trust semantics
- External/project document content remains DATA_ONLY application context and never becomes trusted instruction authority.
- Persistent source review changes knowledge trust metadata; it does not bypass PolicyEngine, PermissionEngine, ModelRouter, ToolRouter, or memory policy.
- Long-term memory remains a separate controlled subsystem.
- Evidence audit reports support against supplied sources; it is not a fact checker and does not prove truth.

## Defects found and corrected during audit
1. Initial trust scoring could accidentally give a VERIFIED source a positive retrieval score even when no query term matched. CI caught this through the irrelevant-query test. Ranking was corrected so trust/freshness only modify sources after lexical relevance is established.
2. An evidence test expected an `UNSUPPORTED` classification for a sentence containing the source term `recovery`; the lexical auditor correctly classified it as `INFERENCE`. The test fixture was corrected rather than weakening the evaluator.

## Validation baseline
Final implementation head: `7a92bc223e87bac2ca46fe445984a4a15e1a2247`

- npm dependency audit: 0 vulnerabilities
- lint: 0 errors / 34 pre-existing warnings
- web production build: PASS
- Electron main/preload TypeScript build: PASS
- automated validation: **142/142 PASS**
- governance StorageProvider round-trip: PASS

## Known boundaries
- Retrieval remains bounded lexical retrieval; no embedding/vector search is claimed.
- Freshness is project-governance metadata and is not automatically revalidated against online sources.
- Supersession is project policy metadata, not an immutable cryptographic provenance chain.
- Evidence grounding is lexical overlap support metadata, not semantic entailment or a general truth guarantee.
- FNV-1a content fingerprints remain deterministic dedup identifiers only, not cryptographic integrity hashes.
- Existing 34 lint warnings are legacy technical debt outside TP 0.16 changes.

## Next safe direction
After Gate 2 and merge, the next milestone should expose governance as a dedicated Knowledge/Source Review workspace and add provenance/review history without weakening the current DATA_ONLY trust boundary.

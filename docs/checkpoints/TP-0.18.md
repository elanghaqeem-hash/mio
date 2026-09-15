# TP 0.18 — Knowledge Review Queue, Supersession Workflow & Claim Evidence Inspector

## Scope
TP 0.18 extends project-scoped knowledge governance with explicit source triage, controlled supersession, and claim-to-source evidence inspection while preserving DATA_ONLY model-context boundaries.

## Implemented
- Knowledge Review Queue derived from project governance state for QUARANTINED, STALE, and UNKNOWN sources.
- Explicit replacement-source selection and confirmation before supersession.
- Supersession continues to execute through `ProjectManager.supersedeKnowledgeSource()` and records project provenance.
- Evidence grounding now retains a bounded source excerpt together with source URI, trust, freshness, and lexical overlap terms.
- Dedicated Claim Evidence Inspector component in Chat keeps evidence detail separate from core chat rendering.
- Claim inspector exposes SUPPORTED / INFERENCE / UNSUPPORTED status, governed source identity, bounded excerpt, scoped URI, trust/freshness, and overlap terms.
- Evidence excerpts are bounded so the inspector does not expose the full project source payload.
- Added governance workflow validation covering review, freshness, supersession, self-replacement rejection, and provenance.

## Audit defect found and corrected
The initial validation gate failed before application tests because TP 0.18's test-suite edit accidentally removed `@vitejs/plugin-react` from `package.json` while the Vite configuration still imports it. The package lock retained the dependency. The unintended manifest drift was restored rather than weakening the build configuration.

## Security / truthfulness semantics
- Review queue is derived metadata; it grants no new model, filesystem, network, or tool authority.
- Supersession requires an explicit distinct replacement document and uses the existing project-governance boundary.
- Project sources remain DATA_ONLY application context and never become trusted instructions.
- Evidence status remains `LEXICAL_EVIDENCE_HEURISTIC`; SUPPORTED means bounded lexical support from supplied context, not independent factual verification.
- Evidence excerpts are intentionally bounded and retain scoped source lineage.
- Freshness remains manual governance metadata; TP 0.18 does not claim online source revalidation.

## Validation baseline
Final Gate 1 implementation head: `35dbd3004eaceb612f78adc85e5baf22da813da1`

- npm dependency audit: 0 vulnerabilities
- lint: 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload TypeScript build: PASS
- automated validation: **152/152 PASS**
- bounded evidence excerpt validation: PASS
- scoped source URI + relevant excerpt validation: PASS
- governance review/supersession workflow validation: PASS
- self-supersession rejection: PASS
- supersession provenance validation: PASS

## Known boundaries
- Review Queue is state-derived and currently focused on project document sources; it is not a cross-project enterprise knowledge catalog.
- Supersession is a project-governance relationship and not document-content diffing or legal records management.
- Freshness review is manual and does not automatically browse or refresh sources.
- Evidence inspection remains lexical and does not perform semantic entailment, contradiction detection, or external fact checking.
- Provenance remains bounded mutable project metadata, not an immutable cryptographic ledger.

## Next safe direction
After Gate 2 and merge, the next milestone should strengthen semantic knowledge quality without increasing system authority: contradiction/conflict detection between governed sources, explicit source priority, confidence aggregation, and a project-level knowledge health summary. Embeddings or external fact checking should only be introduced behind explicit capability and resource boundaries.

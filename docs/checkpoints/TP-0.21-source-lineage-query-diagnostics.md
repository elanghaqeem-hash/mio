# TP 0.21 — Source Lineage, Dependency & Query-Specific Knowledge Diagnostics

## Scope

This checkpoint adds explicit project knowledge lineage metadata, fail-closed dependency validation, lineage-aware corroboration, transparent retrieval score decomposition, and query-specific diagnostics.

## Invariants

- Lineage is explicit governance metadata; MIO does not silently infer upstream identity.
- Self-dependencies, unknown document dependencies, and dependency cycles are rejected.
- Shared upstream lineage prevents a human-declared corroboration group from being treated as independent corroboration.
- Distinct lineage families are a governance signal only; MIO does not prove legal, editorial, organizational, or factual independence.
- Lineage and source priority cannot manufacture lexical relevance.
- Project context remains `DATA_ONLY` and never becomes instruction authority.
- Retrieval score decomposition explains ranking only and is not truth probability, epistemic confidence, semantic entailment, or fact checking.

## Validation baseline

Implementation head `99696e80c04fe94af8076b03c7200bc206ffa48f` passed the MIO Validation Gate:

- dependency install / audit PASS
- lint PASS with 0 errors and existing legacy warnings only
- web production build PASS
- Electron main/preload build PASS
- automated system/security/knowledge tests PASS
- shared-upstream corroboration guardrail PASS
- self-dependency rejection PASS
- dependency-cycle rejection PASS
- query diagnostics transparency PASS
- relevance non-manufacture guardrail PASS
- lineage persistence PASS
- lineage provenance PASS

## Known boundaries

- Upstream identity is user/process supplied metadata and is not externally verified.
- A distinct lineage key does not prove source independence.
- The current project UI supports one direct parent selector while the core supports multiple dependency parents.
- Query diagnostics currently describe selected retrieval hits; they are not a full semantic explanation engine.
- No automatic web revalidation or semantic provenance extraction is introduced in this milestone.

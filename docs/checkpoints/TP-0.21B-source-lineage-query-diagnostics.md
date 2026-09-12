# TP 0.21B — Source Lineage, Dependency & Query-Specific Knowledge Diagnostics

## Baseline

This checkpoint is rebased directly on integration commit `f5297856f88b4a7f2f6427c15283f4c4664b5e98`, which already contains validated TP 0.21 Layered Memory Governance.

## Scope

- Explicit upstream source identity and document dependency metadata.
- Fail-closed self-dependency, unknown dependency, and dependency-cycle rejection.
- Lineage-aware corroboration so same-upstream sources do not inflate independent evidence strength.
- Transparent retrieval score decomposition: lexical relevance, trust, freshness, and source priority.
- Query-specific selected-source and lineage-diversity diagnostics.
- Project UI for explicit lineage review and retrieval diagnostics.
- Persistent lineage provenance through existing project storage.

## Security & Truthfulness Invariants

- Lineage metadata is explicitly supplied by the user/process; MIO does not silently infer upstream identity.
- Distinct lineage keys are governance metadata and do not prove legal, editorial, organizational, or factual independence.
- Same-lineage sources remain usable but cannot create an independent `CORROBORATED` evidence state by themselves.
- Lineage and priority never manufacture lexical relevance.
- Project documents remain `DATA_ONLY`; lineage does not increase instruction authority.
- Retrieval diagnostics explain ranking only. They are not factual confidence, truth probability, semantic entailment, or automatic fact checking.
- No new filesystem, network, model, tool, permission, or autonomous execution authority is introduced.
- Layered Memory Governance from TP 0.21 remains intact and is tested in the same validation command.

## Known Boundaries

- Upstream identity is not externally verified.
- Current UI exposes one direct parent selector while the core supports multiple parents.
- Query diagnostics explain selected retrieval hits, not a complete semantic causal graph.
- No automatic online revalidation or semantic provenance extraction is introduced.

## Gate

The frozen checkpoint must pass dependency audit, lint, web build, Electron build, the full existing memory-governance suite, and the lineage diagnostics suite before PR finalization and merge.

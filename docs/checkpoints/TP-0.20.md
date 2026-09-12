# TP 0.20 — Corroboration Groups & Conflict Resolution Workflow

## Scope
TP 0.20 extends project knowledge governance with explicit human-declared corroboration groups and reviewable conflict-resolution metadata. It does not introduce automatic truth adjudication, semantic fact checking, or new execution authority.

## Implemented
- Persistent project-scoped corroboration groups containing at least two active document sources.
- Corroboration groups are explicitly created by the user; multiple sources do not automatically become corroborated.
- Knowledge Health now separates governance health from evidence strength: NONE / SINGLE_SOURCE / MIXED / CORROBORATED.
- Knowledge Health reports corroborated-source count and valid corroboration-group count.
- Potential conflicts receive deterministic conflict keys and remain visible after review.
- Explicit conflict-review statuses: ACCEPTED_VARIANCE, PREFER_SOURCE, RESOLVED_BY_SUPERSESSION.
- PREFER_SOURCE is constrained to a source in the detected conflict pair.
- Reviewed conflicts no longer count as open-conflict health penalty, while their source signals and resolution metadata remain visible.
- Dedicated Corroboration & Conflict Review workspace in Project Context.
- Corroboration and conflict-review decisions persist through StorageProvider and are recorded in governance provenance.

## Security / truthfulness semantics
- CORROBORATED means the user explicitly grouped sources as mutually supporting for a shared topic; it does not prove factual correctness or source independence.
- Conflict review records a human governance decision and never rewrites original source content.
- ACCEPTED_VARIANCE and PREFER_SOURCE are governance states, not MIO truth judgments.
- Potential conflict detection remains `BOUNDED_GOVERNANCE_HEURISTIC` based on bounded lexical/topic, numeric, and polarity signals.
- Project documents remain DATA_ONLY application context and never become trusted instructions.
- No new filesystem, network, model, tool, permission, or autonomous execution capability is introduced.

## Validation baseline
Final Gate 1 implementation head: `f6cd8d910447570872a203a08aaf4700363002a6`

- npm dependency audit: 0 vulnerabilities
- lint: 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload TypeScript build: PASS
- automated validation: **177/177 PASS**
- multiple-source MIXED guardrail: PASS
- minimum-two-source corroboration guardrail: PASS
- explicit CORROBORATED transition: PASS
- conflict remains visible after corroboration: PASS
- preferred-source scope guardrail: PASS
- accepted-variance review: PASS
- reviewed-conflict open-penalty removal: PASS
- corroboration persistence: PASS
- conflict-review persistence: PASS
- provenance persistence: PASS

## Known boundaries
- Corroboration groups do not determine whether sources are genuinely independent or derived from the same upstream source.
- Group membership does not inspect semantic equivalence of all claims within the documents.
- Conflict resolution does not automatically modify retrieval priority; source priority remains separately governed.
- RESOLVED_BY_SUPERSESSION exists as a governance status, but supersession itself continues to be performed through the existing explicit source-supersession workflow.
- Conflict heuristics may produce false-positive review candidates.
- Knowledge Health remains a project-governance quality indicator, not a factual confidence probability.

## Next safe direction
A later milestone can add source-dependency/origin lineage, corroboration-topic labels at retrieval time, and query-specific knowledge diagnostics. Semantic similarity, embeddings, or external verification should only be added behind explicit privacy, network, capability, cost, and resource controls.

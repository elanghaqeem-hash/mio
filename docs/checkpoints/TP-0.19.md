# TP 0.19 — Knowledge Health, Source Priority & Potential Conflict Detection

## Scope
TP 0.19 adds project-scoped knowledge quality diagnostics and source-priority governance without increasing MIO's execution authority or converting project sources into trusted instructions.

## Implemented
- Persistent source priority metadata: PRIMARY / STANDARD / LOW.
- PRIORITY_CHANGED governance provenance events.
- Backfill/migration defaults missing source priority to STANDARD.
- Priority survives StorageProvider persistence round-trip.
- Retrieval ranking applies priority only after lexical relevance exists; priority cannot create relevance from an unrelated source.
- Priority is carried transparently into DATA_ONLY application context.
- Project Knowledge Health evaluator with active, verified, current, primary, review-required, and potential-conflict metrics.
- Bounded health score (0–100) and HIGH / MEDIUM / LOW health confidence using an explicit `BOUNDED_GOVERNANCE_HEURISTIC` method.
- Conservative `POTENTIAL_CONFLICT` detection for shared-topic numeric mismatch and bounded polarity mismatch signals.
- Conflict signals expose bounded snippets and shared terms for human review.
- Knowledge Governance Center surfaces health summary, potential conflicts, priority controls, and provenance metadata.

## Security / truthfulness semantics
- PRIMARY / STANDARD / LOW is a user governance preference, not instruction authority.
- Priority is applied only after lexical relevance exists and cannot force an unrelated source into retrieval.
- Project content remains DATA_ONLY model context and cannot modify trusted system instructions.
- `POTENTIAL_CONFLICT` is a deterministic review signal, not semantic entailment, contradiction proof, or a factual truth judgment.
- Knowledge health score measures bounded governance quality signals; it is not an epistemic probability or guarantee that project knowledge is correct.
- No new filesystem, network, model, tool, or autonomous execution authority was added.

## Validation baseline
Final Gate 1 implementation head: `875589f401da1a0138487941b21c315a0465bb97`

- npm dependency audit: 0 vulnerabilities
- lint: 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload TypeScript build: PASS
- automated validation: **162/162 PASS**
- priority relevance guardrail: PASS
- unrelated-source conflict guardrail: PASS
- priority DATA_ONLY transparency: PASS
- priority persistence round-trip: PASS
- PRIORITY_CHANGED provenance persistence: PASS

## Known boundaries
- Potential conflict detection currently uses bounded lexical/topic overlap plus numeric or polarity signals; it does not perform semantic contradiction detection.
- Numeric mismatch can intentionally produce false-positive review candidates when shared-topic documents contain different but legitimate numbers.
- Polarity mismatch is document-level and conservative; it is not natural-language inference.
- A small project with one VERIFIED/CURRENT source can receive a high governance health score; the score describes governance state, not independent corroboration or truth.
- Knowledge Health is project-scoped, not a cross-project enterprise knowledge catalog.
- Freshness remains manual governance metadata and is not automatically revalidated online.

## Next safe direction
A subsequent milestone may introduce explicit corroboration groups, source diversity/independence signals, conflict resolution status, and query-time knowledge diagnostics while preserving DATA_ONLY context and human review. Semantic embeddings or external fact verification should be introduced only behind explicit capability, resource, privacy, and network boundaries.

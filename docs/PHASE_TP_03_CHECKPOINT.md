# MIO Web Lab — TP 0.3 Checkpoint

## Milestone
Research Engine & Online Intelligence

## Status
VERIFIED — eligible to merge into `refactor/mio-web-lab-v2` after final validation gate.

## Audit Findings Resolved
- Replaced simulated `setTimeout` research behavior and fabricated result URLs.
- Introduced provider abstraction for online research.
- Removed the assumption that presence of a source automatically means VERIFIED.
- Added explicit source reliability scoring.
- Added provider failure isolation.
- Added deterministic deduplication and citation generation.
- Added conflict detection.
- Routed all external excerpts through PolicyEngine as untrusted content.

## Implemented Architecture

```text
User Query
  -> QueryPlanner
  -> SearchProvider[]
      -> WikipediaProvider
      -> CrossrefProvider
  -> Provider failure isolation
  -> Deduplication
  -> PolicyEngine sanitization
  -> SourceEvaluator
  -> CitationManager
  -> ConflictDetector
  -> ResearchReport
  -> ResearchStudioView
```

## Security Guarantees
- External content is treated as untrusted data, never instructions.
- Suspicious external content is downgraded to `UNVERIFIED`.
- Executable/script content is sanitized before entering research context.
- Research output does not directly write to long-term memory.
- Provider failures cannot silently fabricate replacement sources.

## Validation Evidence
GitHub Actions workflow: `MIO Validation Gate`.

Validated on PR #4:
- dependency installation: PASS
- npm audit result during install: 0 vulnerabilities
- lint: PASS, 0 errors
- production TypeScript/Vite build: PASS
- legacy + TP 0.2 regression tests: PASS
- TP 0.3 ResearchEngine tests: PASS
- dedicated conflict detector test: PASS
- total validation: 24/24 PASS

## Non-blocking Technical Debt
- 50 lint warnings remain in legacy/prototype modules.
- production JavaScript bundle remains above 500 kB and requires later code splitting.
- Vite emits CommonJS/ESM config-loader compatibility warning.
- provider availability depends on browser/network/CORS and must degrade gracefully.
- SourceEvaluator currently uses deterministic heuristics; stronger provenance/domain policy is a future refinement.
- ConflictDetector currently detects same-title divergent excerpts; semantic claim-level conflict detection belongs in a later intelligence phase.

## Gate Decision
TP 0.3 may proceed to integration because all blocking validation criteria pass. TP 0.4 must not bypass the ResearchEngine, PolicyEngine, Permission model, or Result validation layers established in previous milestones.

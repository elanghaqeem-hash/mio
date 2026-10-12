# MIO-PRV-01 — Core Runtime Contracts (schema v1)

Code: `src/contracts/` (`MioContracts.ts`, `MioContractValidation.ts`, `MioContractAdapters.ts`) · Tests: `src/tests/mioContractTests.ts`

## 1. Inventory: existing types and how they map (MIO-PRV-01.01)

Before this milestone, every subsystem had its own request, result, evidence, and trace shape. The contracts below **reuse** the existing domain enums and do not redefine them.

| Contract | Replaces / unifies | Reused domain types |
|---|---|---|
| `MioContext` | `ToolExecutionContext`, `CapabilityExecutionContext` (`src/types/tools.ts`, `capabilities.ts`); privacy from `AIOrchestrationRequest.privacy` | `MioSystemMode` |
| `MioPermission` | `AuthorizationScope` + `PermissionLevel` (`src/types/security.ts`) | `PermissionLevel` |
| `MioCapabilityRequest<I>` | ad-hoc tool inputs, `AIOrchestrationRequest`, `AgentFileRequest` (#520) | — |
| `MioCapabilityResult<O>` | `ToolResult<T>` (`src/types/tools.ts`), `AgentFileResult` | — |
| `MioEvidence` | `ResearchSource` (`src/types/research.ts`), `ApplicationContextSource`, `MemoryContextSource` (`src/types/models.ts`) | `EpistemicStatus` |
| `MioArtifact` | `ProjectAsset` (`src/types/project.ts`), `CreativeAssetReference` | `AssetType`, `AssetOrigin` |
| `MioExecutionTrace` / `MioTraceSpan` | `ExecutionLedgerEntry` (`src/types/resources.ts`), `AIProvenanceReceipt` (`src/ai-orchestration`), `TaskStepResultBinding` | `ToolRiskLevel` (via capabilities) |
| `MioRuntimeError` | free-form `error?: string` fields across subsystems | — |

Overlaps noted for later milestones (not changed here):
- `ToolExecutionContext` and `CapabilityExecutionContext` are near-duplicates. PRV-05 should retire one in favor of `MioContext`.
- `ApplicationContextSource` and `MemoryContextSource` carry separate trust vocabularies. `MioEvidence.trust` (`TRUSTED`/`UNTRUSTED`) is the common denominator PRV-03 will rank on.

## 2. Rules the contracts enforce (MIO-PRV-01.02)

- **Versioned:** every top-level contract carries `schemaVersion: 1`. Any other value is rejected, never coerced.
- **Fail-closed validation:** hand-written validators with no new dependency return field-path errors. Identifiers must be non-empty, contain no whitespace, and be at most 200 characters. Text is length-bounded, and arrays are bounded (1,000 spans, 500 evidence items, 500 artifacts).
- **No secrets:** requests and results are rejected if any nested key looks secret-bearing (`apiKey`, `authorization`, `token`, `secret`, `password`, `credential`), using the existing `SecretRedaction` rule.
- **External content never gains authority:** research evidence is always `UNTRUSTED`, even when VERIFIED. Project knowledge is `TRUSTED` only when governance marked it VERIFIED.
- **Safe recovery semantics:** `MioRuntimeError.mutationState` is `NONE`, `COMMITTED`, or `UNKNOWN`. An `UNKNOWN` error can never be `retryable: true`, and a failed tool call needing `L3_MODIFY` or higher maps to `UNKNOWN`. This is the hook PRV-10 needs to never auto-retry an uncertain mutation.
- **Consistent results:** a `SUCCEEDED` result must have `output` and no `error`; a failed, denied, or cancelled result must have `error` and no `output`. The trace must belong to the same request and capability. Span IDs are unique, parents must exist, and times and costs are non-negative and ordered.
- **No drift from domain enums:** runtime enum lists carry compile-time exhaustiveness checks. Adding, for example, a new `MioSystemMode` without updating the contracts fails `tsc` (verified by a negative check).
- **UI-independent:** `src/contracts` imports no React, three.js, `modes/`, or `components/`. A test enforces this.

## 3. Adapters (MIO-PRV-01.03)

Pure functions, with no behavior change in the source subsystems: `permissionFromAuthorizationScope`, `evidenceFromResearchSource`, `evidenceFromContextSource`, `artifactFromProjectAsset`, `traceSpanFromAIProvenance`, `capabilityResultFromToolResult`. Every adapter's output is validated in the tests.

Native emission (subsystems producing contracts directly instead of being adapted) belongs to PRV-05 (capability protocol) and PRV-10 (tracing).

## 4. Versioning policy

- Additive optional fields do not change `schemaVersion`.
- Removing or renaming a field, changing a field's meaning, or tightening validation for existing producers requires `schemaVersion: 2`, a migration function from v1, and keeping a v1 validator for as long as persisted v1 data can exist.
- Validators reject unknown versions. Callers must migrate explicitly.

## 5. Exit gate

**"All core contracts can be used without depending on any subsystem's UI."** PASS: the 11 contract tests are green, including the UI-independence check, and `tsc` passes with the exhaustiveness guards.

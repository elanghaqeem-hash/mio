# MIO Web Lab — TP 0.28 Checkpoint

## Milestone
Cross-Mode Creative Pipeline

## Objective
Replace the earlier timer-driven/dummy creative orchestration prototype with a persistent, project-scoped cross-mode pipeline that records dependency relationships, generated asset lineage, structural validation outcomes, and project version snapshots.

## Implemented
- Persistent `creativePipelines` state in `.mioproject` data.
- Explicit creative step IDs and `dependsOnStepIds` dependency graph.
- Fail-closed dependency resolution: missing or incomplete declared dependencies block downstream generation.
- Project asset linkage through `dependsOnAssetIds` and `outputAssetId`.
- Generated assets carry `__mioPipeline` metadata with pipeline ID, step ID, mode, upstream asset IDs, prompt, and generation timestamp.
- Animation output binds to the actual generated 3D object ID when a 3D dependency exists.
- All generated prototype payloads must pass the existing mode-specific `ResultValidator` before project insertion.
- STOP MIO cancels the pipeline without silently continuing output generation.
- Successful pipeline completion creates and records one project version snapshot.
- Project Overview exposes both live execution state and persistent creative pipeline history.
- Removed the duplicate UI snapshot that previously occurred after orchestrator completion.

## Security / truthfulness boundaries
- Pipeline generation is deterministic local prototype generation. It does not imply external generative-model execution or production artistic quality.
- Structural validation confirms schema/integrity constraints only; it does not certify aesthetic quality, factual correctness, rights clearance, or production readiness.
- No additional filesystem, OS, network, model, Project Memory, or Long-Term Memory authority is introduced.
- Missing declared dependencies fail closed rather than being ignored.
- Asset lineage is project-local execution metadata and is not cryptographic provenance.

## Validation Gate 1
Validated on head `538df4ced95b65f6f10bf27990e09e13cbbf14f8` before this checkpoint commit:
- `npm ci`: PASS, 0 vulnerabilities
- lint: PASS, 0 errors / 31 existing warnings
- web production build: PASS
- Electron main/preload build: PASS
- automated validation: **288/288 PASS**

Coverage includes:
- explicit dependency graph
- every planned step structural validation
- persistent project pipeline record
- generated asset dependency lineage
- animation-to-generated-3D object binding
- project version snapshot linkage
- persistence round-trip
- missing dependency fail-closed
- STOP MIO cancellation
- truthful creative pipeline disclosure

## Known debt
- Creative payload generation remains deterministic prototype logic and is not yet connected to external image/audio/3D generation providers.
- Asset dependency metadata is application-level provenance, not cryptographic attestation.
- Existing lint warnings remain outside TP 0.28 scope.
- Studio3D remains the largest production chunk and should be revisited during production-readiness work.

## Gate Decision
TP 0.28 may proceed to frozen-SHA validation and PR Gate 2 only if the checkpoint commit itself passes the same validation pipeline.

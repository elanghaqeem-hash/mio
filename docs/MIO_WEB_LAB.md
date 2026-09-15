# MIO Web Lab / Technology Preview

## Purpose

MIO Web Lab is the validation runtime for MIO V2. It is not a replacement for the desktop product. Its purpose is to prove UI, intelligence, research, project, security, agent, and native creative-engine capabilities before deeper Electron/OS integration.

## Architectural rule

Business logic must remain platform-independent wherever practical.

```text
User Input
  -> Perception / Input Normalization
  -> Intelligence
  -> Orchestrator
  -> Security / Permission
  -> Tool or Creative Capability
  -> Result Validation
  -> Response / Project State
```

No AI component may directly receive unrestricted browser, Electron, Node.js, filesystem, network, camera, microphone, or operating-system access.

## Runtime model

```text
                   MIO SHARED LOGIC
                         |
             +-----------+-----------+
             |                       |
       MIO WEB LAB              MIO DESKTOP
       Web adapters             Electron adapters
```

The target is to reuse approximately 60-80% or more of MIO logic between browser and desktop runtimes.

## Phase 0 - Foundation

- Preserve existing working UI and creative prototypes.
- Introduce explicit runtime abstraction.
- Separate intelligence from orchestration.
- Keep security and permission gates mandatory.
- Avoid mass file moves until dependency boundaries are stable.
- Introduce compatibility modules first, then migrate incrementally.

## TP 0.1 - Core Intelligence & UI Foundation

TP 0.1 validates:

1. MIO Core state model.
2. Input -> intent -> plan -> permission -> process -> response flow.
3. Extracted `IntentAnalyzer`.
4. Extracted `TaskPlanner`.
5. Cross-platform runtime contract.
6. Web runtime capability adapter.
7. Existing multi-mode workspace remains available.

## New foundation modules

```text
src/
  intelligence/
    IntentAnalyzer.ts
  orchestrator/
    TaskPlanner.ts
  platform/
    RuntimeAdapter.ts
    web/
      WebRuntimeAdapter.ts
```

These are compatibility-foundation modules. Existing modules are intentionally not mass-relocated during TP 0.1.

## Next checkpoints

### TP 0.2

- StorageProvider abstraction.
- Browser IndexedDB project persistence.
- Project/context isolation.
- Controlled memory model.

### TP 0.3

- SearchProvider / WebProvider abstraction.
- Research pipeline.
- Source validation and citation model.
- External-content isolation.

### TP 0.4

- Tool Registry.
- Tool Router.
- Task Queue / task lifecycle.
- Risk Analyzer.
- Central execution gateway.

## Desktop boundary

The following remain desktop-specific integrations and should be implemented behind adapters rather than embedded into shared logic:

- native filesystem access;
- SQLite;
- OS credential storage;
- tray/background integration;
- local process execution;
- Ollama/local-model process integration;
- Windows startup;
- native notifications and hardware telemetry.

## Security invariant

MIO may reason autonomously, but execution must remain within authorized boundaries. Any sensitive capability must pass policy, permission, scope, validation, and audit controls before execution.

# TP 0.11 — Capability Manifest & Secure Service Gateway Checkpoint

Status: IMPLEMENTED / GATE 1 PASSED / GATE 2 PENDING
Branch: `milestone/mio-web-lab-tp-0.11`
Base: `refactor/mio-web-lab-v2`
PR: #12
Gate 1 validated head: `30550c4bd2e9fa97b0ecc2aec25bb8062ae26648`

## Objective

Establish a central, default-deny capability manifest so tools, services, and agents cannot obtain execution authority merely by existing in code. Capability metadata becomes an independent security contract for mode, risk, permission, availability, network access, scope requirements, and timeout.

## Canonical control flow

```text
Agent / User Intent
  -> Capability Manifest
  -> Runtime Capability Context Check
  -> Policy
  -> Risk / Resource Governor
  -> Scoped Permission / Dry Run
  -> ToolRouter or SecureServiceGateway
  -> Sandbox / Provider / Adapter
  -> Result Validation
  -> Execution Ledger
```

Capability authorization is additive security. It does not replace PolicyEngine, RiskAnalyzer, ResourceGovernor, PermissionEngine, Sandbox, ResultValidator, cancellation, task lifecycle, or STOP MIO.

## Capability manifest

Every descriptor declares:
- capability ID and kind (`TOOL`, `SERVICE`, `AGENT`);
- owner layer;
- authorized modes;
- risk level;
- required permission level;
- availability state;
- network-access declaration;
- required scope fields;
- execution timeout.

Unknown capabilities are denied. Unavailable capabilities are denied. Required task/project/tool/resource/path/network-origin scope must be present before execution may continue.

## Tool contract enforcement

`ToolRegistry` now validates each tool against the central manifest at registration time. Registration fails if tool code disagrees with the manifest on:
- capability existence/kind/availability;
- permission level;
- risk level;
- network access;
- timeout;
- authorized modes.

`ToolRouter` then re-checks capability authorization on every invocation and again at the sandbox execution boundary. Runtime execution therefore cannot rely only on registration-time trust.

## Agent capability envelope

`agent.orchestrator` is an explicit capability. AgentOrchestrator checks its task/project/mode envelope before scheduling and again before executing the task. The agent capability does not grant sub-capabilities: model, tool, service, and sensitive operations retain their independent gates.

## SecureServiceGateway

A new gateway defines the only supported contract for future privileged MIO service handlers. Service execution follows:

```text
Service manifest
  -> runtime scope check
  -> policy validation
  -> resource preflight
  -> scoped permission
  -> resource consumption
  -> sandbox + cancellation
  -> service handler
  -> output validation
  -> audit/activity result
```

Service calls currently consume the existing privileged tool-call budget, with network-backed services also consuming network-call budget. This preserves bounded execution without creating a second uncontrolled resource path.

## Runtime truthfulness

The web-lab manifest explicitly declares:
- `service.filesystem` = `UNAVAILABLE`;
- `service.os` = `UNAVAILABLE`.

Handlers cannot be registered for these unavailable services. TP 0.11 therefore does not simulate desktop filesystem or OS authority that the current web runtime does not possess.

## Observability

Capability ALLOW/BLOCK decisions are written into the persistent ExecutionLedger as `SECURITY` entries associated with the task where available. This makes manifest decisions inspectable alongside task/resource history.

## Validation Gate 1

GitHub Actions `MIO Validation Gate` passed on head `30550c4bd2e9fa97b0ecc2aec25bb8062ae26648`.

Results:
- dependency install/audit: PASS — 0 vulnerabilities;
- lint: PASS — 0 errors, 41 existing warnings;
- TypeScript + Vite production build: PASS;
- total automated validations: **90/90 PASS**;
- original system/security audit suite: **23/23 PASS**;
- all TP 0.1–0.10 validations remain green.

New TP 0.11 validations verify:
- undeclared capabilities default to deny;
- manifest-declared unavailable services cannot execute;
- mode envelopes are enforced;
- ToolRegistry rejects tools missing from the manifest;
- ToolRegistry rejects metadata drift from the central manifest;
- SecureServiceGateway rejects handlers for unavailable services;
- an available test service executes only through capability/resource/permission/sandbox/validation gates;
- required service resource scope is fail-closed;
- capability decisions persist in ExecutionLedger.

## Build observation

Gate 1 output:
- initial application JS: ~292.14 kB minified / ~88.64 kB gzip;
- ChatStudio: ~31.62 kB / ~9.88 kB gzip;
- TaskScheduler: ~3.76 kB / ~1.53 kB gzip;
- TaskMonitor: ~12.29 kB / ~3.28 kB gzip;
- Studio3D remains ~545.07 kB / ~136.07 kB gzip and remains lazy-loaded.

## Known boundaries

- Capability manifest is code-defined in this Technology Preview; there is no signed/admin-managed manifest distribution yet.
- `service.filesystem` and `service.os` remain unavailable until real desktop adapters are connected through secure IPC.
- Service invocations are currently metered as privileged tool calls; a dedicated service budget may be introduced later if operational data justifies it.
- Network capability can require an exact network origin where a caller can provide one; the current `research.search` capability represents a bounded research-provider group rather than a single origin.
- SecureServiceGateway is infrastructure; no fake native handler is provided merely to demonstrate availability.
- Capability decisions are audit metadata but the ledger is not yet cryptographically tamper-evident.
- Existing 41 lint warnings, Vite config-loader warning, and large Studio3D lazy chunk remain known technical debt.

## Definition of Done

- [x] Central capability descriptor model
- [x] Default-deny CapabilityRegistry
- [x] Manifest availability and mode enforcement
- [x] Tool registration contract enforcement
- [x] Runtime ToolRouter capability enforcement
- [x] Execution-boundary capability re-check
- [x] AgentOrchestrator capability envelope
- [x] SecureServiceGateway infrastructure
- [x] Explicit unavailable filesystem/OS services in web runtime
- [x] Resource/permission/sandbox/validation path for service invocation
- [x] Capability decision persistence in ExecutionLedger
- [x] Deterministic capability/service tests
- [x] Gate 1: lint/build/tests pass (90/90)
- [ ] Gate 2 on checkpoint commit
- [ ] PR ready for review
- [ ] Merge to `refactor/mio-web-lab-v2`

## Recommended next milestone

TP 0.12 should implement **Desktop Capability Bridge & Secure IPC Service Adapters**. The next safe step is to connect real Electron capabilities to the service gateway through typed, allowlisted IPC—not to expose unrestricted Node/OS access. Start with narrowly scoped desktop operations, enforce sender/schema/capability/permission/resource/path validation, and keep destructive OS/process actions unavailable until dedicated tests and user-confirmation flows exist.

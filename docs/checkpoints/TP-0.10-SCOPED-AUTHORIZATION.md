# TP 0.10 — Scoped Authorization & Bounded Autonomy Checkpoint

Status: IMPLEMENTED / GATE 1 PASSED / GATE 2 PENDING
Branch: `milestone/mio-web-lab-tp-0.10`
Base: `refactor/mio-web-lab-v2`
PR: #11
Gate 1 validated head: `92b0c9c7da7ec560be35ad05b55e7e60ee402474`

## Objective

Enforce task-bound, scope-limited authorization for privileged MIO execution so autonomous reasoning never becomes unrestricted authority. Permission grants are explicit capabilities with task/project/action/resource/network boundaries, expiry, bounded uses, dry-run disclosure, revocation, and audit-visible decisions.

## Canonical flow

```text
User Directive
  -> Intent / TaskPlanner
  -> TaskRuntime / TaskScheduler
  -> ResourceGovernor
  -> Scoped Permission / Dry Run
  -> ToolRouter / ModelRouter / Sensitive Agent Gate
  -> Sandbox / Provider
  -> Result Validation
  -> Task terminal state
  -> Grant revocation / Execution Ledger / Audit
```

Authorization remains subordinate to Policy, Risk, Resource Governance, Sandbox, Result Validation, cancellation, and STOP MIO. A valid grant never bypasses those controls.

## Authorization scope

`AuthorizationScope` can bind an approval to:
- task ID;
- project ID;
- action and target;
- tool ID;
- resource ID;
- path;
- network origin;
- whether network access is authorized.

Scope matching is fail-closed. A grant approved for one task, project, provider, resource, origin, or path cannot silently authorize another scope.

## Grant boundaries

Authorization grants include:
- permission level;
- exact scope;
- granted-at and expiry timestamps;
- source (`AUTO_POLICY` or `USER_APPROVAL`);
- bounded `maxUses` and current use count;
- dry-run requirement state;
- explicit revocation state/reason.

L5 destructive grants are one-shot and short-lived. L4/L5 execution requires a dry-run permission interaction. Lower-risk grants may be policy-issued but remain task/scope/TTL/use bounded.

Grant reuse is permitted only when the requested scope is identical and use/expiry limits still permit reuse. One-shot tool and remote-model grants are consumed at the execution boundary, not merely when the UI displays approval.

## Dry-run / human-in-the-loop

The dry-run surface discloses:
- proposed action and target;
- expected changes;
- risks;
- expected result;
- permission level;
- task/project/tool identity when applicable;
- scope summary including resource/path/network origin;
- expiry and maximum uses.

User approval creates only the disclosed bounded grant. Review or cancel produces no execution authority.

## Enforcement points

### ToolRouter
- builds an exact task/project/tool/network scope;
- requests scoped permission;
- validates scope before execution;
- consumes one-shot grant inside the sandbox execution boundary;
- revokes/blocks on cancellation, resource denial, expiry, mismatch, or terminal completion.

### ModelRouter
- remote providers require scoped L4 dry-run approval;
- authorization is bound to task/project/provider resource and resolved network origin;
- resource budgets remain independently enforced;
- one-shot grant is consumed before provider execution;
- cancellation, expiry, mismatch, STOP MIO, and resource denial remain fail-closed.

### Sensitive Agent Gate
- sensitive requests use scoped L5 approval bound to the current task/project/resource;
- no generic workspace-wide destructive approval is accepted;
- scope mismatch cancels the task rather than widening authorization.

## Revocation semantics

- terminal task states revoke remaining task grants;
- STOP MIO revokes all active grants;
- explicit revocation is supported per grant or per task;
- expired grants are pruned and cannot be reused;
- consumed one-shot grants cannot authorize a second execution.

Authorization state is deliberately not persisted as executable authority across application restart.

## Validation Gate 1

GitHub Actions `MIO Validation Gate` passed on head `92b0c9c7da7ec560be35ad05b55e7e60ee402474`.

Results:
- dependency install/audit: PASS — 0 vulnerabilities;
- lint: PASS — 0 errors, 41 existing warnings;
- TypeScript + Vite production build: PASS;
- total automated validations: **81/81 PASS**;
- original system/security audit suite: **23/23 PASS**;
- all TP 0.1–0.9 suites remain green.

New TP 0.10 validation verifies:
- L4 remote execution requires explicit dry-run approval;
- exact approved scope validates;
- dry-run exposes project and network-origin boundaries;
- task/project/network-origin escalation is rejected;
- one-shot authorization is consumed exactly once;
- consumed one-shot grants cannot authorize a second execution;
- bounded same-scope reuse works only while use budget remains;
- exhausted reuse budget removes active authorization;
- STOP MIO revokes all active scoped authorization.

## Build observation

Gate 1 output:
- initial application JS: ~291.88 kB minified / ~88.56 kB gzip;
- ChatStudio chunk: ~25.12 kB / ~8.50 kB gzip;
- TaskScheduler chunk: ~3.76 kB / ~1.53 kB gzip;
- TaskMonitor chunk: ~12.29 kB / ~3.28 kB gzip;
- Studio3D remains the known large lazy chunk at ~545.07 kB / ~136.07 kB gzip.

## Known boundaries

- Authorization grants are session/runtime authority and are not persisted for replay after restart.
- Scope enforcement is only as specific as the resource/path/origin supplied by the caller; future service adapters must always supply canonical scope descriptors.
- Network-origin authorization is a logical capability boundary, not an operating-system packet firewall.
- The execution ledger remains audit metadata rather than a cryptographically tamper-evident log at this Technology Preview stage.
- Existing 41 lint warnings remain the technical-debt baseline and were not increased by this milestone.
- Existing Vite config-loader and Studio3D chunk-size warnings remain non-blocking known debt.

## Definition of Done

- [x] Task/project/action scoped authorization grants
- [x] Tool/resource/network/path scope model
- [x] TTL and bounded-use grants
- [x] Dry-run requirement for L4/L5 execution
- [x] One-shot execution-boundary consumption
- [x] ToolRouter scoped enforcement
- [x] Remote ModelRouter scoped enforcement
- [x] Sensitive-agent L5 project/task binding
- [x] Task-terminal grant revocation
- [x] STOP MIO global grant revocation
- [x] Deterministic scope-escalation/reuse tests
- [x] Gate 1: lint/build/tests pass (81/81)
- [ ] Gate 2 on this checkpoint commit
- [ ] PR ready for review
- [ ] Merge to `refactor/mio-web-lab-v2`

## Recommended next milestone

TP 0.11 should implement **Capability Manifest & Secure Service Gateway**: central capability descriptors for tools/services/agents, explicit mode/risk/permission/resource/scope requirements, agent capability envelopes, and mandatory routing of privileged service access through the same Security -> Permission -> Tool/Service Gateway path. This will prevent filesystem, network, OS, voice/vision, and future creative services from developing parallel bypass paths as MIO expands.

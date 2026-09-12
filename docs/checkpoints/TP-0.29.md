# MIO Web Lab — TP 0.29 Checkpoint

## Milestone
Security & Permission Completion

## Objective
Complete the user-visible and persistent security control layer around MIO's existing scoped authorization engine without expanding underlying authority.

## Implemented
- Explicit L0-L5 permission policy metadata with distinct approval semantics.
- L4 execution remains explicit dry-run approval.
- L5 destructive operations are single-use, short-lived, exact-scope, and require a separate destructive acknowledgement in the permission modal.
- Permission modal remounts per authorization request so destructive acknowledgement cannot carry over to a different request.
- Security Control Center shows actual active scoped grants, including task/project/resource, expiry, use budget, and grant source.
- Users can revoke individual grants or revoke all active grants.
- Removed synthetic/fake security boot events from Security Dashboard.
- Added persistent SecurityAuditLog backed by StorageProvider and actual SECURITY_EVENT records only.
- Long-term memory single-item deletion now executes through bounded L3 modify authority.
- Bulk long-term memory and review-queue deletion now executes through explicit L5 destructive authority.
- Privileged memory operations are centralized in GovernedMemoryActions rather than embedded in UI code.
- STOP MIO and terminal-task grant revocation behavior remains enforced by PermissionEngine.

## Security / truthfulness boundaries
- The dashboard displays authority MIO actually has; it does not fabricate microphone, network, filesystem, or tool capability state.
- L0-L3 auto-scoped grants remain bounded by task/resource scope and use/expiry limits; they are not unrestricted authority.
- L4/L5 approval never grants broader scope than displayed in the permission preview.
- L5 acknowledgement is an additional UX safety gate; execution still requires PermissionEngine scope validation and grant consumption.
- SecurityAuditLog records observable security events only and does not contain or expose private chain-of-thought.
- No new filesystem, OS, network, model, Project Memory, or Long-Term Memory authority is introduced.

## Validation Gate 1
Validated on head `3b3e4421315270f5db576a9158a143c10ab37a0e` before this checkpoint commit:
- `npm ci`: PASS, 0 vulnerabilities
- lint: PASS, **0 errors / 25 legacy warnings**
- web production build: PASS
- Electron main/preload build: PASS
- automated validation: **298/298 PASS**

TP 0.29 coverage includes:
- complete L0-L5 policy ordering
- L4 vs L5 approval distinction
- real security-event persistence
- absence of synthetic security boot events
- L3 single-memory deletion with no reusable grant residue
- cancelled L5 operation cannot clear memory
- approved L5 bulk deletion is explicit, single-use, and <=30 seconds
- consumed L5 destructive grant leaves no reusable destructive authority

## Quality improvement
Initial TP 0.29 Gate 1 passed at 298/298 but introduced two React effect warnings. Both were removed before checkpoint freeze. Final lint warning count is 25, all inherited legacy warnings outside this milestone.

## Known debt
- Remaining 25 lint warnings are pre-existing UI/creative-mode debt and should be addressed during TP 0.30 production-readiness hardening.
- `npx tsx` still resolves tsx dynamically during CI; pinning it is a reproducibility improvement for TP 0.30.
- Vite emits a config-loader CommonJS/ESM warning.
- Studio3D remains above the 500 kB chunk warning threshold.
- SecurityAuditLog is application persistence, not append-only cryptographic audit storage.

## Gate Decision
TP 0.29 may proceed to frozen-SHA validation and PR Gate 2 only if this checkpoint commit passes the same validation pipeline.

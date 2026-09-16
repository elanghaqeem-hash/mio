# TP-0.65 Candidate Lifecycle Operator Guide

Use **Settings → Candidate Lifecycle Pipeline** as the operational map, not as a lifecycle execution console.

## How to read the map

- `COMPLETE`: evidence/lifecycle state is already present.
- `ACTION`: run the named existing gate on the named surface.
- `BLOCKED`: an authoritative existing gate reports a blocker; resolve that evidence/policy problem before continuing.
- `PENDING`: the stage is not yet applicable because an earlier lifecycle transition has not occurred.
- `OPTIONAL`: the current policy does not require this evidence while it is absent. If introduced, its validity/trust becomes enforceable.
- `N/A`: the stage does not apply to this candidate path.

The **Next required action** box points to the first blocked/actionable stage in lifecycle order. It does not execute that action.

## Normal governed path

A typical TP-0.63/0.64 desktop-trained candidate should progress as follows:

1. Candidate is explicitly registered from the verified handoff.
2. Run TP-0.50 adapter integrity scan in Candidate Lab.
3. Bind the current clean scan to the TP-0.58 handoff with TP-0.59.
4. Run candidate MioBench.
5. Complete explicit RELEASE_CANDIDATE review after eligibility becomes available.
6. Add signed provenance if required by the deployment/release policy.
7. Resolve any final promotion blockers and run the existing explicit promotion gate.
8. Run a **new** TP-0.50 scan after promotion and obtain `MATCH`.
9. Run the existing promoted-model activation gate; it separately checks live runtime readiness before ModelRouter changes.

## Important interpretation rules

A green dashboard card is evidence of current stored state, not a guarantee that a later gate will pass. A later scan, signer revocation, evidence change, benchmark replacement, or router change can change the projected state on the next refresh.

Do not treat `PROMOTED` as `ACTIVE`. Activation remains a separate explicit operation after post-promotion integrity and runtime readiness checks.

Do not treat benchmark success as release approval. RELEASE_CANDIDATE review still requires explicit human data-governance and security attestations.

## Troubleshooting

If promotion shows `BLOCKED`, inspect the blocker text first. The pipeline reports blocker reasons from the existing promotion authority instead of inventing its own policy.

If a TP-0.58 candidate shows handoff-binding problems, re-run/confirm the latest clean integrity scan and bind that exact current scan in **Training Handoff ↔ Adapter Integrity**.

If activation remains pending after promotion, run a fresh post-promotion integrity scan. The scan used at promotion cannot be reused as the post-promotion activation scan.

Refresh is safe: TP-0.65 does not train, benchmark, review, promote, activate, write evidence, change the active promoted pointer, or modify ModelRouter.

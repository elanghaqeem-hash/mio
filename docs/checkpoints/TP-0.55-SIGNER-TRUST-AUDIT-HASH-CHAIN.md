# TP-0.55 — Signer Trust Audit Hash Chain

Status: implementation candidate pending PR/CI validation

## Goal

Harden the TP-0.54 signer trust audit trail so storage tampering, event reordering, broken links, sequence manipulation, and signer-state divergence can be detected before signer trust is consumed by model-lifecycle gates.

## Context

TP-0.53 introduced trusted signed model artifact provenance. TP-0.54 added append-only trust/retrust/revoke audit events and explicit P-256 key rotation. TP-0.55 adds cryptographic linkage and verification to that audit history.

This checkpoint does not make the audit log externally immutable. It makes in-storage mutations detectable by Mio and causes trust-sensitive reads to fail closed when the audit chain is corrupt.

## Hash-chain contract

New signer trust events include:

- `previousEventHash`
- `eventHash`

`eventHash` is SHA-256 over deterministic canonical JSON containing the event's governed fields, including the previous-event hash. The first chained event uses the previous retained event as its anchor when one exists.

The verifier checks:

1. audit-index uniqueness and referenced event availability;
2. contiguous monotonic sequence order;
3. event ID consistency;
4. deterministic recomputation of each `eventHash`;
5. `previousEventHash` linkage;
6. transition from legacy unchained history into the first chained event;
7. latest audit status against the current stored signer state.

## Verification states

`ModelSignerTrustStore.verifyAuditChain()` exposes one of four states:

### EMPTY

No signer audit events exist.

### VALID

All retained audit events are cryptographically linked and all verification checks pass.

### LEGACY_UNCHAINED

Only pre-TP-0.55 audit events exist. These events remain readable for backward compatibility but do not themselves have cryptographic links.

The next TP-0.55 trust mutation anchors the legacy tail by hash, so later changes to that legacy tail become detectable.

### CORRUPT

One or more integrity checks fail. Examples include:

- an indexed event is missing;
- an event is duplicated or reordered;
- sequence values no longer match expected order;
- an event payload no longer hashes to its stored `eventHash`;
- `previousEventHash` no longer matches the prior event;
- signer state does not match the latest audited resulting status.

## Fail-closed trust consumption

Signer trust is security-sensitive input to signed-provenance verification, release review, final promotion and runtime activation.

TP-0.55 therefore makes signer reads fail closed when the audit chain is `CORRUPT`.

The following operations inherit that boundary:

- `ModelSignerTrustStore.get()`
- `ModelSignerTrustStore.list()`
- `trust()` / retrust
- `revoke()`
- `rotate()`
- signed provenance verification
- release-candidate provenance revalidation
- final promotion provenance revalidation
- promoted-model activation provenance revalidation

A corrupt signer audit must not be treated as a trusted signer state merely because the signer record itself still says `TRUSTED`.

## Backward compatibility

TP-0.54 audit records are intentionally not rejected solely because they lack hash-chain fields.

Rules:

- legacy-only history => `LEGACY_UNCHAINED`;
- a new TP-0.55 event may anchor the hash of the last legacy event;
- after the anchor exists, modifying the anchored legacy event breaks verification;
- no automatic trust, promotion, activation or key replacement occurs during migration.

This avoids destructive migration while allowing old audit history to become protected by subsequent chained events.

## Signer-state reconciliation

Hashing the event log alone is insufficient if an attacker or storage fault modifies the signer record directly.

The verifier therefore compares the latest audited `resultingStatus` for each signer with the persisted signer state. A mismatch is `CORRUPT` and signer reads fail closed.

## Settings diagnostics

Settings includes a `Signer Trust Audit Integrity` diagnostic panel that shows:

- `VALID`
- `LEGACY_UNCHAINED`
- `EMPTY`
- `CORRUPT`

The panel exposes bounded diagnostic detail for operators without exposing private signing material.

## Regression coverage

`src/tests/modelSignerTrustAuditChainTests.ts` covers:

- normal chained TRUST / RETRUST / REVOKE history;
- deterministic event hash verification;
- payload tampering detection;
- audit-index reordering detection;
- missing/broken-chain detection;
- direct signer-state tampering detection;
- fail-closed trust reads after corruption;
- rejection of further trust mutations while corrupt;
- legacy TP-0.54 audit compatibility;
- anchoring a legacy audit tail with a TP-0.55 chained event;
- tamper detection of a legacy event after that anchor exists.

The suite is registered in `src/tests/runAllTests.ts` so the MIO Validation Gate exercises it with the existing model-lifecycle and security regressions.

## Security boundary

TP-0.55 does not:

- store or import private signing keys;
- remotely fetch trust roots;
- automatically trust a signer;
- automatically rotate keys;
- train a model;
- benchmark a model;
- promote a model;
- activate a model;
- deploy or publish a model;
- claim external tamper-proof storage.

The hash chain provides tamper evidence inside Mio's governed storage boundary. External transparency logs, hardware-backed trust anchors, or remote attestation would be separate future checkpoints.

## Merge gate

TP-0.55 may be merged only after:

1. branch is 0-behind `main`;
2. MIO Validation Gate succeeds, including lint, web build, Electron build and system/security tests;
3. Cloudflare Web Build succeeds;
4. MIO Training Runner Contract succeeds;
5. pull request is mergeable;
6. final race check confirms `main` has not advanced beyond the validated base.

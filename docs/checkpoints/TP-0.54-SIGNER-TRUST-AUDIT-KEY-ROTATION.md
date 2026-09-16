# TP-0.54 — Signer Trust Audit & Key Rotation

## Status

Governed trust-management checkpoint layered on TP-0.53 Signed Model Artifact Provenance.

## Objective

Make signer trust changes auditable and key rotation explicit without placing private signing keys inside Mio.

TP-0.53 already separates cryptographic signature validity from current signer trust. TP-0.54 hardens the trust-management plane itself so operator trust/re-trust/revoke decisions have durable audit evidence.

## Audit model

`ModelSignerTrustStore` now records an append-only trust event for every successful mutation:

- `TRUST`
- `RETRUST`
- `REVOKE`

Each event records:

- monotonic sequence number
- deterministic event ID
- signer key ID
- signer label
- actor identity
- optional reason/change reference
- optional rotation ID
- previous trust status
- resulting trust status
- occurrence timestamp

Audit events intentionally do not contain private keys or raw public-key material.

## Fail-closed mutation path

Before mutating signer state, Mio verifies that audit capacity is available.

The audit log is bounded to 10,000 events. If that capacity is exhausted, trust mutations are rejected before changing signer state.

A trust mutation persists signer state, signer index, audit event, and audit index as one governed operation. If persistence fails, Mio attempts to restore the previous signer state and indexes. If rollback cannot be confirmed, the operation reports that manual trust-store inspection is required instead of claiming success.

This is deliberately stricter than silently accepting an unaudited trust change.

## Explicit actor identity

The Settings provenance panel requires an operator/actor identity for user-facing trust mutations.

Optional reason text can carry a ticket, change reference, incident, approval, or rotation reason.

Programmatic callers remain backward-compatible through the bounded default actor value, while all mutation paths still generate audit events.

## Re-trust behavior

Re-trusting an existing P-256 public key preserves its deterministic key ID and creates a new `RETRUST` event.

Prior audit events are not overwritten.

Existing signed provenance evidence is also not rewritten. Lifecycle gates continue to evaluate the signer's current trust state independently from historical signature validity.

## Key rotation

`ModelSignerTrustStore.rotate()` provides an explicit rotation workflow:

1. current signer must exist and be `TRUSTED`
2. replacement P-256 public key is validated
3. replacement key must have a different deterministic key ID
4. a bounded rotation ID is derived
5. replacement signer is trusted with that rotation ID
6. previous signer is revoked with the same rotation ID

The two audit events therefore form a linked rotation pair.

If revocation of the old key fails after a newly introduced replacement is trusted, Mio attempts to revoke the replacement as a safe rollback. A pre-existing already-trusted replacement is not revoked by that rollback path.

## Lifecycle consequences

Key rotation does not rewrite previously signed artifact provenance.

When the old signer is revoked:

- historical signed evidence remains available
- signature validity remains historically meaningful
- current trust gates fail for evidence signed by the retired key
- release review, final promotion, or activation remains blocked where TP-0.53 requires current signer trust

A candidate requiring the replacement signer must be signed and verified through the existing TP-0.53 provenance workflow.

No lifecycle state is advanced automatically by trust, revoke, re-trust, or rotation operations.

## Settings UI

The Signed Model Artifact Provenance panel now includes:

- required trust-mutation actor identity
- optional reason/change reference
- audited trust public-key action
- audited revoke action
- explicit signer key rotation controls
- current TRUSTED/REVOKED signer states
- recent signer trust audit history
- rotation IDs in audit rows

The existing candidate provenance workflow remains in the same panel.

## Regression coverage

`modelSignerTrustAuditTests.ts` verifies:

- initial trust creates an audit event
- actor and reason are captured
- revoke appends rather than replaces history
- re-trust preserves deterministic key ID
- sequence numbers remain monotonic
- rotation trusts replacement and revokes previous signer
- linked rotation events share one rotation ID
- audit events contain no key material
- per-key history filtering
- same-key rotation rejection
- blank actor rejection before mutation
- injected audit-index persistence failure is surfaced
- failed audit persistence rolls back signer state and indexes

Existing TP-0.53 regressions continue to validate that revoked signer state blocks the relevant model lifecycle gates.

## Security boundary

TP-0.54 does not:

- store private signing keys
- export private keys
- automatically trust signed envelopes
- automatically rotate keys
- alter model weights
- train or benchmark models
- promote or activate models
- upload trust material
- use network access for trust management

The trust log is governance metadata, not a substitute for the signed artifact provenance, adapter byte-integrity, benchmark, review, promotion, or activation gates.

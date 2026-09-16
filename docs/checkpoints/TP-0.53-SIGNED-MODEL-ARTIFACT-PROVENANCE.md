# TP-0.53 — Signed Model Artifact Provenance

## Status

Implementation checkpoint for trusted, signed provenance across the governed MIO Local model lifecycle.

TP-0.53 builds on:

- TP-0.46 governed training bundles
- TP-0.47 candidate/MioBench identity binding
- TP-0.48 explicit release-candidate review
- TP-0.50 desktop adapter byte-integrity evidence
- TP-0.51 explicit final model promotion
- TP-0.52 post-promotion integrity activation gate

## Objective

Add cryptographic provenance without confusing signature validity with trust.

A valid signature only proves that the holder of the corresponding private key signed an exact payload. MIO separately requires that the public signing key is explicitly present in the local trust store with status `TRUSTED`.

MIO never accepts, stores, uploads, or transmits the private signing key.

## Cryptographic contract

Signed provenance uses:

- ECDSA
- NIST P-256
- SHA-256
- SPKI public keys
- deterministic key ID `p256:<SHA-256(SPKI DER)>`
- 64-byte IEEE-P1363 signatures
- deterministic canonical JSON payloads

The offline signing utility is:

```text
scripts/training/sign-model-artifact-provenance.mjs
```

Its self-test is part of the `MIO Training Runner Contract` workflow.

## Trust store

`ModelSignerTrustStore` stores public verification keys only.

Signer states:

- `TRUSTED`
- `REVOKED`

Revocation preserves audit history. Re-trusting the same public key restores the same deterministic key ID; it does not rewrite previously verified evidence and never advances model lifecycle automatically.

A signed envelope cannot add its own key to the trust store.

## Signed payload binding

`MIO_MODEL_ARTIFACT_PROVENANCE_V1` binds the signature to the exact governed model candidate and adapter identity:

- candidate ID
- manifest ID
- governed training bundle ID
- training-result SHA-256
- dataset SHA-256
- training-config SHA-256
- runtime model
- base model
- training method
- adapter artifact URI
- adapter tree SHA-256 fingerprint
- adapter canonicalization contract
- file count
- total bytes
- issuer
- issuance timestamp

The artifact fingerprint originates from the TP-0.50 governed desktop adapter hashing path. Signed provenance therefore supplements byte-integrity evidence; it does not replace it.

## Verification evidence

Successful verification persists bounded evidence containing:

- candidate/manifest/runtime identity
- artifact URI and fingerprint
- signer key ID and label
- signer trust timestamp
- issuer and issuance time
- payload SHA-256
- envelope SHA-256
- verification timestamp

No private key or model file contents are persisted in this evidence.

## Release-candidate gate

If no signed provenance has ever been attached, the existing lifecycle remains backward-compatible.

Once signed provenance evidence exists, release review revalidates:

- current candidate/manifest binding
- runtime identity
- artifact URI
- training-result SHA-256
- current adapter fingerprint
- evidence SHA-256 contract
- current signer trust

A revoked signer or mismatched evidence blocks `EXPERIMENTAL -> RELEASE_CANDIDATE`.

## Final promotion gate

The TP-0.51 final promotion path independently revalidates signed provenance. A reviewer cannot use a prior RC approval to bypass a signer that was revoked later.

When promotion succeeds, structured promotion provenance records:

- promoter
- promotion timestamp
- benchmark report ID
- adapter integrity evidence ID
- signed provenance evidence ID, when signed provenance exists

This makes the exact signed evidence used at promotion explicit and auditable.

## Post-promotion activation gate

TP-0.52 already requires a fresh post-promotion adapter integrity `MATCH` before runtime activation.

TP-0.53 extends that activation decision. If signed provenance was bound at promotion, activation also requires:

- the bound signed provenance evidence still exists
- the latest signed evidence ID equals the evidence ID bound at promotion
- candidate/manifest/runtime/artifact/training-result identity still matches
- signed artifact fingerprint equals the fresh post-promotion adapter fingerprint
- payload/envelope hashes remain well formed
- signer key remains `TRUSTED`

These checks execute before local runtime readiness and before ModelRouter mutation.

Therefore a signer revoked after promotion blocks runtime activation without contacting the model runtime or changing the selected provider/model.

## Backward compatibility

Signed provenance is optional only when it is entirely absent.

Existing TP-0.52 adapter candidates without signed provenance continue to use the existing post-promotion integrity gate.

Once provenance exists, it cannot be silently ignored at later lifecycle gates. If evidence changes after promotion, the promotion-bound evidence ID mismatch fails closed.

## User interface

Settings now exposes a dedicated signed provenance panel between Native Model Candidate Lab and release review.

Operators can:

- explicitly trust a public P-256 signing key
- revoke a signer
- prepare the exact candidate signing payload
- import a signed envelope
- verify and bind the envelope
- inspect signer/evidence status

The release-review, final-promotion, and promoted-model lifecycle panels surface provenance state relevant to their respective gates.

## Regression coverage

TP-0.53 adds coverage for:

- valid P-256 signing and verification
- deterministic signer identity
- tampered payload/signature rejection
- candidate/artifact mismatch rejection
- unknown/untrusted signer rejection
- signer revocation and explicit re-trust
- release-review blocking after revocation
- final-promotion blocking after revocation
- exact provenance evidence ID persisted into promotion provenance
- signer revocation after promotion blocking activation
- activation trust check occurring before runtime readiness or ModelRouter mutation
- successful activation after explicit re-trust plus fresh post-promotion integrity MATCH
- unchanged TP-0.52 activation behavior when signed provenance is absent

## Security boundary

TP-0.53 does not:

- train a model
- generate or store private signing keys inside MIO
- infer trust from a signature
- fetch trust material from the network
- upload or publish model artifacts
- automatically advance lifecycle
- automatically promote a model
- automatically activate a runtime
- bypass MioBench, integrity, governance, security, or explicit human-review gates

The resulting lifecycle remains explicitly separated:

```text
TRAIN -> BENCHMARK -> BYTE INTEGRITY -> SIGNED PROVENANCE
      -> RELEASE REVIEW -> FINAL PROMOTION
      -> POST-PROMOTION INTEGRITY + SIGNER TRUST
      -> EXPLICIT ACTIVATION
```

# TP-0.51 — Signed Model Artifact Provenance

## Status

Implementation checkpoint. TP-0.51 adds explicit public-key trust and cryptographically signed provenance for model-adapter candidates already registered and fingerprinted by the governed MIO training pipeline.

It does **not** train, promote, activate, upload, publish, deploy, or automatically trust a model.

## Why this checkpoint exists

TP-0.50 proves that Mio observed a specific byte fingerprint in a user-authorized local adapter directory at scan time. A byte fingerprint alone does not identify who claims responsibility for that artifact.

TP-0.51 adds a separate provenance layer:

- local byte identity remains TP-0.50 evidence;
- a signed provenance payload states which candidate/training/artifact identity was signed;
- a cryptographic signature proves possession of the corresponding private key;
- a Mio trust-store entry determines whether that public key is currently trusted.

Signature validity and trust are intentionally separate concepts.

## Cryptographic contract

TP-0.51 uses:

- ECDSA
- NIST P-256 / prime256v1 / secp256r1
- SHA-256
- SubjectPublicKeyInfo (SPKI) public keys
- 64-byte IEEE-P1363 ECDSA signatures
- stable JSON canonicalization using Mio's existing `stableJsonStringify`

Key identity is derived from the public key bytes:

`p256:<SHA-256(SPKI DER)>`

No embedded public key inside a signed envelope is automatically trusted.

## Public-key trust store

`ModelSignerTrustStore` stores public keys only.

A user must explicitly import a P-256 SPKI public key and assign it a human-readable label. Mio validates that the key is a real P-256 verification key before creating a `TRUSTED` record.

Trust state:

- `TRUSTED`
- `REVOKED`

Revocation does not delete historical provenance evidence. It changes whether that evidence is currently acceptable for release review.

Private signing keys are never required or accepted by Mio.

## Signed provenance payload

`MIO_MODEL_ARTIFACT_PROVENANCE_V1` binds the signature to:

- candidate id
- manifest id
- governed training bundle id
- training-result SHA-256
- dataset SHA-256
- training config SHA-256
- runtime model alias
- base model
- LoRA/QLoRA method
- candidate artifact URI
- current TP-0.50 adapter fingerprint
- `mio-adapter-tree-v1` canonicalization
- adapter file count
- adapter total bytes
- issuer label
- issuance timestamp

The signing payload can only be prepared when current TP-0.50 integrity evidence exists and does not report `DRIFT`.

## Offline signing boundary

Private keys remain outside Mio.

The repository provides:

`scripts/training/sign-model-artifact-provenance.mjs`

Example:

```bash
node scripts/training/sign-model-artifact-provenance.mjs \
  --payload mio-provenance-payload.json \
  --private-key signer-private.pem \
  --output mio-artifact-provenance.json \
  --public-key-output signer-public.pem
```

The utility:

- uses Node built-in cryptography only;
- requires an EC P-256 private key;
- derives the corresponding SPKI public key and key id;
- signs the canonical payload with ECDSA P-256 / SHA-256;
- writes a bounded JSON envelope;
- uses exclusive file creation to avoid silently overwriting outputs;
- never uploads anything;
- has a `--self-test` mode that generates only an ephemeral key pair and verifies tamper detection.

Only the public key should be imported into Mio.

## Verification and binding

`TrainingCandidateProvenanceService.verifyAndBind()` requires:

1. a registered candidate;
2. its model manifest;
3. current TP-0.50 integrity evidence;
4. no current adapter `DRIFT`;
5. an already `TRUSTED` signer key;
6. exact key-id consistency;
7. exact candidate/training/artifact field binding;
8. artifact fingerprint equality with the current TP-0.50 evidence;
9. a valid P-256/SHA-256 signature.

On success Mio stores verification evidence containing:

- candidate/manifest/runtime/artifact binding;
- exact training-result SHA-256;
- exact artifact fingerprint;
- signer key id and label;
- signer trust timestamp;
- issuer and issuance timestamp;
- verification timestamp;
- canonical payload SHA-256;
- canonical envelope SHA-256;
- signature algorithm.

The private key and signed payload contents are not converted into model permissions.

## Release-review integration

Signed provenance remains backward-compatible and advisory when entirely absent.

Once signed-provenance evidence exists, TP-0.48 release review cannot silently ignore it. Review is blocked when:

- the evidence no longer binds to the current candidate/manifest;
- runtime model identity changed;
- artifact URI changed;
- training-result SHA changed;
- current TP-0.50 integrity evidence is unavailable;
- the signed artifact fingerprint differs from current integrity evidence;
- the signer is missing or `REVOKED`;
- signer key identity is inconsistent;
- stored provenance verification hashes are malformed.

An explicit re-trust of the same public key restores the same deterministic key id. Historical evidence is not rewritten.

## UI

Settings now includes a **SIGNED MODEL ARTIFACT PROVENANCE** workflow immediately before release review.

The panel provides:

- trusted signer public-key import;
- signer TRUSTED/REVOKED status;
- explicit signer revocation;
- per-candidate provenance issuer input;
- `PREPARE SIGNING PAYLOAD` download;
- `VERIFY SIGNED PROVENANCE` import;
- current integrity state;
- verified signer/issuer/fingerprint summary;
- clear warning that private keys must remain outside Mio.

The release-review panel also displays integrity/provenance trust badges and revalidates those signals before lifecycle transition.

## CI and regression contract

`MIO Training Runner Contract` now also runs:

```bash
node --check scripts/training/sign-model-artifact-provenance.mjs
node scripts/training/sign-model-artifact-provenance.mjs --self-test
```

`src/tests/signedModelArtifactProvenanceTests.ts` covers:

- P-256 key generation and public-key trust import;
- deterministic key identity;
- exact candidate/training/artifact signing payload binding;
- valid trusted signature verification;
- persisted verification hashes;
- payload tamper rejection;
- valid signature with wrong artifact fingerprint rejection;
- cryptographically valid but untrusted signer rejection;
- signer revocation blocking release review;
- explicit re-trust restoring review eligibility;
- no lifecycle advancement;
- no active-model change.

## Boundaries that remain

TP-0.51 is not a hardware-backed key-management system and does not provide a transparency log, timestamping authority, certificate PKI, Sigstore integration, or remote trust federation.

A future policy checkpoint may decide where signed provenance is mandatory, for example:

- OPTIONAL
- REQUIRED_FOR_RELEASE_CANDIDATE
- REQUIRED_FOR_PROMOTION

That policy should remain separate from signature verification itself.

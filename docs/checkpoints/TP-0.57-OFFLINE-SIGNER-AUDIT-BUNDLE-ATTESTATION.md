# TP-0.57 — Offline Signer Audit Bundle Attestation

Status: implementation candidate pending PR/CI validation

## Goal

Add an external authenticity layer to the TP-0.56 portable signer-trust audit bundle without moving private attestation keys into Mio.

TP-0.56 proves internal consistency of a known bundle. TP-0.57 allows a separately governed audit authority to sign that exact bundle offline and allows independent verification with an authority public key supplied through a separate trust channel.

## Attestation format

`MIO_SIGNER_AUDIT_ATTESTATION_V1`

The signed payload binds:

- bundle format kind;
- `bundleSha256`;
- bundle `exportedAt` timestamp;
- latest signer-audit event hash when present;
- authority label;
- deterministic authority key ID;
- attestation issue timestamp.

The envelope uses:

- ECDSA P-256 / prime256v1;
- SHA-256;
- 64-byte IEEE-P1363 signature encoding.

Authority key identity is:

`p256:<SHA-256(SPKI DER)>`

## Private-key boundary

The private attestation key is never imported into the Mio application.

Signing is performed by an offline Node utility against an already exported TP-0.56 bundle.

The Mio repository contains only the signing/verifying utility code. It does not contain user private keys.

## Signing workflow

```bash
node scripts/training/attest-signer-audit-bundle.mjs sign \
  --bundle mio-signer-audit-verification.json \
  --private-key audit-authority-private.pem \
  --authority "MIO Audit Authority" \
  --output mio-signer-audit-attestation.json
```

Optional deterministic issue timestamp:

```bash
--issued-at <milliseconds-since-epoch>
```

The generated attestation is a detached JSON envelope. The original portable bundle remains unchanged.

## Verification workflow

```bash
node scripts/training/attest-signer-audit-bundle.mjs verify \
  --bundle mio-signer-audit-verification.json \
  --attestation mio-signer-audit-attestation.json \
  --public-key audit-authority-public.pem
```

The verifier checks:

1. TP-0.56 bundle digest is internally consistent;
2. attestation schema and format kind;
3. attested bundle kind;
4. attested bundle SHA-256;
5. attested export timestamp;
6. attested latest audit event hash;
7. authority label bounds;
8. authority deterministic key ID;
9. supplied authority public key is P-256;
10. authority key ID matches the supplied public key;
11. issue timestamp validity;
12. 64-byte IEEE-P1363 P-256 signature;
13. cryptographic signature verification.

Verification exits non-zero on failure.

## Self-test and CI

Self-test:

```bash
node scripts/training/attest-signer-audit-bundle.mjs --self-test
```

The self-test generates an ephemeral P-256 keypair in process memory and verifies:

- valid bundle attestation succeeds;
- bundle tampering fails;
- verification with a different authority public key fails.

No self-test key is persisted.

The MIO Training Runner Contract runs syntax validation and the self-test for every pull request and main push.

## Trust model

An attestation is only meaningful when the verifier obtains the expected authority public key through a trusted independent channel.

TP-0.57 intentionally does not auto-trust a key embedded in an attestation. The public key is supplied separately at verification time.

This prevents a forged package from declaring its own attacker-controlled key as trusted merely because the signature mathematically verifies against that key.

## Relationship to model-signing keys

Audit bundle attestation keys are a separate trust domain from model artifact signing keys.

The TP-0.53 model signer trust store is not reused for bundle attestation. This avoids accidentally granting a model-signing key authority over audit attestations or vice versa.

## What TP-0.57 proves

When verification succeeds against a separately trusted authority public key, the verifier can conclude that the matching private-key holder signed the exact TP-0.56 bundle fingerprint and bound metadata represented by the attestation payload.

It does not prove:

- that the authority's private key was never compromised;
- that the bundle was exported at a truthful wall-clock time;
- that a transparency log witnessed the attestation;
- that a hardware security module produced the signature;
- that the model itself is safe or correct.

Those would require additional governance or future checkpoints.

## Security boundary

TP-0.57 does not:

- store authority private keys in Mio;
- upload private keys;
- transmit bundle content to a remote service;
- auto-trust authority keys;
- import trust state into Mio;
- modify model signer trust;
- train, benchmark, promote or activate a model;
- deploy or publish a model.

The utility operates on local files only.

## Merge gate

TP-0.57 may be merged only after:

1. branch is 0-behind `main`;
2. MIO Validation Gate succeeds;
3. Cloudflare Web Build succeeds;
4. MIO Training Runner Contract succeeds, including attestation self-test;
5. pull request is mergeable;
6. final race check confirms the validated base has not moved.

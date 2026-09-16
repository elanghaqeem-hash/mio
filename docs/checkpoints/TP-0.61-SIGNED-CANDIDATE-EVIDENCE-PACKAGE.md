# TP-0.61 — Signed Candidate Evidence Package

## Status

Implementation checkpoint for authenticating TP-0.60 portable candidate evidence packages with external P-256 signatures while reusing MIO's existing signer trust store and audit chain.

TP-0.61 is a verification/authenticity layer only. It does not train, benchmark, review, promote, activate, upload, publish, or deploy a model.

## Problem closed

TP-0.60 creates a deterministic, privacy-minimized evidence package with an internal SHA-256. That digest detects content changes but does not identify who approved/signed the package once it leaves the local MIO boundary.

TP-0.61 adds a detached trust decision around that package without introducing a second trust store and without ever importing private signing keys into Mio.

## Trust architecture

The trust path is:

```text
external P-256 private key
        |
        | signs canonical TP-0.61 payload
        v
signed candidate evidence envelope
        |
        | imported for verification only
        v
TP-0.60 package verification
        +
P-256 signature verification
        +
existing ModelSignerTrustStore
        +
existing signer trust audit chain
        |
        v
TRUSTED SIGNATURE VERIFIED
```

Private keys remain outside Mio. The application uses only the public P-256 SPKI already governed by the existing signer trust system.

## Signature payload

Kind:

```text
MIO_CANDIDATE_EVIDENCE_SIGNATURE_V1
```

Payload fields:

```text
schemaVersion
kind
packageSha256
candidateId
manifestId
lifecycle
exportedAt
issuer
signedAt
```

The payload is canonicalized with `stable-json-v1` semantics and signed using:

```text
ECDSA P-256 + SHA-256
IEEE-P1363 64-byte signature encoding
```

The key identity is:

```text
p256:<sha256-of-SPKI-DER>
```

This is the same key identity/signature convention already used by signed model artifact provenance.

## Envelope

Kind:

```text
MIO_SIGNED_CANDIDATE_EVIDENCE_PACKAGE_V1
```

Envelope:

```text
schemaVersion
kind
package          # complete TP-0.60 package
payload          # bounded signature payload
signature
  algorithm      # ECDSA_P256_SHA256
  keyId
  valueBase64
```

The signature binds the digest and the critical candidate/lifecycle snapshot rather than signing an alternate evidence representation.

## Application verification

`SignedCandidateEvidencePackageService.verify(...)` performs:

1. bounded JSON parsing (20 MiB limit);
2. exact envelope/payload/signature schema-field checks;
3. full embedded TP-0.60 package verification;
4. exact payload↔package binding checks;
5. P-256 key-ID contract validation;
6. lookup in the existing `ModelSignerTrustStore`;
7. current signer status must be `TRUSTED`;
8. trusted SPKI re-hashed and matched to the envelope key ID;
9. WebCrypto ECDSA/SHA-256 signature verification;
10. payload/envelope SHA-256 evidence computation.

A revoked signer therefore causes current verification to fail without rewriting historical evidence.

## External signing utility

```bash
node scripts/training/sign-candidate-evidence-package.mjs \
  --package candidate-evidence.json \
  --private-key candidate-evidence-private.pem \
  --issuer "MIO Release Engineering" \
  --output signed-candidate-evidence.json \
  --public-key-output candidate-evidence-public.pem
```

The signer:

- accepts only EC P-256 private keys;
- verifies the package digest/basic identity before signing;
- derives the deterministic P-256 key ID from SPKI DER;
- produces a 64-byte IEEE-P1363 signature;
- refuses to overwrite output files;
- keeps signing entirely outside the application runtime.

The public key can then be explicitly trusted through the existing Mio signer-trust workflow.

## Independent offline verification

```bash
node scripts/training/verify-signed-candidate-evidence-package.mjs \
  --input signed-candidate-evidence.json \
  --public-key candidate-evidence-public.pem
```

This verifier proves cryptographic validity against the supplied public key. It intentionally reports that trust in that key must be established independently.

This differs from Mio application verification, which combines cryptographic validity with the current trusted-signer state and its audit-chain integrity.

## Settings UI

**Settings → Trusted Signed Candidate Evidence** is verify-only.

It:

- accepts a signed JSON envelope;
- never accepts a private key;
- verifies the embedded TP-0.60 package;
- verifies signature/key identity;
- shows signer label, key ID, trust state, payload SHA, and envelope SHA;
- fails closed if signer is missing/revoked or signature/package is inconsistent.

It does not persist imported envelope content as model authority and has no model lifecycle side effect.

## Regression coverage

`src/tests/signedCandidateEvidencePackageTests.ts` covers:

- trusted P-256 signature success;
- TP-0.60 privacy minimization inherited into signed envelope;
- embedded-package tampering;
- signed-payload tampering;
- wrong/non-trusted key identity;
- signer revocation;
- explicit re-trust of the same deterministic key;
- unknown envelope field rejection;
- no lifecycle advance;
- no active-promoted pointer creation.

The Training Runner Contract additionally self-tests both offline signer and offline verifier.

## Security boundaries

A valid TP-0.61 result does not prove:

- model quality;
- model safety;
- that local adapter/model bytes are still present or unchanged;
- that gate snapshots are still current after package export;
- promotion eligibility now;
- activation/deployment authorization.

It proves only that the exact signature payload was signed by the holder of the private key corresponding to a verified public key; in Mio, that public key must also be currently trusted.

## Private-key prohibition

Private keys must not be:

- imported into Mio;
- pasted into Settings;
- stored in browser/local storage;
- committed to Git;
- placed in project knowledge/files;
- embedded in candidate evidence packages;
- sent to cloud AI providers.

Only public trust material belongs in the MIO signer trust store.

## CI gates

TP-0.61 must pass:

- `MIO Validation Gate` — lint, web, Electron, full system/security regression;
- `Cloudflare Web Build`;
- `MIO Training Runner Contract` — signer/verifier syntax + self-tests and existing training utility contracts.

## Next direction

After TP-0.61, the governance chain from training bundle → handoff → adapter integrity → binding → portable audit package → trusted external signature is complete enough to pause audit hardening. The next high-value work should return to operational MIO Local capabilities such as governed local training job execution, GPU/VRAM-aware backend management, and model artifact installation/runtime handoff rather than adding another signature layer by default.

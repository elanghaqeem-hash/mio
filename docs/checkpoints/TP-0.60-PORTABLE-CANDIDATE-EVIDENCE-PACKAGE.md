# TP-0.60 — Portable Candidate Evidence Package

## Status

Implementation checkpoint for a portable, privacy-minimized audit snapshot of the governed MIO Local training-candidate lifecycle.

TP-0.60 does **not** train, benchmark, sign, review, promote, activate, upload, or deploy a model. It serializes already-recorded governance evidence into a deterministic package that can be independently checked for internal consistency.

## Problem closed

Before TP-0.60, relevant evidence existed in separate repositories/services:

- TP-0.58 training handoff receipt;
- benchmark repository;
- TP-0.50 adapter-integrity history;
- TP-0.59 handoff↔adapter binding;
- signed artifact provenance;
- signer trust state;
- release-candidate review state;
- structured promotion provenance.

An operator could inspect these inside Mio, but there was no single bounded artifact suitable for audit handoff, archival review, or offline consistency verification.

## Package contract

Kind:

```text
MIO_CANDIDATE_EVIDENCE_PACKAGE_V1
```

Core sections:

```text
schemaVersion
kind
exportedAt
candidate
manifest
evidence
  handoffReceipt?
  latestBenchmark?
  latestIntegrity?
  latestArtifactBinding?
  latestProvenance?
  signerSummaries[]
  promotion
    benchmark?
    integrity?
    artifactBinding?
    provenance?
gates
  releaseCandidateEligible
  releaseBlockingReasons[]
  promotionEligible
  promotionBlockingReasons[]
disclosure
packageSha256
```

`packageSha256` is SHA-256 over stable-json-v1 canonical serialization of the package body excluding only `packageSha256` itself.

## Benchmark privacy minimization

A stored MioBench report can contain raw model output. TP-0.60 does not copy that output into the portable package.

Instead it exports:

- report ID + manifest ID;
- recorded/generated timestamps;
- provider + runtime model;
- score / maxScore / passRate;
- per-case ID, domain, score, maxScore, pass/fail, latency;
- `sourceReportSha256` computed over the complete stored benchmark report.

This preserves reconciliation evidence without exporting raw model-generated text.

## Explicit exclusions

TP-0.60 is intentionally metadata-only. The portable package must not contain:

- training JSONL;
- training message content;
- raw benchmark model output;
- model weights;
- adapter bytes;
- private keys;
- credentials/secrets/tokens;
- authorization or permission grants;
- tool secrets.

The application verifier recursively rejects known sensitive field names. It also rejects unknown top-level/evidence/promotion/gate schema fields so extra payloads cannot be appended outside the canonical contract.

## Adversarial digest rule

Digest verification alone is insufficient because an attacker can modify content and compute a new digest.

TP-0.60 therefore validates both:

1. deterministic package SHA-256; and
2. semantic identity bindings between candidate, manifest, handoff, benchmark, integrity, artifact binding, signed provenance, signer summary, and promotion references.

Regression coverage includes identity rebinding and sensitive-field injection **after recomputing a valid package digest**.

## Export behavior

`TrainingCandidateEvidencePackageService.export(candidateId)`:

1. loads candidate + manifest;
2. takes current release-review and promotion snapshots;
3. gathers latest bounded evidence;
4. resolves evidence specifically referenced by structured promotion provenance;
5. reduces benchmark reports to privacy-minimized summaries;
6. captures only signer identity/status metadata required by included signed provenance;
7. calculates deterministic package SHA-256;
8. self-verifies before returning the package.

Export is allowed for blocked or EXPERIMENTAL candidates. The package records blockers; it does not require or imply eligibility.

## Settings UI

**Settings → Portable Candidate Evidence Package** provides:

- candidate selection;
- explicit `EXPORT EVIDENCE` action;
- local JSON download;
- verification of an existing portable package file;
- package SHA/candidate/lifecycle display;
- explicit disclosure that verification is an audit-consistency result only.

No import from this panel mutates candidate or model state.

## Offline verifier

```bash
node scripts/training/verify-candidate-evidence-package.mjs \
  --input /path/to/mio-candidate-evidence.json
```

Self-test:

```bash
node scripts/training/verify-candidate-evidence-package.mjs --self-test
```

The verifier uses Node standard-library functionality only. It performs no model loading, Python/ML execution, network access, promotion, activation, or deployment.

## Fail-closed cases

Verification rejects, among other conditions:

- invalid JSON / oversized input;
- unsupported schema/kind;
- malformed or mismatched package SHA-256;
- unknown schema fields;
- sensitive portable field names;
- candidate↔manifest mismatch;
- handoff receipt mismatch;
- benchmark runtime/manifest mismatch;
- malformed benchmark source-report fingerprint;
- integrity/binding/provenance identity mismatch;
- missing signer summary for packaged provenance;
- missing exact evidence referenced by promotion provenance.

## Security and lifecycle boundaries

A valid package does **not** prove:

- model quality or factual correctness;
- model safety;
- current adapter bytes still exist or remain unchanged;
- external signer authenticity beyond the packaged evidence/status snapshot;
- promotion eligibility beyond the point-in-time packaged gate snapshot;
- activation authorization;
- deployment/publication authorization.

Export and verification never mutate lifecycle state or the active-promoted pointer.

## CI coverage

TP-0.60 adds:

- TypeScript regression tests in `trainingCandidateEvidencePackageTests.ts`;
- offline verifier syntax + self-test to `MIO Training Runner Contract`;
- normal web/Electron/system-security coverage through `MIO Validation Gate`;
- Cloudflare web build coverage for the Settings export/verify UI.

## Next logical work

After TP-0.60, a useful next checkpoint is a separately signed/attested candidate evidence package for exchange outside the local trust boundary. That should remain distinct from this package's internal-consistency digest and should reuse the existing trusted-signer/audit-chain architecture rather than introducing a second trust model.

# TP-0.50 — Governed Desktop Adapter Integrity

## Status

Implementation checkpoint. This change adds bounded, user-authorized byte-level SHA-256 fingerprint evidence for local model-adapter directories used by Native Model Candidate Lab.

It does **not** train, benchmark, promote, activate, publish, upload, delete, or modify model files.

## Problem

TP-0.49 can verify the governed training bundle/result identity and can verify that a loopback inference backend reports the expected runtime-model alias. Those checks do not prove that the current adapter bytes on disk are the same bytes a reviewer previously inspected.

TP-0.50 closes that gap without adding generic filesystem authority.

## Security model

The user explicitly selects a directory through the native Electron directory picker. Renderer code receives only an opaque workspace id plus the directory display name; the absolute root path remains inside Electron main process memory.

The new capability is:

`service.desktop.workspace.hash-tree`

Properties:

- SERVICE capability
- desktop-only / fail-closed on web
- SETTINGS mode only
- HIGH risk
- L4_EXECUTE permission
- no network access
- scope-bound to `workspaceId + relativePath`
- 120-second capability timeout
- generic `service.filesystem` remains unavailable

The renderer-side Candidate Lab uses `SecureServiceGateway` before invoking the trusted preload IPC bridge.

## Hashing contract

The Electron `WorkspaceSandbox.hashTree()` operation:

- accepts only an already-authorized opaque workspace id plus a relative path;
- rejects absolute paths and parent traversal;
- canonicalizes the selected target inside the authorized workspace root;
- rejects symbolic links rather than following them;
- rejects non-regular filesystem entries;
- hashes files incrementally with SHA-256 using 1 MiB stream chunks;
- fails if a file changes size or modification timestamp during hashing;
- sorts relative file paths deterministically;
- computes a tree fingerprint from canonical tuples of relative path, byte length, and per-file SHA-256;
- never returns file contents;
- never returns absolute paths to the renderer.

Default scan bounds:

- maximum files: 5,000
- maximum total hashed bytes: 4 GiB
- maximum traversal depth: 24
- bounded visited-entry guard in addition to the file-count limit

Canonicalization identifier:

`mio-adapter-tree-v1`

## Minimal renderer output

Although Electron main internally needs relative file names and per-file hashes to calculate the deterministic tree fingerprint, IPC intentionally returns only:

- schema version
- SHA-256 algorithm
- canonicalization id
- root relative path
- aggregate fingerprint
- file count
- total bytes
- scan limits

The per-file manifest is not copied into renderer state or candidate evidence.

## Candidate evidence binding

`TrainingCandidateIntegrityService` binds each completed scan to:

- candidate id
- model manifest id
- runtime model alias
- candidate artifact URI
- exact `trainingResultSha256`
- aggregate adapter fingerprint
- file count / total bytes
- scan timestamp
- immutable baseline fingerprint

The first completed scan creates `BASELINE_CAPTURED`.

All subsequent scans compare against that first baseline:

- identical bytes -> `MATCH`
- different bytes -> `DRIFT`

A persistent drift cannot become a false match simply because the drifted directory was scanned twice. Only returning to the original baseline bytes produces `MATCH` again.

The baseline fingerprint is carried forward on every evidence record, so the service can compare against the immutable baseline without re-reading hundreds of historical records.

## One-shot workspace authority

Each scan uses temporary directory authority from the native picker. The service revokes that workspace authority **before** successful integrity evidence is persisted.

- successful revoke -> evidence may be persisted;
- failed revoke -> the scan fails closed and no new success evidence is stored;
- failed hashing/validation -> revocation is still attempted in `finally`;
- cancelled native picker -> no workspace authority and no evidence.

This prevents a successful-looking integrity record from being created while a supposedly one-shot filesystem authority is still known to be active.

## Lifecycle boundary

Adapter integrity evidence is observational evidence only.

It does not change:

- candidate benchmark status;
- manifest lifecycle;
- governance/security review flags;
- RELEASE_CANDIDATE status;
- PROMOTED status;
- active promoted-model pointer;
- ModelRouter configuration.

However, once integrity evidence exists, the explicit TP-0.48 release-review gate must respect it. The latest evidence blocks `EXPERIMENTAL -> RELEASE_CANDIDATE` when:

- it reports `DRIFT`;
- its candidate/manifest binding does not match;
- its runtime model identity does not match;
- its artifact URI does not match;
- its `trainingResultSha256` does not match;
- its fingerprint contract is malformed.

Absence of integrity evidence remains advisory for backward compatibility; integrity is not silently fabricated or inferred.

A fingerprint match also does not prove semantic quality, provenance authenticity, or safety. Those remain separate MioBench, governance, security, promotion, and runtime-readiness gates.

## Candidate Lab UI

Native Model Candidate Lab now provides `HASH ADAPTER DIR` for each registered candidate. The action:

1. opens the native folder picker;
2. creates temporary workspace authority;
3. requests the scoped L4 hashing capability;
4. hashes the selected directory within fixed bounds;
5. revokes workspace authority;
6. persists candidate-bound evidence only after successful revocation;
7. shows baseline/match/drift state plus aggregate fingerprint, file count, and byte count.

The UI does not display absolute filesystem paths or a per-file manifest.

## Regression coverage

`adapterIntegrityTests.ts` and `adapterIntegrityReviewGateTests.ts` cover:

- deterministic SHA-256 tree fingerprinting;
- byte-change detection;
- relative-only internal manifest paths;
- symbolic-link rejection;
- file-count bounds;
- aggregate-byte bounds;
- fail-closed default web capability;
- L4 / HIGH / no-network / SETTINGS desktop capability metadata;
- scope mismatch rejection before privileged execution;
- baseline capture;
- exact training-result SHA binding;
- immutable-baseline match/drift behavior;
- persistent drift staying DRIFT;
- restoration to original bytes becoming MATCH;
- workspace authority revocation;
- revocation failure producing no new evidence;
- cancelled picker creating no evidence;
- DRIFT blocking RELEASE_CANDIDATE eligibility and transition;
- no automatic lifecycle advancement;
- no model activation.

## Remaining boundary

TP-0.50 proves the bytes observed in a user-authorized local directory at scan time. It is not a signed software-supply-chain attestation. A later checkpoint may add signed adapter manifests / provenance signatures, but those must remain distinct from local byte hashing and from model quality evaluation.

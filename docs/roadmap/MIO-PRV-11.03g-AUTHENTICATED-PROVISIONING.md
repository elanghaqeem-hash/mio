# MIO PRV-11.03g — Authenticated Windows Provisioning (Diagnostic)

## Implementation
The existing read-only Windows journal provisioning inspector now has an **additional, optional trusted-key attestation verification layer**. A separate, externally authorized provisioner must furnish a secret key of at least 32 bytes and a versioned HMAC-SHA256 sidecar. It binds the journal name, initial empty-journal SHA-256 and complete manifest SHA-256 to a domain-separated scope. Verification uses constant-time MAC comparison and strict schemas. The verifier never creates a journal, sidecar or key, never repairs or unlocks anything, and never exposes the secret to renderer IPC.

Main suite and native Windows CI verify positive authentication, wrong/short key, manifest modification, MAC tampering, unknown fields, journal modification and path traversal.

## Non-activation and remaining requirements
Even an authenticated initial snapshot does **not** prove metadata directory publication, volume/controller flush, power-loss durability, current account ACLs, or live append authorization. The result ALWAYS states `metadataPublicationDurable: false` and `runtimeActivationPermitted: false`. The existing Windows creative runtime still rejects activation with `CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS`.

An external trust boundary and secure key distribution are still required. The test key is fixed test material only and must not be used in production. A reviewed native Windows provisioner, real NTFS metadata durability evidence and end-to-end crash/restart/power-loss validation remain mandatory. No production deployment.

# T-16 Privacy & Security Hardening

Status date: 2026-09-29
Status: IN PROGRESS

- T-16.01#A — COMPLETE: mutation journal restart integrity.
- T-16.02#A — COMPLETE: approval replay/tamper hardening tests.
- T-16.03#A — COMPLETE: secret handling boundary.
- T-16.04#A — COMPLETE: remote processing consent/policy.
- T-16.05#A — COMPLETE: privacy-safe provenance/logging.
- T-16.06#A — TESTING: security regression tests.
- T-16.07#A — PLANNED: acceptance and merge.

Security invariants: fail closed on corrupted audit chain; never persist provider secrets in application source/provenance; LOCAL_ONLY never permits remote processing; remote processing requires explicit policy authorization.

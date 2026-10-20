# LAR-16 — Windows packaging diagnostics (19 October 2026)

## Verified state
Commit `e383196905d8f8a57ec00d0343c8965de8699798` adds a 15-minute step timeout, `electron-builder` diagnostic logging, and unconditional release directory listing to the Windows acceptance workflow. This change is committed to PR #561.

During inspection, [Windows Installer Acceptance run 39227127908](https://github.com/elanghaqeem-hash/mio/actions/runs/39227127908) was in progress; there is no verified successful Windows package artifact or checksum for this commit. Previously observed packaging stages remained in progress in earlier runs. Do not treat running jobs as passed builds.

## Acceptance and diagnosis
- If the packaging step times out, capture the electron-builder trace, runner environment, and files generated in `release/`.
- The workflow requires two distinct EXE outputs and records SHA-256 hashes. Names are a heuristic; review the resulting executable signatures and packaging metadata manually.
- Review whether downloads/signing and NSIS / portable execution cause a long-running process.
- Do not publicly distribute unsigned/unverified CI artifacts as production software.
- After a valid Windows packaging result, run a real clean-device install / launch / uninstall and test the selected MIO gateway with installed local Ollama weights.
- Record STOP MIO cancellation on an active real inference request.

## Current release verdict
**NO-GO**: unverified installer artifacts and real-device inference; safe lockfile remediation patch remains a reviewed candidate, not applied to the PR branch.

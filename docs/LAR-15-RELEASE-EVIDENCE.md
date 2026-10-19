# LAR-15 — Release Candidate Evidence Gate

Date: 2026-10-19. Scope: MIO local inference feature PR #561, not the whole MIO platform.

## Verified status (head before this document: 0cb16088e77b48eaeba73d722deb4015f4a1cb3d)

- GitHub Actions succeeded: Mio CI, dependency security audit, local AI gateway check, Cloudflare web build, Windows durability probe, training runner contract and dependency remediation candidate.
- At inspection, Windows Installer Acceptance run 39226775551 remained `in_progress`; no EXE hash manifest was verified.
- Cross-platform crash matrix and validation gate also remained `in_progress`.
- The separate candidate lockfile remediation workflow passed, reducing full audit findings 14 → 8, with 0 high/critical, but the candidate has NOT been committed to `package-lock.json` on the PR branch.
- Real Ollama inference on target hardware, STOP MIO during active model generation, desktop startup and signed installers remain unverified.

## Release acceptance

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Gateway API and adapter contract | Passing tests on final commit | Passed on prior commit; rerun on final |
| Windows installer build | Completed Windows workflow, NSIS and portable executables, SHA-256 manifest | Not verified |
| Installation/user acceptance | Clean Windows install, launch, settings selection, chat, removal | Not verified |
| Offline inference without cloud API | Ollama loaded, actual text response and provenance | Not verified |
| STOP MIO cancellation | Active generation interrupted, no post-cancel result accepted | Not verified |
| Dependency vulnerability triage | Applied and checked-in safe patch, disposition of remaining findings | Not yet |
| Packaging provenance | Reviewed signed/unsigned status, checksums and artifact source | Not verified |
| All final-head CI | All required runs complete successfully | Not yet |

## Release decision

**NO-GO**. Do not merge PR #561 or claim desktop production readiness until the above evidence is recorded. CI mock tests and Windows compile probes are not substitutes for real deployment and device testing.

The Windows installer workflow now uploads generated evidence even if later steps fail, allowing diagnosis of partial packaging results.

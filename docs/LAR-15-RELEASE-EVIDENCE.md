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


## LAR-18 — Newly verified packaging evidence (2026-10-19)

Previously outstanding Windows Installer Acceptance runs have now **completed successfully**:
- [Run #8 / 39227214614](https://github.com/elanghaqeem-hash/mio/actions/runs/39227214614), commit `773886831d7f4189b5ae719a0c1022fce129d3b0`. Artifact `mio-windows-installer-validation` ID `12174521575` (234,672,258 bytes archive), expires 2026-10-26.
- [Run #6 / 39227013949](https://github.com/elanghaqeem-hash/mio/actions/runs/39227013949), commit `11b5ec7f82a743531d17ccd4e5ae28a5d076798c`. Artifact ID `12175435317` (234,672,188 bytes archive), expires 2026-10-26.

These workflows include Windows build, NSIS + portable packaging, an EXE count check, SHA-256 manifest generation and artifact upload. The artifact ZIP digest is recorded by GitHub; the individual EXE SHA-256 values have **not** been independently inspected in this review. The workflows succeeded on earlier commits, **not yet on the latest PR head**.

The Windows packaging compilation gate is now supported by CI evidence, but Windows installer user acceptance, installation/uninstallation, code signing, local hardware Ollama inference, desktop STOP MIO and checked-in dependency remediation remain unverified. **Release remains NO-GO.**

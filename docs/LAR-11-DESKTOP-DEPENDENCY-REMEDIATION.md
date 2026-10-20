# LAR-11 — Desktop dependency remediation assessment

## Evidence (19 October 2026)
Source: GitHub Actions MIO Dependency Security Audit, [run 39220981231](https://github.com/elanghaqeem-hash/mio/actions/runs/39220981231), artifact ID 12171278790; exact full npm audit JSON inspected. All eight workflows on LAR-10 commit 0459220e4ec24ebd5748b3d38ce1e4f737cc1b68 passed.

**Overall:** 14 advisories (2 critical, 3 high, 9 moderate). **Production dependency-only audit:** 0 reported vulnerabilities. Full build/dev tooling is not yet cleared for release.

| Vulnerable package | Severity | Direct? | Reported fix availability | Notes |
| --- | --- | --- | --- | --- |
| concurrently | critical | yes | true | Transitive shell-quote issue |
| shell-quote | critical | no | true | Command-injection advisory GHSA-pqg4-j6r4 |
| brace-expansion | high | no | true | CPU denial-of-service advisory GHSA-q2hr-2g5m |
| http-cache-semantics | high | no | true | Cache response issue GHSA-ch52-4w7c |
| source-map-js | high | no | true | Indexed sourcemap DoS advisory GHSA-68fv-2mgg |
| fast-uri | moderate | no | true | Host normalization advisory GHSA-hrr3-gc8f |
| electron-builder | moderate | yes | electron-builder 26.5.0, npm audit marks major change | Requires compatibility review |
| app-builder-lib | moderate | no | via electron-builder 26.5.0 | Packaging toolchain |
| dmg-builder | moderate | no | via electron-builder 26.5.0 | Packaging toolchain |
| electron-builder-squirrel-windows | moderate | no | via electron-builder 26.5.0 | Packaging toolchain |
| @electron/get | moderate | no | via electron-builder 26.5.0 | Packaging toolchain |
| global-agent | moderate | no | via electron-builder 26.5.0 | Packaging toolchain |
| roarr | moderate | no | via electron-builder 26.5.0 | Packaging toolchain |
| sprintf-js | moderate | no | via electron-builder 26.5.0 | DoS advisory GHSA-hp3w-g68c-fv3c |

These packages are affected nodes in the dependency graph. Severity and fix availability above come from the npm audit JSON; exploitability and reachability are NOT verified.

## Remediation sequence

1. Reproduce the full audit locally against the checked-in lockfile: `npm ci && npm audit --json > dependency-audit.json` (audit may return non-zero; inspect output).
2. Establish the exact parent chains with `npm explain concurrently`, `npm explain shell-quote`, `npm explain electron-builder`, `npm explain source-map-js`.
3. Address the critical `concurrently` / `shell-quote` chain first by selecting a compatible patch/minor dependency update and updating lockfile in a separate PR. Never replace production code with unvetted overrides.
4. Address three high findings individually and repeat npm audit. Assess packaging/CI exposure even though production-only audit is clean.
5. Test the electron-builder update in isolation: Windows NSIS/portable builds, install/uninstall, signing, update process, and actual startup.
6. Verify release artifacts' checksums and provenance; require review of any remaining finding with a documented risk owner and disposition.
7. Separately complete real Ollama inference + STOP MIO on target desktop. Mocked CI tests are insufficient.

## Release gate

**NO-GO:** unresolved critical/high build-chain findings and no verified end-to-end real-model acceptance. This document records the evidence and plan; it does not assert vulnerabilities were fixed.

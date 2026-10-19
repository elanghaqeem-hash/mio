# LAR-17 — Windows Installer Verification

Date: 2026-10-19; PR #561.

## Evidence from commit 773886831d7f4189b5ae719a0c1022fce129d3b0
Nine of ten workflows completed successfully: training runner contract, dependency security audit, web build, cross-platform crash matrix, dependency remediation candidate, local AI gateway, Mio CI, validation gate and Windows durability probe.

Windows Installer Acceptance run [39227214614](https://github.com/elanghaqeem-hash/mio/actions/runs/39227214614) was still in progress at the packaging step. Dependencies and desktop build succeeded, but NSIS/portable packages, checksums and artifact upload were not yet verified. Prior run 39227127908 was also seen in packaging. Do not describe the Windows installer as validated.

## CI change
Commit `4846de6940077aa3d1ed1e3acb56df6dbbea95b4` adds `CSC_IDENTITY_AUTO_DISCOVERY=false` and `--publish never` to the packaging command. This prevents CI acceptance builds from discovering a local signing identity or attempting to publish packages, while continuing to build unsigned artifacts for inspection. This is a targeted troubleshooting change; it does not prove that signing/discovery caused prior hangs.

## Remaining gates
1. Observe final status of new Windows installer CI run and inspect packaging diagnostics, artifact files and SHA-256 manifest.
2. Validate Windows installation, launch, local inference and STOP MIO on a real device.
3. Apply and verify the lockfile-only dependency remediation candidate from LAR-12 in a reviewed change.
4. Decide signing, distribution and deployment separately; no production release or merge until the gates are complete.

**Release verdict: NO-GO.**

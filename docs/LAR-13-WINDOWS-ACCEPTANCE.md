# LAR-13 — Windows installer acceptance

## Evidence
The LAR-12 remediation candidate CI passed with a lockfile-only proposed change. Audits in that isolated CI job changed from 14 findings (2 critical, 3 high, 9 moderate) to 8 moderate, 0 high, 0 critical. **The candidate patch is not yet committed to the repository**; passing an isolated candidate workflow does not remediate the checked-in dependency lockfile.

Candidate artifact: https://github.com/elanghaqeem-hash/mio/actions/runs/39226331669/artifacts/12174181149

## New Windows acceptance gate
`.github/workflows/local-ai-windows-installer.yml` performs `npm ci`, `npm run build:all`, `npm run dist:win` on Windows GitHub Actions, expects at least two EXE files, computes SHA-256 hashes and archives packaging evidence. No installer signing is claimed. Workflow success is not proof of user interaction, installation on target hardware, system tray, local model invocation, or STOP MIO.

## Release conditions
- Review and apply the proposed lockfile patch on a controlled branch, then repeat audit and CI.
- Windows installer workflow passes on the final commit and produced files correspond to the build.
- Test installing, launching, uninstalling the app on a clean real Windows machine.
- Verify local Ollama inference and STOP MIO on the actual device.
- Complete security triage, artifact signing and review before release.

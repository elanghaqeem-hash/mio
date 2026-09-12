# MIO V2 Security & Functional Audit — 2026-09-12

## Executive summary

This audit found material gaps between the product's stated security model and the Electron implementation. The highest-risk items were an Electron renderer launched with `webSecurity: false` and `sandbox: false`, plus filesystem IPC that accepted nearly arbitrary absolute paths. Those weaknesses could turn a renderer compromise or malicious content path into broader local-file access.

The audit branch applies a first hardening baseline and removes misleading research verification. It does **not** claim that the application is unhackable. Security assurance requires repeated build/test validation, dependency scanning, runtime testing, and release hardening.

## Findings and remediation

### Critical / High — remediated in this branch

1. **Electron web security disabled**
   - Previous state: `webSecurity: false`.
   - Remediation: enable `webSecurity`, disable insecure content, restrict external navigation/window creation, and limit DevTools to development.

2. **Renderer sandbox disabled**
   - Previous state: `sandbox: false`.
   - Remediation: enable Electron renderer sandbox and make preload self-contained so it is compatible with sandboxed preload restrictions.

3. **Filesystem IPC escaped the claimed project sandbox**
   - Previous state: path validation only rejected the Windows directory. Other absolute paths could be read/written.
   - Remediation: require an explicitly selected workspace root; resolve and compare paths; block traversal and symlink escape; cap text file size at 10 MB; block overwrite during move; constrain directory listing.

4. **IPC sender not validated**
   - Previous state: privileged IPC handlers trusted all renderer invocations.
   - Remediation: validate WebContents sender and trusted renderer origin for privileged operations.

5. **External navigation / window creation unrestricted by an explicit allow policy**
   - Remediation: deny new windows, open only HTTPS links in the system browser, and prevent navigation away from the trusted app/dev origins.

6. **No renderer CSP**
   - Remediation: add a Content Security Policy, disable plugins/objects, deny framing, restrict base/form targets, and set no-referrer.

7. **Permission dialog could remain unresolved indefinitely**
   - Remediation: add a 120-second fail-closed decision timeout and bound untrusted display fields.

### Functional integrity — remediated in this branch

8. **Research workspace fabricated sources/verification status**
   - Previous behavior: simulated URLs and generated text could be labeled CORROBORATED/VERIFIED.
   - Remediation: no fabricated verification. Offline mode explicitly reports no search was performed; online mode reports UNKNOWN until a real provider is connected.

9. **Tray navigation messages were emitted but not consumed in the renderer**
   - Remediation: expose a narrow `onNavigate` preload listener and validate target modes before switching UI.

10. **No automated security/quality gate**
    - Remediation: add GitHub Actions for locked dependency installation, `npm audit --audit-level=high`, lint, internal security tests, web build, and Electron TypeScript build.

## Important remaining functional gaps

The following areas still need deeper implementation work before MIO can be described as fully production-ready:

- **Motion Tracking** currently renders a simulated skeleton rather than a real camera/landmark pipeline.
- **File Organization** UI currently demonstrates classification/rollback concepts; full transactional filesystem reorganization and durable rollback should use the newly restricted IPC bridge.
- **Settings / First Run** need a single persisted configuration source of truth; sensitive API keys must be stored using OS-backed secure storage rather than localStorage.
- **Model Router** currently stores configuration in process memory and does not implement provider transports.
- **Project/Version state** is predominantly in-memory; durable project persistence, integrity validation, import/export validation, and backup/restore should be added.
- **Memory Manager** is in-memory and should not be treated as a durable or encrypted memory store.
- **Research transport** still requires a real provider/search connector and source provenance model.
- **Security Dashboard** should display measured runtime state (workspace authorization, renderer isolation, network state, permission history) instead of static labels.
- **Release signing / update channel** needs code signing, artifact integrity verification, and a secure auto-update design before external distribution.
- **Runtime penetration testing** and adversarial testing remain necessary; static code hardening alone cannot prove absence of exploitable vulnerabilities.

## Recommended next release gates

1. GitHub Actions passes all build/lint/test/audit stages.
2. No high/critical dependency vulnerabilities.
3. Electron runtime test confirms sandbox + preload bridge work in packaged Windows build.
4. File sandbox tests cover traversal, absolute paths, UNC paths, symlink/junction escape, oversized files, and overwrite attempts.
5. Threat-model review for renderer compromise, malicious project file, prompt injection, untrusted web content, local privilege boundaries, and supply chain.
6. Signed installer and release artifacts.
7. Independent VAPT before production use.

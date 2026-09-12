# MIO V2 — Security, Database, API & Functional Integrity Audit

Date: 2026-09-12
Branch: `audit/security-hardening-2026-09-12`
Pull Request: #1

## Executive conclusion

This audit expanded the first security review to include persistence/database architecture, AI API and CLI integrations, secret management, filesystem transactions, media permissions, runtime telemetry, and removal of simulated product behavior.

The branch is materially safer and more functionally honest than `main`. It must **not** be described as unhackable or bug-free. Security is a risk-reduction process; production release still requires packaged-runtime testing, signed builds, adversarial tests, and independent VAPT.

## 1. Persistence / database

Implemented a local SQLite persistence layer in the Electron main process using Node's built-in `node:sqlite`.

Controls:
- Database stored below Electron `userData`, not in the renderer bundle.
- WAL journaling.
- Foreign keys enabled.
- `secure_delete` enabled.
- `trusted_schema` disabled.
- Busy timeout configured.
- Parameterized prepared statements for data values.
- Payload limits for settings and project data.
- Tables for application settings, provider metadata, encrypted secret ciphertext, projects, and security/audit events.
- Persisted project state and version history.
- Persisted provider connection-test results.

No database password or cloud API key is exposed to the renderer through the preload bridge.

## 2. AI/API connection architecture

Added a dedicated AI API / CLI Connection Manager in Settings.

Supported connection types:
- OpenAI API — Responses endpoint.
- Anthropic API — Messages endpoint.
- Google Gemini API — generateContent endpoint.
- Ollama local API — loopback only.
- Claude CLI — allowlisted executable.
- Gemini CLI — allowlisted executable.
- Ollama CLI — allowlisted executable.

Security controls:
- Cloud requests execute only in Electron main process.
- Renderer never receives API keys after storage.
- Custom remote endpoints are rejected for cloud providers to reduce SSRF/credential-exfiltration risk.
- Ollama endpoints are restricted to `localhost`, `127.0.0.1`, or `::1`.
- Network redirects are rejected.
- 45-second outbound request timeout.
- Prompt and response size limits.
- CLI execution uses `execFile` with `shell: false`.
- CLI executable names are explicitly allowlisted.
- Connection must pass a real test before ModelRouter selects it as an active external provider.
- Provider failures are surfaced as failures; they are not converted into fake successful AI responses.

## 3. Secret management

API keys are encrypted with Electron `safeStorage` before ciphertext is placed in SQLite.

Additional controls:
- Secret plaintext is not returned by provider-list IPC.
- Gemini credentials are sent as `x-goog-api-key`, not embedded in a URL/query string.
- On Linux, MIO refuses to store API keys when Electron reports the weak `basic_text` safeStorage backend.
- If OS-backed encryption is unavailable, MIO refuses to save a new API key.

Residual consideration: CLI tools may maintain their own authentication/session files outside MIO. Their security lifecycle is controlled by the respective CLI and operating system, not by MIO.

## 4. Electron privilege boundary

Enforced:
- `contextIsolation: true`
- `nodeIntegration: false`
- renderer `sandbox: true`
- `webSecurity: true`
- insecure content disabled
- production DevTools disabled
- external navigation blocked
- arbitrary new windows denied
- webviews denied
- privileged IPC validates the sender and trusted renderer origin
- narrow, frozen preload bridge
- renderer Content Security Policy blocks arbitrary direct Internet connections

Cloud AI network calls are deliberately moved to main process rather than allowing broad renderer Internet access.

## 5. Filesystem sandbox

Previously the filesystem bridge could access paths outside the alleged project sandbox. This is now replaced with an explicit authorized-workspace model.

Controls include:
- No file operation until a workspace is selected by the user.
- Path canonicalization.
- Path traversal rejection.
- Workspace-boundary enforcement.
- Symlink/realpath escape protection.
- File and directory type checks.
- Text file size cap.
- Directory listing cap.
- Move overwrite protection.
- No arbitrary shell execution.

FILES menu now performs real root-level workspace scanning, real moves, and reversible transaction history for completed moves. Partial failures are reported explicitly.

## 6. Camera and media permissions

Removed fake skeletal tracking and fabricated confidence values.

Current behavior:
- The Motion menu opens a real `getUserMedia` camera preview.
- Renderer L4 permission is required first.
- Electron main process separately shows a native allow/deny dialog for media access.
- Main process validates that the permission request comes from the trusted MIO renderer.
- Camera tracks are explicitly stopped when disabled or the view unmounts.
- Pose/landmark transfer is disabled and labelled unavailable until a real vetted landmark engine is integrated.

This is intentionally preferable to presenting simulated landmarks as real measurements.

## 7. Removal of fake/demo claims

Corrected or removed:
- Fabricated Research sources and verification labels.
- Seeded fake project assets/activity history.
- Seeded fake long-term memories.
- Fake file-organization transaction behavior.
- Fake motion landmarks and confidence values.
- Hardcoded “OPTIMAL / PROTECTED” context telemetry.
- Canned AI response presented as if external inference had occurred.
- Artificial generation delay in the procedural orchestrator.
- Hardcoded verified flag without checking `ResultValidator` in the procedural pipeline.

Research remains intentionally disabled for live web evidence until a real search connector is implemented. It now states this explicitly instead of fabricating results.

## 8. Project/version integrity

Project state is now hydrated from and saved to SQLite.

Version snapshots and rollback state are persisted. Snapshot payloads are structurally validated before restoration. Project payload size is capped before database write.

## 9. Runtime security dashboard

The Security Center now reads measured runtime state rather than displaying static claims. It reports, among other items:
- renderer sandbox state
- context isolation
- Node integration state
- web security
- OS secret-encryption availability
- SQLite status/version/schema/journal mode
- authorized workspace
- configured vs connection-tested AI providers
- persisted security/provider audit events

## 10. CI / security quality gate

GitHub Actions gate runs:
1. locked dependency installation
2. `npm audit --audit-level=high`
3. lint
4. internal security/unit suite
5. web TypeScript + Vite build
6. Electron TypeScript build

At the time of this audit, a full run reached success after the integration changes; subsequent documentation/CSP commits must continue to pass before merge.

## 11. Known residual gaps before production release

These are not concealed as completed features:

1. **Live web research connector** — not implemented; Research truthfully reports unavailable rather than generating fake citations.
2. **Pose landmark engine** — not installed; camera preview is real, pose inference is disabled.
3. **Packaged Windows runtime test** — TypeScript/build validation is not a substitute for executing the signed packaged binary on Windows.
4. **Code signing** — production Windows releases should be Authenticode/code-signed and release hashes published/verified.
5. **Independent VAPT** — required before describing the product as hardened for hostile environments.
6. **AI provider account controls** — API-key scopes, quotas, billing limits, provider-side audit logs, and key rotation must be configured in each vendor account.
7. **CLI authentication lifecycle** — external CLI credential stores are outside MIO's direct control.
8. **Local database confidentiality at rest** — sensitive API secrets are individually protected with safeStorage, but general project content in SQLite is not whole-database encrypted. If project data itself is highly confidential, add OS full-disk encryption and/or an encrypted database design.
9. **Supply-chain hardening** — maintain dependency updates, pinned CI actions/dependencies, SBOM/release signing, and continuous vulnerability monitoring.
10. **Fuzz/adversarial testing** — run malformed project files, very large content, symlink/junction attacks, IPC abuse, prompt injection, provider error/timeout, and hostile renderer tests against the packaged build.

## 12. Security posture statement

The correct statement after this work is:

> MIO now has a substantially hardened Electron privilege boundary, scoped filesystem access, durable SQLite persistence, OS-protected API-secret storage, allowlisted AI API/CLI integrations, real connection testing, measured security telemetry, and removal of several simulated behaviors. The current source branch passes automated security/build gates, but no software can be guaranteed immune from attackers. Production approval requires packaged-runtime validation and independent security testing.

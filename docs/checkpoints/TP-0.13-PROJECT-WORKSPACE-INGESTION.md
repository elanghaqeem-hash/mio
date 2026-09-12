# TP 0.13 — Project Workspace File Browser & Read-Only Knowledge Ingestion

Status: IMPLEMENTED / GATE 1 PASSED / GATE 2 PENDING
Branch: `milestone/mio-web-lab-tp-0.13`
Base: `refactor/mio-web-lab-v2`
Gate 1 validated head: `d5691b31b917ec03d7934c5fcdcbee218e72dcb8`

## Objective

Replace the previous mock file-organizer experience with a truthful read-only Project Workspace browser backed by TP 0.12 desktop workspace authority, then provide controlled document ingestion that treats local documents as untrusted project context rather than trusted instructions or automatic long-term memory.

## Files workspace behavior

The FILES workspace now:
- explicitly asks the user to authorize a desktop workspace root;
- shows only the opaque workspace name/id-backed session rather than an absolute root path;
- browses directories through `service.desktop.workspace.list`;
- previews supported text files through `service.desktop.workspace.read-text`;
- allows explicit workspace-authority revocation;
- provides no write/delete/move/rename controls;
- displays an explicit unavailable state in web runtime instead of simulating native filesystem access.

Directory navigation and file previews continue through CapabilityRegistry -> ResourceGovernor -> PermissionEngine -> SecureServiceGateway -> Sandbox -> typed IPC -> main-process WorkspaceSandbox.

## Supported preview/ingestion scope

TP 0.13 intentionally supports an allowlist of text formats such as TXT, Markdown, JSON, CSV/TSV, XML, YAML, source-code text, SQL, INI, and TOML.

PDF, Office documents, images, audio, video, archives, and other binary formats are not claimed as parsed capabilities in this milestone.

## Knowledge ingestion

`KnowledgeIngestionService` performs:

```text
Authorized read-only document
  -> extension allowlist
  -> external-content security scan
  -> prompt-injection detection
  -> untrusted-data boundary wrapping / script disarming
  -> ProjectManager imported document asset
  -> verified = false
  -> quarantine = true
  -> MemoryManager proposal
  -> REVIEW_REQUIRED
```

Project assets store a scoped `workspace://<workspaceId>/<relativePath>` URI instead of an absolute local filesystem path.

The imported content may be used as project context, but it is never treated as system/user authority. Long-term memory remains explicitly review-gated.

## UI truthfulness improvement

The previous FILES view contained sample files and UI-only organize/rollback actions that did not correspond to real filesystem execution. Those controls and mock records were removed. The replacement UI exposes only capabilities that exist and are security-gated in the current desktop runtime.

## Validation Gate 1

GitHub Actions `MIO Validation Gate` passed on head `d5691b31b917ec03d7934c5fcdcbee218e72dcb8`.

Results:
- dependency install/audit: PASS — 0 vulnerabilities;
- lint: PASS — 0 errors, **34 warnings**;
- web TypeScript + Vite build: PASS;
- Electron main/preload TypeScript build: PASS;
- automated validations: **115/115 PASS**;
- original system/security suite: **23/23 PASS**;
- all TP 0.1–0.12 validations remain green.

New TP 0.13 validation verifies:
- supported text allowlist;
- PDF/image formats are not falsely parsed;
- instruction-like document content is detected as suspicious;
- imported content is wrapped as untrusted data and script tags are disarmed;
- imported project document is `IMPORTED`, `document`, and `verified=false`;
- quarantine/threat metadata is retained;
- project asset stores scoped workspace URI rather than absolute path;
- external document cannot directly write long-term memory;
- no long-term memory exists before review;
- a review candidate is created;
- unsupported file types fail closed.

## Build observation

Gate 1 output:
- initial application JS: ~292.23 kB / ~88.70 kB gzip;
- FILES workspace chunk: ~17.59 kB / ~6.11 kB gzip;
- ChatStudio: ~25.88 kB / ~8.50 kB gzip;
- Studio3D remains ~545.07 kB / ~136.07 kB gzip and remains lazy-loaded.

## Known boundaries

- Workspace browsing is desktop-only because native filesystem authority is unavailable in web runtime; web displays a truthful unavailable state.
- TP 0.13 does not parse PDF/Office/media files.
- Imported documents are project assets and review candidates; a richer project knowledge index/vector retrieval layer is not yet implemented.
- Duplicate ingestion of the same source is not yet content-hash deduplicated.
- Write/delete/move/rename remains intentionally unavailable.
- Electron renderer sandbox remains pending preload bundling/restructuring.
- Existing 34 lint warnings and the Studio3D chunk warning remain technical debt outside this milestone.

## Definition of Done

- [x] Replace mock FILES organizer with real read-only browser
- [x] Authorize/revoke desktop workspace authority from UI
- [x] Secure directory browsing
- [x] Bounded supported-text preview
- [x] No fake write/delete/move/rollback operations
- [x] Quarantined document ingestion
- [x] Prompt-injection scan and untrusted-data wrapping
- [x] Imported project asset with `verified=false`
- [x] No absolute filesystem path persistence
- [x] Long-term memory review gate
- [x] Deterministic ingestion security tests
- [x] Gate 1: 115/115 PASS
- [ ] Gate 2 checkpoint validation
- [ ] PR ready for review
- [ ] Merge to `refactor/mio-web-lab-v2`

## Recommended next milestone

TP 0.14 should implement **Project Knowledge Index & Context Retrieval**: derive bounded chunks from quarantined/approved project documents, preserve source lineage and trust state, provide project-scoped retrieval for chat/research, prevent retrieved text from becoming instruction authority, add source-aware citations, and introduce content-hash deduplication. This should remain separate from long-term user memory and from any write/destructive filesystem capability.

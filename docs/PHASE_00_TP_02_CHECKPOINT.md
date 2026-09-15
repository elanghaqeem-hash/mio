# MIO Web Lab — TP 0.2 Checkpoint

## Milestone
Project Persistence + Controlled Memory

## Branch
`milestone/mio-web-lab-tp-0.2`

## Base
`refactor/mio-web-lab-v2`

## Scope delivered

- Shared `StorageProvider` contract
- In-memory storage adapter for deterministic tests
- IndexedDB adapter for browser/Web Lab persistence
- Runtime storage selection
- Persistent `ProjectManager`
- Persistent trusted long-term memory
- `MemoryPolicy` for external/untrusted data
- Review queue before external content can become long-term memory
- Persistent version snapshot / rollback behavior
- Bootstrap initialization for project and memory
- CI validation gate
- Expanded system/security tests

## Validation gate

GitHub Actions workflow: `MIO Validation Gate`

Required checks:

1. `npm ci`
2. `npm run lint`
3. `npm run build`
4. `npm test`

### Verified result

- Dependency install: PASS
- Dependency audit: 0 vulnerabilities
- Lint: PASS — 0 errors
- TypeScript + Vite production build: PASS
- System/security tests: PASS — 18/18 (100%)

## Security / integrity assertions verified

- Prompt-injection pattern is blocked.
- Untrusted external content is sanitized.
- Sandbox rejects traversal/root escape attempts.
- External content cannot directly alter long-term memory.
- External memory candidates require review.
- Explicit review approval can promote a candidate.
- Trusted user memory persists via `StorageProvider`.
- Project workspace and assets persist via `StorageProvider`.
- 3D/SFX/Music result validation remains operational.
- STOP MIO remains operational.
- Multi-mode creative planning remains operational.

## Known non-blocking technical debt

The existing prototype currently reports lint warnings in legacy/prototype UI and Electron code. The TP 0.2 implementation introduces no lint errors. Key debt categories:

- unused imports/variables in prototype views
- impure calls during React render in several existing views
- React refs accessed during render in animation/music views
- missing `useEffect` dependencies in the 3D view
- Electron prototype unused variables
- Vite configuration module-format warning
- production JS bundle is approximately 908 kB before gzip and requires code-splitting later

These items are tracked as hardening work and do not invalidate the TP 0.2 persistence/memory milestone. They should be reduced before Web Lab reaches TP 1.0.

## Gate decision

**TP 0.2: PASS**

TP 0.3 may start only after this checkpoint is merged into the refactor integration branch.

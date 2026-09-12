# TP 0.21 — Layered Memory Governance

## Scope
TP 0.21 separates runtime context from durable memory and is built on top of the validated TP 0.20 corroboration/conflict workflow.

## Implemented
- Explicit WORKING, CONVERSATION, PROJECT, and LONG-TERM memory boundaries.
- Working Memory: task-scoped, TTL-bounded, runtime-only.
- Conversation Memory: session-scoped, bounded, runtime-only.
- Project Memory: project-scoped, StorageProvider-backed, explicit user approval required.
- EXTERNAL_UNTRUSTED content is denied direct Project Memory promotion.
- Active Project Memory initializes during application bootstrap.
- Project Memory may reach Long-Term Memory only by re-entering `MioMemoryManager.proposeMemory()` and existing `MemoryPolicy`.
- Long-Term Memory review candidates persist across reloads.
- Review queue lifecycle emits explicit update events.

## Security / truthfulness
- Knowledge assets and retrieved documents remain DATA_ONLY and are not silently promoted to Project Memory.
- Memory never grants tool, network, filesystem, model, or privileged execution authority.
- No autonomous summarization or autonomous Long-Term Memory promotion is introduced.
- Runtime reset clears Working/Conversation layers without deleting Project Memory.

## Validation — Gate 1
Final implementation head: `c767a1db75512cfdb5f2959cce28b6ce5b8002e7`

- dependency audit: PASS — 0 vulnerabilities
- lint: PASS — 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload build: PASS
- automated validation: **193/193 PASS**

The full TP 0.20 corroboration/conflict suite remains green together with new memory-governance tests.

## Gate 2
Pending on this checkpoint commit. Do not merge until the full MIO Validation Gate passes on the frozen checkpoint head.

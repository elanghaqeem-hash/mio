# TP 0.21 — Layered Memory Governance

## Scope

TP 0.21 separates runtime context from durable memory so MIO does not treat every piece of context as permanent memory.

## Implemented

- Added explicit memory layers: WORKING, CONVERSATION, PROJECT, and existing LONG-TERM memory.
- Working memory is task-scoped, TTL-bounded, and runtime-only.
- Conversation memory is session-scoped, bounded, and runtime-only.
- Project memory is project-scoped and persisted through the existing StorageProvider abstraction.
- Project memory requires explicit user approval and rejects direct promotion of EXTERNAL_UNTRUSTED content.
- Project memory initializes during application bootstrap for the active project.
- Long-term memory remains owned by `MioMemoryManager` and `MemoryPolicy`.
- Project-memory promotion to long-term memory must re-enter `MioMemoryManager.proposeMemory()` rather than bypassing policy.
- Long-term memory review candidates are now persisted with long-term memory state so review-required external information survives reloads.
- Review queue changes emit explicit update events.

## Memory boundaries

WORKING
- Task-scoped
- Ephemeral
- TTL bounded
- Never automatically promoted

CONVERSATION
- Session-scoped
- Ephemeral
- Bounded to runtime/session
- Clearing conversation state does not delete project or long-term memory

PROJECT
- Project-scoped
- Persistent
- Explicit user approval required
- EXTERNAL_UNTRUSTED content cannot enter directly
- No cross-project retrieval

LONG-TERM
- Controlled by MemoryPolicy
- External/web/document sources remain review-gated
- Review queue persists across reload boundaries

## Security / truthfulness

- Knowledge assets and retrieved external documents remain DATA_ONLY project knowledge and are not silently promoted to Project Memory.
- Project Memory is not equivalent to instruction authority.
- No memory layer can authorize tools, network access, filesystem access, or privileged execution.
- This milestone does not implement autonomous memory summarization or autonomous long-term-memory promotion.

## Validation — Gate 1

Implementation head before checkpoint: `fa12578f55beddbf2f03023ca66fbb76f8e010b1`

- dependency audit: PASS — 0 vulnerabilities
- lint: PASS — 0 errors / 31 legacy warnings
- web production build: PASS
- Electron main/preload build: PASS
- automated validation: **181/181 PASS**

New memory-governance validations cover task-scoped Working Memory, TTL purge, session isolation, explicit Project Memory approval, rejection of external-untrusted direct promotion, project isolation, persistence round-trip, Long-Term Memory policy re-entry, review-queue persistence, and runtime-layer reset semantics.

## Gate 2

Pending on this frozen checkpoint commit. Do not merge until the full MIO Validation Gate passes on the checkpoint head.

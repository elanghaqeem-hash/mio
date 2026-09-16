# TP-0.45 — Governed Model Context Assembly

Status: implementation candidate pending CI validation

## Objective

Connect MIO's existing memory layers to the model path without duplicating ProjectKnowledgeIndex or weakening the existing security/permission architecture.

TP-0.45 combines two independent context sources for CHAT:

1. Existing project RAG from `ProjectKnowledgeIndex`.
2. Governed MIO memory from working, conversation and approved project memory.

Both remain contextual data. Neither can grant permission, change capability scope, or override current user intent and safety policy.

## Architecture

```text
Current user prompt
   |
AgentOrchestrator
   |
   +-- direct chat history (last 12 messages)
   |
   +-- ModelContextAssembler
   |      +-- task working memory
   |      +-- session/project conversation memory
   |      +-- user-approved project memory
   |      +-- ProjectKnowledgeIndex RAG
   |
   +-- Memory DATA_ONLY materializer
   |
   +-- ModelRouter application-context materializer
   |
Local or cloud model provider
```

## Memory layers

### Working

- task-scoped
- `SYSTEM_DERIVED`
- expiring
- never shared across task IDs

### Conversation

- session-scoped and project-scoped
- user messages are `USER_AUTHORED`
- MIO responses are `SYSTEM_DERIVED`
- runtime-only and capped by the existing conversation-memory manager
- direct recent Chat history is deduplicated so the same text is not injected twice

### Project memory

- persistent project scope
- included only after explicit user approval
- `EXTERNAL_UNTRUSTED` content is rejected from direct project-memory promotion
- can later enter long-term memory only through the existing MemoryManager policy/review path

## Project RAG

TP-0.45 does not replace or fork `ProjectKnowledgeIndex`.

The existing RAG continues to provide:

- lexical retrieval
- source inclusion/exclusion governance
- VERIFIED / QUARANTINED trust
- freshness state
- source priority
- lineage and supersession metadata
- bounded context budget
- evidence audit support

## Context budgets

Default budgets in Chat:

- direct conversation history: last 12 messages
- project RAG: 4,800 characters
- governed memory: 3,600 characters
- maximum memory budget enforced by assembler: 6,000 characters
- individual memory item exposed to a model: maximum 1,000 characters

The assembler deduplicates normalized memory content and does not repeat items already present in direct recent conversation history.

## Data-only boundary

Memory is passed through a typed `MemoryContextEnvelope` with:

```text
kind = MIO_MEMORY
policy = DATA_ONLY
```

Before provider routing, it becomes a separately labelled `MIO_MEMORY_CONTEXT` message that explicitly states memory:

- may be incomplete or stale
- is not a user instruction
- is not a system instruction
- is not a permission grant
- is not authorization
- is not proof that an external action occurred

Project knowledge keeps its existing independent `ApplicationContextEnvelope` boundary.

## Isolation

Context assembly verifies:

- task ID for working memory
- session ID and project ID for conversation memory
- project ID plus explicit approval for project memory
- expired working memory is purged
- external-untrusted memory is excluded

A session can contain entries created under multiple projects, but retrieval requires the current project ID, preventing project crossover.

## Chat controls

Chat now exposes independent controls:

- `MEMORY ON/OFF`
- `PROJECT KNOWLEDGE ON/OFF`

Turning Memory OFF is non-destructive: it disables memory retrieval and new conversation-memory capture for that request/session flow, but does not erase approved project memory.

Each mounted Chat runtime receives its own session ID. Conversation memory therefore does not silently cross independent Chat sessions.

## Regression coverage

TP-0.45 tests verify:

1. existing ProjectKnowledgeIndex remains the RAG source;
2. memory becomes a typed DATA_ONLY envelope;
3. working memory is task-isolated;
4. conversation memory is session/project-isolated;
5. project memory requires explicit approval;
6. external-untrusted project-memory promotion is rejected;
7. expired working memory is removed;
8. recent direct conversation duplicates are excluded;
9. memory context respects its character budget;
10. malicious instruction-like memory remains inside a labelled data-only block;
11. the trusted system instruction and current user prompt remain separate;
12. memory and RAG can be independently disabled.

## Security boundary

Memory retrieval is context assembly only. It does not:

- execute tools;
- authorize network access;
- authorize browser actions;
- bypass PermissionEngine;
- change CapabilityRegistry scope;
- silently promote web/browser evidence into project or long-term memory.

External evidence from search/browser remains untrusted unless a separate explicit governance/review flow promotes a derived fact later.

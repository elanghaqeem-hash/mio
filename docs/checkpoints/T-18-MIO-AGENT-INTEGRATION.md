# T-18 Mio Agent Integration

Status: IN PROGRESS (ported from #520 under MIO-PRV-00.08, 2026-10-12)

- T-18.01 — DONE: typed agent ↔ File Intelligence bridge (`src/agents/FileIntelligenceAgentBridge.ts`). Search and organize-preview requests are validated; invalid or mutation-claiming requests return `REJECTED` instead of throwing. AI routing is described by `ModelRouter.describeRoute()` (ADR-001), not chosen by the bridge.
- T-18.02 — PLANNED: connect the live agent dispatcher (`AgentOrchestrator`) to the bridge.
- T-18.03 — PLANNED: scoped workspace context.
- T-18.04 — PLANNED: preview/approval boundary.
- T-18.05 — PLANNED: unavailable-provider disclosures in the agent UI.
- T-18.06 — PARTIAL: integration regression tests (`agentFileIntegrationTests`, 3 cases, registered).
- T-18.07 — PLANNED: acceptance and merge.

The bridge only plans and validates. It does not perform filesystem mutations, run searches against an index, or invoke providers.

Changes from #520: #520's fourth test assertion failed (`selectAIRoute` threw for a LOCAL_ONLY request with only a remote route), and CI did not catch it because the suite was never registered. Both are fixed here. The module lives in the existing `src/agents/` directory instead of a new `src/agent/`.

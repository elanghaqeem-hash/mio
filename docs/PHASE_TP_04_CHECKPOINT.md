# MIO Web Lab — TP 0.4 Checkpoint

## Milestone
Secure Agent & Tool Orchestration

## Status
VERIFIED — eligible to merge into `refactor/mio-web-lab-v2` after final validation gate.

## Audit Findings Resolved
- Agent could previously claim execution without a real registered tool.
- No central Tool Registry existed.
- Tool risk and minimum permission were not checked together.
- Permission, sandbox, output validation, and audit were not enforced by a single router.
- Unknown tools, invalid input, under-declared permissions, invalid output, and timeouts lacked one fail-closed execution path.

## Implemented Execution Architecture

```text
Agent / Task
  -> ToolRegistry
  -> ToolRouter
      -> PolicyEngine
      -> mode scope validation
      -> input validation
      -> RiskAnalyzer
      -> PermissionEngine
      -> Sandbox timeout/resource guard
      -> tool execution
      -> output validation
      -> Security audit event
  -> ToolResult
  -> Agent report
```

## Built-in Tools
- `project.inspect`: low-risk, read-only project summary.
- `research.search`: high-risk network tool, explicit L4 permission gate, uses the TP 0.3 ResearchEngine.

## Agent Behavior
- RESEARCH intents execute only through `research.search`.
- PROJECT status intents execute only through `project.inspect`.
- Modes without registered tools no longer simulate execution; MIO explicitly reports that no executable tool is registered.
- Global high-impact requests remain subject to the L5 human-in-the-loop gate.

## Validation Evidence
GitHub Actions workflow: `MIO Validation Gate` on PR #5.

Validated:
- npm dependency install: PASS
- dependency audit: 0 vulnerabilities
- lint: PASS, 0 errors
- TypeScript + Vite production build: PASS
- legacy regression tests: PASS
- research tests: PASS
- ToolRouter positive path: PASS
- unknown tool rejection: PASS
- invalid input rejection: PASS
- insufficient permission declaration rejection: PASS
- invalid output rejection: PASS
- sandbox timeout enforcement: PASS
- total validation: 30/30 PASS

## Non-blocking Technical Debt
- 50 lint warnings remain in legacy/prototype UI and Electron shell modules.
- production JS bundle is ~922 kB before gzip and needs later code splitting.
- Vite config loader emits CommonJS/ESM compatibility warning.
- Permission grants are not yet scoped/persisted by project/tool/time window.
- Tool cancellation tokens and task queue integration are still future work.
- Tool schemas currently use TypeScript validators rather than a shared JSON-schema validation layer.

## Gate Decision
TP 0.4 is safe to integrate. Future capabilities must register tools explicitly and cannot introduce direct Agent -> Service or LLM -> OS execution paths.

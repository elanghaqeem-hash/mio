# LAR-34 — Production Release Decision Record (Pre-Release)

Date: 2026-10-19. Branch: `feat/local-ai-runtime-gateway-20261019`; PR #561.

## Verified automated evidence

At commit `dfe2105740c9201d639da80948641ba25c014b96`, 9 of 11 PR workflows completed successfully, including MIO Local AI Gateway Check, dependency audit, web build, MIO CI, validation gate, remediation and Windows durability. Windows Installer Acceptance and Cross-Platform Crash Matrix remained in progress at inspection time. Do not call these two PASS.

## Mandatory release gates

| Gate | Evidence expected | Result |
| --- | --- | --- |
| Dependency baseline | Applied lockfile, fresh audit of exact shipping commit | Previous checks pass; final shipping commit pending |
| Local inference | Real Ollama with locally stored model on user hardware | NOT RUN |
| Offline independence | Internet disconnected, successful chat, monitored network destinations | NOT RUN |
| STOP MIO | Desktop STOP click interrupts running model; no late message accepted | NOT RUN |
| Windows lifecycle | Clean install, first launch, restart, uninstall | NOT RUN |
| Security/privacy | Data retention, local exposure, secret leakage, storage and network review | INCOMPLETE |
| Reliability | Real-device load, recovery, CPU/RAM/GPU and uptime evidence | NOT RUN |
| Release artifact | Exact-version installer, SHA-256, signing decision | INCOMPLETE |
| User acceptance | 12 LAR-33 Windows UAT cases executed with evidence | NOT RUN |

## Decision

**NO-GO** for production deployment or main-branch merge. Passing mocked contract tests and Windows packaging jobs does not prove real user acceptance.

The next action is a recorded Windows UAT using a real Ollama runtime; resolve each defect and repeat the full shipping-commit CI before considering a new GO/NO-GO decision.

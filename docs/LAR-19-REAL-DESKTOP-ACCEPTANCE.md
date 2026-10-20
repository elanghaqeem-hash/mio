# LAR-19 — Real Desktop Acceptance

## Verified automated evidence
On commit `bebd583e4676fb4cad942ef38a30d8a5293c68c7`, nine checks completed successfully, including Mio CI, local gateway, security audit, candidate remediation, build and Windows durability. Installer run [39227625488](https://github.com/elanghaqeem-hash/mio/actions/runs/39227625488) was in progress when inspected. Prior Windows installer runs produced NSIS/portable artifacts, but that does not confirm real-device user acceptance.

## Execute on a real Windows desktop (no paid cloud API keys)
1. Install a trusted Ollama build, retrieve `qwen2.5:3b` once and verify weights are locally present: `ollama list`. Initial model download needs internet; subsequent inference can run offline.
2. Start Ollama and `node scripts/local-ai-gateway.mjs` on the same computer. Keep gateway bound to `127.0.0.1`. Never expose the gateway to LAN/public interfaces.
3. Execute `node scripts/local-ai-real-model-smoke.mjs`; record result, timestamp, CPU/GPU/RAM, model digest, response length and elapsed duration.
4. Execute `node scripts/local-ai-real-cancellation-smoke.mjs` and record whether `PASS_CLIENT_ABORT` or `INCONCLUSIVE` was returned. This validates that a real HTTP client can cancel; it does NOT establish that an actual MIO desktop STOP click cancels execution or frees GPU resources. Never claim that it does.
5. Install/run the Windows artifact from the verified GitHub workflow on a disposable test machine. In Settings choose `MIO Local Intelligence`, backend `MIO Local Gateway`, model `qwen2.5:3b`, endpoint `http://127.0.0.1:4318`, OFFLINE mode; check connection and send a prompt.
6. While MIO is actively generating text, press STOP MIO. Verify no result is accepted afterward, tasks are cancelled, and a reset is needed before new generation.
7. Disconnect internet and verify local conversation still works without any commercial API credential. Review provenance and telemetry for accidentally invoked cloud endpoints.
8. Verify clean uninstall, restart/recovery and behavior when Ollama is stopped or the model is missing.

## Audit requirements
Do not record secrets, user prompts or potentially sensitive outputs in public CI artifacts. Save only redacted outcomes, version/digest, duration, status and reproducible failures. Tests should be run on target hardware; this document is a procedure, not a report of successful real inference.

## Release decision
**NO-GO** until real-device acceptance and dependency patch review are complete. PR #561 remains draft.

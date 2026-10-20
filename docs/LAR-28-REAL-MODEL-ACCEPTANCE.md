# LAR-28 — Real Local Model Acceptance

## Verified baseline, 2026-10-19
LAR-27 application workflow [run 39230714085](https://github.com/elanghaqeem-hash/mio/actions/runs/39230714085) completed successfully, and the branch package-lock.json blob changed from `99beba9bc4bb16981c4a8fa331462612c4825a5d` to `e09ecd2ed5722d711670fb0c608b83aeac4cd283`. This proves that the lockfile changed, not that all release gates are met.

## Real-model acceptance
This is an **operator-run acceptance procedure**, not proof of an executed real inference test.

1. Install local Ollama on the target computer and pull the model once: `ollama pull qwen2.5:3b`. Note that downloading model weights initially requires internet.
2. Verify `ollama list` includes the exact model tag.
3. With Ollama running, start the loopback MIO gateway using `node scripts/local-ai-gateway.mjs`.
4. Execute `node scripts/local-ai-real-model-smoke.mjs` to check gateway health, configured model, real chat output, and local provider metadata.
5. Execute `node scripts/local-ai-real-cancellation-smoke.mjs`, interpret `PASS_CLIENT_ABORT` only as client cancellation, and reject timeouts as failed checks.
6. Install the latest matching Windows artifact on a clean machine; select gateway backend in MIO Settings, complete a chat, trigger STOP MIO mid-generation, then repeat with internet disabled.
7. Repeat tests after app restart, model-server restart, model absence and clean uninstall.

Record: OS version, RAM/CPU/GPU, local model name + digest, gateway version, PASS/FAIL, crash counts and latency. Do not store prompts, API keys or private model output in public artifacts.

## Release gate
**NO-GO** until local Ollama inference, desktop STOP, offline use and clean-device install succeed. Gateway mocks and CI packaging alone do not satisfy acceptance.

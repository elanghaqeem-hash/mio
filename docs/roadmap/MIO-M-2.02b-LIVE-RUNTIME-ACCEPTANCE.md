# M-2.02b — Live Ollama and actual Electron IPC acceptance

## Baseline
Mio CI run 44854924638 passed M-2.02a (commit 5c9d645b4fd58f358953bd19b289849a355d02aa). Windows Durability Probe 44854924665 failed; do not relax Windows checkpoint production gates.

## Added test layers
1. **Simulated real Electron GUI**: `scripts/e2e/electron-native-chat-gui.cjs` launches BrowserWindow with production preload, isolates renderer, registers trusted main-frame IPC and injects a mock loopback-only Ollama transport. It checks successful 2-role message inference, malicious extra IPC arguments rejected, tool commands rejected, renderer lacks Node `require`, and permanent STOP denies subsequent requests. CI checks through Xvfb on Linux, without Ollama or API keys.
2. **Real optional workstation acceptance**: `scripts/benchmarks/mio-live-ollama-acceptance.ts` uses the actual Electron-main chat service and locally installed Ollama `qwen2.5:3b` via `127.0.0.1:11434`, executes two chat turns and reports time per turn, response length, model identity, heap-delta estimates and source. It emits no prompt or generated response content. It asserts nonempty replies and same local model; **not semantic correctness, GPU utilization, Electron GUI usability or power-loss durability**. It performs no cloud fallback and requires an explicit opt-in environment variable.

## Windows runbook (PowerShell)
```powershell
git switch roadmap/mio-vital-runtime
git pull --ff-only
npm ci
npm run build:electron
ollama pull qwen2.5:3b
ollama list
$env:MIO_LIVE_OLLAMA = '1'
node --import tsx scripts/benchmarks/mio-live-ollama-acceptance.ts
Remove-Item Env:MIO_LIVE_OLLAMA
npm run electron:dev
```
On the desktop UI, select **NATIVE LOCAL ON** and complete a two-turn Indonesian chat. Disconnect Ollama and verify the explicit failure. STOP MIO while inference is running: no late reply or new request may be accepted. Restart the whole Electron process to reset the main STOP latch.

The live test fails explicitly if Ollama is unreachable, wrong model is installed, or the response is not the expected local model. No remote provider credentials. Do **not** claim this acceptance ran on GitHub Actions or on a user's workstation. The CI GUI test uses mocked inference. Maximum per-turn Electron service duration is 120 seconds, not a guarantee of model performance.

## Remaining release gates
CI status for latest commit; Windows native acceptance with hardware/latency recording; UI end-to-end with actual Ollama; dependency advisory remediation; Windows checkpoint identity/power-loss durability. Keep PR #565 unmerged until production criteria are satisfied. Takane Mio unchanged.

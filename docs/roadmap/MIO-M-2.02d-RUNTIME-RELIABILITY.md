# M-2.02d — Local Inference Performance & Reliability (observability baseline)

## Verified predecessor
M-2.02c Mio CI run 44863898954 and MIO Validation Gate 44863898947 passed at commit 2e3ccb14ec7c9df9d6cde7312d790d10d073e33d. Windows Durability Probe run 44863898982 failed and remains a production blocker.

## New scoped implementation
- Electron main-process `NativeDesktopChatService` records privacy-safe, **in-memory only** request metrics: accepted, succeeded, failed, timed out, STOP cancelled, active, STOP latch, last outcome, mean latency, last latency, and approximate p95 latency over **up to 32 completed requests**. All times are in milliseconds.
- Prompt text, model output, IP/paths, file contents, model names, credentials and chat history are deliberately excluded from metrics.
- Invalid/busy/STOP-denied requests are **not** counted as admitted inference requests; each admitted request contributes exactly one terminal outcome.
- No new renderer IPC endpoint exposes diagnostic data. The `inspect()` method is for trusted diagnostics/tests only; it preserves the earlier `active` and `stopped` fields.
- Existing fixed-loopback, one-request concurrency, 120s production deadline, no cloud fallback, bounded Ollama JSON and sticky STOP remain unchanged.
- Optional Windows live acceptance now also reports p50/p95 **of two sample turns**, Node-process CPU time and RSS estimates, and a final service-diagnostics snapshot. These measures do **not** represent Ollama server/GPU utilization or statistical latency guarantees.

## Regression
`scripts/benchmarks/mio-native-inference-metrics-check.ts` covers outcome counters, strict 32-sample bound, average/p95, failure/timeout/STOP, active gauge, rejected admission, privacy (no prompt/model strings), and full recovery under a fresh service instance. Registered in Mio CI.

## Pending gates
CI success at this commit, live Ollama on authorized Windows device, workload benchmarking with more samples, endpoint authentication/exposure checks, Ollama server and GPU metrics, dependency audit, Windows checkpoint durability. No production merge or deployment. Takane Mio unchanged.

# M-2.02g — Local Model Calibration & Benchmark Observations

## Verified baseline
M-2.02f CI 44880045086 and MIO Validation Gate passed at 5bd4a614de757a7903000deaca6e96242665e033. The Windows Durability Probe failed; no production mutation entitlement was opened.

## New implementation
- `electron/ipc/nativeLocalBenchmark.ts`: deterministic aggregation of 1–32 observations with strict safe-integer checks, success/failure count, p50/p95 latency **for successful samples**, observed minimum OS free RAM, maximum Node-process RSS, and maximum **observed** OS free RAM decline.
- Crucially, OS free-memory deltas **are not model memory requirements**. Ollama runs in another process, the OS may reclaim/cache memory, and GPU/VRAM are not measured. Every summary explicitly reports `ramRequirement: NOT_DETERMINED` and `approval: REQUIRES_HUMAN_VERIFICATION`. It cannot create `USER_VERIFIED` profiles for M-2.02f automatically.
- `scripts/benchmarks/mio-live-local-calibration.ts` is **explicitly opt-in**, requires `MIO_LIVE_OLLAMA=1` and readiness of the local `qwen2.5:3b` model. It executes three short local-only conversational turns using the existing secure native desktop chat service. It outputs a sanitized aggregate without prompts/answers or personal identifiers. It does **not** save a file automatically, change runtime configuration, download models, or access remote providers. Users can explicitly redirect its stdout if they need to retain evidence.
- `scripts/benchmarks/mio-local-benchmark-summary-check.ts` adds simulated deterministic regression to Mio CI. No live inference is claimed from CI.

## Windows acceptance (PowerShell)
```powershell
git switch roadmap/mio-vital-runtime
git pull --ff-only
npm ci
ollama pull qwen2.5:3b
node --import tsx scripts/benchmarks/mio-native-runtime-preflight.ts
$env:MIO_LIVE_OLLAMA = '1'
node --import tsx scripts/benchmarks/mio-live-local-calibration.ts
Remove-Item Env:MIO_LIVE_OLLAMA
```

When the owner expressly wishes to keep a report, use PowerShell redirection to a reviewed path; do not commit potentially identifying benchmark results to Git. Inspect responses, task correctness, temperature, RAM headroom with other programs running, load/idle states and GPU memory outside this sampler before **manually** validating a model-specific required-free-RAM profile.

## Remaining blockers
Windows checkpoint durability (must remain fail-closed), actual Windows live Ollama proof, GPU/VRAM/other-process RAM telemetry, repeatability over substantial samples, dependency vulnerability audit, application release gates. The calibration path is experimental and is not automatic model fit detection. PR #565 remains unmerged; Takane Mio unchanged.

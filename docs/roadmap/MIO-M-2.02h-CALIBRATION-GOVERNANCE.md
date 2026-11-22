# M-2.02h — Calibration Governance & Performance Optimization

## Baseline and scope
M-2.02g was verified green by Mio CI run 44881611711 and MIO Validation Gate 44881611743 at commit 50f9c43f551b93d520902bd7502271d5f63f2753. Windows Durability Probe 44881611739 failed and remains an independent release blocker.

## Approval boundary
The benchmark from M-2.02g is deliberately **non-certifying**. OS free-memory deltas, Node-process RSS and two/three-turn latencies cannot determine actual Ollama model requirements, GPU/VRAM fit, reliability or semantic quality.

`src/intelligence/model/MioLocalCalibrationGovernance.ts` introduces `reviewLocalCalibration` for a **trusted operator-supplied review dossier**, *not* a renderer command. It requires:
- Explicit model and workload allowlists, unique workload types and safe model name.
- Three or more independently completed memory tests **beyond the benchmark** with recorded minimum free memory, plus an operator-specified required-free-memory bound with at least 768 MiB margin over that independently tested value.
- A recent timestamp (maximum age 30 days, no future date).
- An internally consistent three-or-more successful sample benchmark summary with no failures and meaningful p95 latency. The summary **must continue to report RAM NOT_DETERMINED, GPU NOT_MEASURED and REQUIRES_HUMAN_VERIFICATION**.
- An explicit `I_INDEPENDENTLY_VERIFIED_MODEL_MEMORY_AND_ACCEPT_RISK` operator acknowledgment. The engine does not infer or generate this acknowledgment.

Only after these checks can a `CalibratedLocalModel` be returned for an **explicitly opted-in**, trusted constructor call in the M-2.02f adaptive router. The normal desktop path remains fixed to `qwen2.5:3b`. No renderer IPC allows model/endpoint override. No cloud fallback, automatic profile persistence, remote provider key, or automatic permission grant is introduced.

### Important trust limitation
An operator acknowledgment is a **self-assertion**, not independently authenticated identity, a signature, secure attestation or proof of actual RAM testing. A malicious caller in the trusted main process could fabricate a dossier. For production, separate authorization, evidence storage, revocation, independent measurement and signed audit trail must be implemented. A passing unit regression does not verify any real model benchmark on a Windows machine.

## Tests
`scripts/benchmarks/mio-local-calibration-governance-check.ts` exercises valid manual review, reserve-aware selection, missing/false acknowledgment, insufficient independent trials, unsafe or unverified RAM, stale/future dates, malformed model/workload, invalid or self-certifying benchmark summaries, and absence of operator approval text in resulting profile. Mio CI runs this test alongside all earlier inference, Electron isolation and security regressions.

## Remaining blockers
Live Windows/Ollama acceptance and independent RAM/VRAM observations; verified operator authority and audit trail; model performance at higher sample counts; dependency audit; Windows checkpoint durable identity/power-loss behavior. Keep PR #565 unmerged and mutation production checks fail-closed. Takane Mio unchanged.

## Trusted integration seam
`electron/ipc/trustedCalibratedChat.ts` exposes `createReviewedNativeChatService(review, options)` for **trusted main-process callers only**. It applies the review gate before constructing an opt-in `NativeDesktopChatService` with the approved profile. This method is not registered in Electron IPC, not exposed via preload, not wired to a renderer button, and does not activate automatically on production startup. Its integration is tested using a simulated local Ollama server, including rejection of fabricated approval. This is a non-production integration seam, not a replacement for cryptographic attestation or evidence audit.

## Multi-run latency repeatability (additional M-2.02h gate)
`src/intelligence/model/MioLocalBenchmarkRepeatability.ts` checks three to ten **separately collected** benchmark summaries, each with at least three samples. It rejects malformed/self-certifying evidence and classifies complete, successful runs by a configured p95 latency ceiling and a maximum threefold spread between fastest and slowest run p95. A pass means **READY_FOR_HUMAN_REVIEW**, never automatic approval or proof of memory fit. `scripts/benchmarks/mio-local-repeatability-check.ts` covers slow, unstable, failed and malformed run evidence in CI.

On the authorized Windows machine, after `npm ci`, `ollama pull qwen2.5:3b` and successful preflight, run:

```powershell
$env:MIO_LIVE_OLLAMA = '1'
node --import tsx scripts/benchmarks/mio-live-local-repeatability.ts
Remove-Item Env:MIO_LIVE_OLLAMA
```

This **opt-in** script executes nine local inference turns in three fresh conversations and prints sanitized aggregate observations. It does not auto-save evidence, approve a model, change the default model, or write any router settings. A clean latency repeatability verdict remains **insufficient** for `reviewLocalCalibration` without independently measured model memory and operator approval. CPU/GPU/VRAM and Windows checkpoint durability are not proven.

# M-2.02e — Hardware-aware desktop local inference admission

## Baseline and scope
M-2.02d Mio CI 44877494118 and Validation Gate passed. Windows Durability Probe failed and remains an independent production blocker. This stage introduces a **conservative local memory admission guard**, not a claim of automatic model fit.

## Implementation
- `electron/ipc/nativeHardwareAdmission.ts` probes Node OS total/free RAM and available logical CPU parallelism on the trusted Electron main process. It validates the probe strictly, denying unknown/invalid input.
- Admission thresholds are **2 GiB total system RAM** and **768 MiB currently free system RAM**, checked before a local inference slot is admitted. Both thresholds are operational headroom safeguards, **not** evidence that `qwen2.5:3b` fits in RAM/VRAM or runs efficiently.
- Insufficient RAM returns `MIO_HARDWARE_TOTAL_MEMORY_LOW` or `MIO_HARDWARE_FREE_MEMORY_LOW`; invalid/unavailable probes return `MIO_HARDWARE_UNKNOWN`. Denied requests do not invoke Ollama and do not count as inference.
- Existing single-concurrent-request, timeout, STOP latch, no cloud fallback and bounded Ollama JSON are preserved. Hardware snapshots remain in the main process; chat responses and metrics do not expose physical hardware identifiers or telemetry.
- Unit regression injects deterministic hardware values for threshold boundaries, invalid probes, low RAM, recovery with increased free RAM, no network on denial, and STOP precedence.

## Limits / next steps
OS free RAM is an approximate snapshot, can race with allocations and is not Ollama's in-use memory. CPU count is observed, **not** used as a model-performance score. No GPU/VRAM discovery, automatic download, model-switch policy, hardware benchmarking, or user-machine proof is claimed. Windows live acceptance remains opt-in per M-2.02b. CI at latest commit pending. Keep PR #565 unmerged and Windows mutation production gate denied until durable checkpoint issues resolved. Takane Mio unchanged.

## Read-only Windows readiness preflight (new)
On the target Windows machine, from this branch after `npm ci`, run:

```powershell
ollama pull qwen2.5:3b
node --import tsx scripts/benchmarks/mio-native-runtime-preflight.ts
```

The command probes OS memory/CPU and `http://127.0.0.1:11434/api/tags` only; it never generates a response, runs a tool, downloads a model, or sends data to a remote provider. It prints a structured verdict: `READY`, `LOW_MEMORY`, `HARDWARE_UNKNOWN`, `OLLAMA_UNREACHABLE`, or `MODEL_MISSING`. Exit code 0 means the **preflight conditions** passed; exit code 2 means not ready, not necessarily a software defect. A passing preflight does **not** prove GPU fit, model quality, inference performance, Windows desktop GUI correctness, or checkpoint durability. `scripts/benchmarks/mio-native-runtime-preflight-check.ts` mocks every verdict, tests offline timeout and confirms no network on low-memory denial; registered in Mio CI.

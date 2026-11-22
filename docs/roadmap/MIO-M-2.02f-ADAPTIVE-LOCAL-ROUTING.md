# M-2.02f — Adaptive calibrated local model selection

## Baseline
M-2.02e CI 44879689317 and Validation Gate passed at 24e880cfbaa02eb95fecbf1f187822e329a4f8f4. Windows Durability Probe remains a distinct release blocker.

## Implementation (trusted opt-in)
- `MioAdaptiveLocalModelSelection.selectCalibratedLocalModels` selects only **installed**, workload-compatible, explicitly `USER_VERIFIED` local model profiles whose calibrated `requiredFreeMemoryBytes` fits inside **OS free memory minus a configured reserve**. Profile order is deterministic; it is not learned intelligence.
- Model names, workload categories, budgets and duplicate profiles are validated. Uncalibrated or unknown memory profiles are rejected; model disk size from `/api/tags` is **never** used as a RAM estimate.
- `MioNativeRouterProvider` can optionally perform selection before cognitive orchestration, using bounded fixed-loopback model discovery. No candidate means `MIO_NATIVE_NO_CALIBRATED_MODEL`; no cloud or heuristic fallback.
- `NativeDesktopChatService` supports a **trusted constructor-only** calibrated profile list. The renderer cannot send a profile, reserve or endpoint in its IPC message. The hardware snapshot comes from Electron main; reserved headroom is 768 MiB. **No calibration profiles are enabled by default**; the existing `qwen2.5:3b` path stays unchanged.
- Multi-model adaptive routing is therefore a working **opt-in backend capability**, **not** automatic model sizing or production tuning. A trusted calibration process and explicit verified machine-specific profiles must be implemented before enabling multi-model routing in production.

## Tests
`scripts/benchmarks/mio-adaptive-local-selection-check.ts` checks workload matching, profile order, reserve math, malformed/unverified calibrations, no-candidate denial before inference, opt-in service path and legacy default compatibility. Registered in Mio CI, latest run pending.

## Remaining prerequisites
Live Windows Ollama inference; reproducible model RAM calibration and GPU/VRAM telemetry; robust model performance comparisons; Windows checkpoint durability fix; audit/remediation of vulnerable dependencies; end-to-end desktop acceptance. Keep PR #565 unmerged and mutation admission guarded. Takane Mio unchanged.

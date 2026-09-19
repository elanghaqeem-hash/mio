# Mio Voice V4.6.4 — Adaptive Buffer Controller v1

## Objective
Provide a deterministic, bounded controller for selecting startup/stream prebuffer depth from playback conditions without making network-specific promises.

## Control policy
- Target range: **1–4 chunks**.
- Constrained network or low buffer-ahead (<900 ms): request an increase.
- Fast network with high buffer-ahead (>2400 ms): request a decrease.
- A direction requires **2 consecutive qualifying samples** (hysteresis).
- Every change enters a **1.5 s cooldown**.
- Any observed rebuffer immediately raises the target by one step, subject to the maximum bound.
- All decisions are monotonic one-step changes; no unbounded growth or rapid oscillation.

## Safety boundary
The controller is initially a pure decision component. It does not change the streaming iterator, MediaSource lifecycle, audio content, transcript data, or provider behavior. Integration into the player is deliberately deferred until controller invariants pass CI.

## Next integration stage
1. Feed corrected V4.6.4 telemetry into a condition classifier.
2. Apply controller decisions only at safe prebuffer boundaries.
3. Add anti-thrashing and rebuffer regression scenarios.
4. Measure startup latency versus rebuffer rate.
5. Keep a deterministic minimum-buffer fallback if telemetry is unavailable.

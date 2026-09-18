# Mio Voice V4.6.3 — Bounded Startup Prebuffer

V4.6.3 introduces the first conservative buffering policy on top of V4.6.2 observability.

For MediaSource playback Mio now attempts to buffer up to two non-empty encoded chunks before starting audio. If the stream ends earlier, playback starts with what is available. Blob fallback is unchanged.

This is intentionally bounded. Mio does not wait for an arbitrary byte count or network estimate, so latency cannot grow without limit. The selected target is exposed in playback telemetry as prebufferTargetChunks.

The policy preserves cancellation, VAD barge-in, privacy boundaries and browser capability detection.

## Follow-up calibration

The two-chunk target is a safe initial engineering policy, not a universal optimum. Real-device measurements should compare first-audible latency and rebuffer count. A later adaptive controller may select between one and a small bounded number of chunks based on recent local playback health without storing audio or transcript content.

# Mio Voice V4.6.2 — Adaptive Streaming Telemetry

V4.6.2 adds the measurement layer needed before tuning adaptive buffering heuristics on real devices and networks.

## Added measurements

- prebufferBytes: encoded audio available when playback starts
- rebufferCount: conservative count of append moments where the media element reports insufficient future data
- existing first-chunk, first-audible, playback-start, total buffered bytes, append count and playback mode remain available

## Design rule

V4.6.2 deliberately measures before introducing aggressive network heuristics. Browser buffering behavior differs across Chromium, Safari and mobile runtimes; fixed guessed delays can increase latency or make playback less stable.

The Blob compatibility path reports its complete buffered size as prebufferBytes and zero rebuffers.

## Privacy

Measurements contain counts, timings, playback mode and byte quantities only. No audio, transcript, prompt, voice embedding or user content is retained by this component.

## Calibration targets

Real-device testing should establish distributions for:
- time to first audible audio
- prebuffer size at start
- rebuffer incidence
- cancellation latency
- MediaSource vs Blob fallback rate

Those measurements can then drive a bounded adaptive prebuffer policy in V4.6.3 instead of hard-coding assumptions.

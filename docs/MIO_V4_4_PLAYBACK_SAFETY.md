# Mio Voice V4.4 — Playback Safety Foundation

V4.4 starts the low-latency production phase without enabling unsafe partial-audio fallback.

## Implemented

- Typed production failure stages: `PRE_AUDIO` and `MID_STREAM`.
- Device TTS fallback is permitted only before production audio becomes audible.
- A mid-stream production failure is surfaced instead of replaying the same utterance through device TTS.
- Playback telemetry now records the browser `playing` event rather than the time immediately before `audio.play()`.
- Telemetry exposes whether playback actually became audible.
- Existing deterministic cancellation and object-URL cleanup remain intact.

## Why this precedes incremental playback

The current encoded-audio player buffers the response into a Blob before playback. Future incremental playback can expose the user to partial speech before a stream fails. Without a typed failure boundary, the existing device fallback could then repeat the utterance from the beginning.

This release establishes that boundary first.

## Distributed rate limiting

Cloudflare's Workers Rate Limiting binding is suitable for fast abuse protection and can key limits by authenticated user/session. Cloudflare documents that these counters are local to a Cloudflare location and intentionally permissive/eventually consistent, so they are not an accounting or billing authority. Mio should use them as an edge safety control, not as exact global quota accounting.

No rate-limit binding is committed in V4.4 yet because this repository currently has no Wrangler configuration declaring a Worker binding. Deployment configuration must be confirmed before introducing a namespace/binding rather than inventing one.

## Next

1. Confirm the Cloudflare Worker/Pages deployment topology and binding source of truth.
2. Add a deployment-native per-subject edge rate limiter.
3. Add capability-detected incremental playback, preserving Blob fallback for iOS/iPadOS.
4. Select a separately licensed neural-TTS provider and implement a provider-specific adapter.
5. Add tests around PRE_AUDIO fallback, MID_STREAM no-replay behavior, and playback telemetry.

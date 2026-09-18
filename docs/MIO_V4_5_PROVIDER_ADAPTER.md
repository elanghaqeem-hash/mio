# Mio Voice V4.5 — Provider Adapter and Vocal Identity

## Goal

V4.5 moves Mio from a provider-neutral gateway contract toward a production-capable neural-TTS adapter while preserving Mio's own vocal identity and all V4.4 security boundaries.

## Vocal identity

Mio remains intentionally original rather than a clone of a reference performer. The target is:

- slightly deep
- warm
- mature
- calm
- natural and conversational
- restrained breathiness
- moderate expressiveness
- clear Indonesian-first delivery with English technical terms supported

The existing abstract synthesis profile remains the source of truth. Provider-specific controls are implementation details, not Mio's identity definition.

## Provider modes

### generic

Default and backwards-compatible. The upstream receives Mio's normalized provider-neutral contract:

- text
- locale
- server-owned voice ID
- optional model
- normalized Mio profile

This supports a project-owned gateway or another separately licensed provider adapter.

### openai-compatible

Maps Mio's abstract profile to a speech API contract with:

- model
- server-owned voice
- input
- concise vocal instructions
- MP3 output
- speaking speed

The instructions explicitly require an original, non-imitative Mio identity and prohibit reproducing an identifiable performer/reference recording.

This adapter does not claim every abstract control has a one-to-one provider parameter. Warmth, emotion and delivery direction are mapped through instructions; speaking rate maps to speed. Unsupported controls remain part of Mio's abstract identity for future adapters rather than being silently redefined.

## Configuration

Set server-side deployment variables:

- `MIO_TTS_PROVIDER=generic` or `openai-compatible`
- `MIO_TTS_ENDPOINT`
- `MIO_TTS_VOICE_ID`
- `MIO_TTS_MODEL`
- secret `MIO_TTS_API_KEY`

For `openai-compatible`, model is mandatory. Credentials remain server-side and must never use a `VITE_` prefix.

## Security inherited from V4.4

- verified Cloudflare Access JWT or trusted Mio middleware when sessions are required
- HTTPS-only upstream endpoint
- request body and text limits
- origin controls
- upstream timeout and cancellation
- supported audio media validation
- no provider secret in browser code
- no session identity forwarded to TTS
- deterministic device-TTS fallback

## Next: V4.6

1. Capability-detected low-latency playback using MediaSource only for supported stream/container combinations.
2. Preserve Blob playback as the compatibility path, especially on iOS/iPadOS.
3. Add playback-mode telemetry containing timings/byte counts only, never audio.
4. Add adapter contract tests with mocked provider responses.
5. Run real-device calibration after a licensed production voice/model is configured.

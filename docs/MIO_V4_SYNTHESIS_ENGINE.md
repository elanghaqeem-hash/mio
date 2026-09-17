# Mio Voice V4 — Production Synthesis Engine

## Objective

Give Mio one stable, provider-neutral vocal identity across supported devices instead of depending on the browser/device voice catalog.

## Pipeline

`response text -> language/emotion/prosody planning -> Mio synthesis profile -> production voice adapter -> same-origin gateway -> licensed synthesis provider -> audio stream -> playback -> Voice Runtime V3`

## Identity target

Mio is a feminine young-adult voice with a slightly lower register, warm low-mid character, calm confidence, natural Indonesian articulation, moderate expressiveness, and restrained breathiness. The identity must remain recognizably Mio across locales while allowing language-appropriate pronunciation and prosody.

The profile is intentionally expressed as abstract synthesis controls rather than speaker biometrics.

## Safety and provenance

Production providers MUST use a separately licensed, consented, or project-owned synthetic voice. Third-party performer recordings may only inform broad non-identifying character direction. They MUST NOT be uploaded, enrolled, embedded, cloned, speaker-matched, or used to retain distinctive performer traits.

## Implemented kernel

- `MioSynthesisProfile`: stable Mio character controls.
- `MioSynthesisProvider` and `MioSynthesisRegistry`: provider-neutral synthesis boundary and deterministic selection.
- `MioProsodyPlanner`: semantic-preserving speaking-intent controls.
- `MioSynthesisOrchestrator`: synthesis lifecycle and cancellation owner.
- `HttpSynthesisProvider`: browser-safe same-origin client for `/api/voice/synthesize`.
- `ProductionSynthesisVoiceProvider`: bridge into Voice Runtime V3.
- `MioStreamingAudioPlayer`: deterministic encoded-audio playback/cancellation boundary.
- `functions/api/voice/synthesize.ts`: server-side Cloudflare Pages Function gateway.
- Voice Runtime V3 prefers production synthesis and retries once with device TTS if production synthesis/playback fails.

## Server-side gateway contract

The browser never receives an upstream TTS credential. Configure only deployment-side values:

- `MIO_TTS_ENDPOINT`: licensed TTS service endpoint.
- `MIO_TTS_API_KEY`: secret; configure only in Cloudflare/hosting secret settings.
- `MIO_TTS_VOICE_ID`: identifier for the separately licensed/consented/project-owned Mio voice.
- `MIO_TTS_MODEL`: optional provider model identifier.

Do not prefix any secret or private synthesis configuration with `VITE_`.

The gateway validates JSON/content type, limits text to 8,000 characters, clamps synthesis controls, restricts emotions, applies a 30-second upstream timeout, validates returned audio media types, disables caching, and does not expose provider secrets or voice enrollment data. HEAD/GET readiness checks disclose configuration state only.

## Fallback behavior

1. Runtime asks for `mio-production-synthesis`.
2. Production adapter checks the same-origin gateway.
3. If the gateway is unconfigured/unavailable, provider selection proceeds to device TTS.
4. If the production provider passes readiness but later fails during synthesis or playback, Runtime V3 performs one deterministic retry with device TTS.
5. User interruption aborts the active provider and playback lifecycle.

## Remaining production work

### True low-latency playback

`MioStreamingAudioPlayer` currently consumes encoded chunks and creates a browser-playable blob before playback. The HTTP transport is stream-capable, but playback is not yet genuinely incremental. A later phase should add MediaSource/WebCodecs-compatible buffering where browser support is reliable, retaining the current path as an iOS/Safari-compatible fallback.

### Provider adapter calibration

Different licensed TTS services expose different controls. The server-side adapter should translate Mio's abstract profile into provider-specific parameters without allowing browser clients to choose arbitrary upstream voices or models.

### Abuse controls

Before public production enablement, add deployment-appropriate authentication/session binding and distributed rate limiting. Avoid in-memory-only counters because Cloudflare isolates are not a reliable global quota store.

## Validation

Validate on iPadOS/iOS Safari, Android Chrome, desktop Chrome/Edge/Safari, and representative audio devices. Track startup latency, interruption latency, synthesis failures, fallback rate, and playback underruns. Do not store raw microphone or synthesis audio as telemetry.

## Acceptance criteria

1. The same configured Mio production voice is used across devices.
2. Indonesian is the reference locale; multilingual routing remains supported.
3. User interruption stops output promptly and hands control to STT.
4. Provider readiness or runtime failure falls back without breaking the conversational lifecycle.
5. No provider secret is shipped to the client.
6. No external performer recording is used as a cloning or biometric source.
7. Invalid synthesis controls cannot bypass server-side limits.
8. Public production enablement requires session-aware abuse controls.

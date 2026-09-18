# Mio Voice V4.2 — Production Synthesis Engine

## Objective

Give Mio one stable, provider-neutral vocal identity across supported devices instead of depending on the browser/device voice catalog, while keeping provider credentials and actual voice/model selection under server authority.

## Pipeline

`response text -> language/emotion/prosody planning -> Mio synthesis profile -> production voice adapter -> synthesis gateway -> licensed synthesis provider -> audio stream -> playback -> Voice Runtime V3`

## Identity target

Mio is a feminine young-adult voice with a slightly lower register, warm low-mid character, calm confidence, natural Indonesian articulation, moderate expressiveness, and restrained breathiness. The identity must remain recognizably Mio across locales while allowing language-appropriate pronunciation and prosody.

The profile is intentionally expressed as abstract synthesis controls rather than speaker biometrics.

## Safety and provenance

Production providers MUST use a separately licensed, consented, or project-owned synthetic voice. Third-party performer recordings may only inform broad non-identifying character direction. They MUST NOT be uploaded, enrolled, embedded, cloned, speaker-matched, or used to retain distinctive performer traits.

## Implemented production kernel

- `MioSynthesisProfile`: stable Mio character controls.
- `MioSynthesisProvider` and registry: provider-neutral synthesis boundary and deterministic selection.
- `MioProsodyPlanner`: semantic-preserving speaking-intent controls.
- `MioSynthesisOrchestrator`: synthesis lifecycle and cancellation owner.
- `HttpSynthesisProvider`: browser-safe client for the Mio gateway.
- `ProductionSynthesisVoiceProvider`: bridge into Voice Runtime V3 with stale-session guards and deterministic cancellation.
- `MioStreamingAudioPlayer`: encoded-audio playback boundary with listener cleanup and non-audio latency/byte telemetry.
- `functions/api/voice/synthesize.ts`: Cloudflare Pages Function gateway with bounded body streaming, HTTPS-only upstream endpoint validation, redirect rejection, origin allowlisting and server-owned voice/model identity.
- Voice Runtime V3 prefers production synthesis and retries once with device TTS if production synthesis/playback fails.

## Deployment configuration

Configure only deployment-side values:

- `MIO_TTS_ENDPOINT`: HTTPS endpoint of the licensed TTS service.
- `MIO_TTS_API_KEY`: provider credential; server secret only.
- `MIO_TTS_VOICE_ID`: separately licensed/consented/project-owned Mio voice ID.
- `MIO_TTS_MODEL`: optional provider model identifier.
- `MIO_VOICE_GATEWAY_TOKEN`: optional transitional gateway protection.
- `MIO_VOICE_ALLOWED_ORIGINS`: optional comma-separated additional trusted application origins, useful for packaged desktop shells or a separately hosted frontend.

Do not prefix secrets or private synthesis configuration with `VITE_`. The browser is not allowed to choose the upstream voice ID, model, endpoint or credential.

## Gateway controls

V4.2 validates content type, enforces a 32 KB request-body limit while the body is read (not only from `Content-Length`), limits synthesis text to 8,000 characters, clamps abstract synthesis controls, restricts emotions, applies a 30-second upstream timeout, rejects upstream redirects, requires HTTPS provider endpoints, validates returned audio media types, disables caching and does not expose provider secrets or enrollment data.

HEAD/GET readiness checks disclose configuration state only.

## Authentication and abuse-control boundary

`MIO_VOICE_GATEWAY_TOKEN` remains transitional. Do not ship that token as a static browser secret. Public production should bind synthesis to Mio's application session and enforce distributed quotas at the deployment edge or a durable/shared rate-limit store. In-memory counters are intentionally not used because Cloudflare isolates are not a reliable global quota authority.

## Playback and latency

The HTTP gateway already passes the provider response stream through without buffering it server-side. The browser player currently retains the compatibility-first encoded Blob path, which is reliable on iOS/Safari. V4.2 records only non-audio telemetry: bytes buffered, first-chunk latency and playback-start latency.

A later low-latency path may use MediaSource/WebCodecs or PCM/WebAudio where supported, but it must feature-detect capabilities and retain the current compatibility fallback.

## Fallback behavior

1. Runtime asks for `mio-production-synthesis`.
2. Production adapter checks the gateway.
3. If unconfigured/unavailable, provider selection proceeds to device TTS.
4. If production passes readiness but fails during synthesis/playback, Runtime V3 retries once with device TTS.
5. User interruption aborts the active synthesis session, player and provider lifecycle.
6. Stale synthesis sessions cannot reclaim active playback ownership.

## Remaining production work

1. Bind gateway authorization to the application's authenticated session.
2. Add deployment-native distributed rate limiting once the production Cloudflare topology and quota policy are fixed.
3. Select a licensed neural-TTS provider and implement provider-specific mapping of Mio's abstract controls.
4. Add capability-detected low-latency browser playback without regressing iPadOS/iOS Safari.
5. Run cross-device calibration and acceptance testing.

## Validation

Validate on iPadOS/iOS Safari, Android Chrome, desktop Chrome/Edge/Safari and representative audio devices. Track startup latency, interruption latency, synthesis failures, fallback rate and playback underruns. Do not store raw microphone or synthesis audio as telemetry.

## Acceptance criteria

1. The same configured Mio production voice is used across devices.
2. Indonesian is the reference locale; multilingual routing remains supported.
3. User interruption stops output promptly and hands control to STT.
4. Provider readiness or runtime failure falls back without breaking the conversational lifecycle.
5. No provider secret is shipped to the client.
6. No external performer recording is used as a cloning or biometric source.
7. Invalid synthesis controls cannot bypass server-side limits.
8. Public production enablement requires session-aware distributed abuse controls.
9. Upstream voice/model identity remains server-owned.
10. Browser low-latency enhancements must retain a tested iOS/Safari fallback.

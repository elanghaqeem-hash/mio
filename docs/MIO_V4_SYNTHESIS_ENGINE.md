# Mio Voice V4 — Production Synthesis Engine

## Objective

Give Mio one stable, provider-neutral vocal identity across supported devices instead of depending on the browser/device voice catalog.

## Pipeline

`response text -> language/emotion/prosody planning -> Mio synthesis profile -> licensed synthesis provider -> streaming audio -> playback -> Voice Runtime V3`

## Identity target

Mio is a feminine young-adult voice with a slightly lower register, warm low-mid character, calm confidence, natural Indonesian articulation, moderate expressiveness, and restrained breathiness. The identity must remain recognizably Mio across locales while allowing language-appropriate pronunciation and prosody.

The profile is intentionally expressed as abstract synthesis controls rather than speaker biometrics.

## Safety and provenance

Production providers MUST use a separately licensed, consented, or project-owned synthetic voice. Third-party performer recordings may only inform broad non-identifying character direction. They MUST NOT be uploaded, enrolled, embedded, cloned, speaker-matched, or used to retain distinctive performer traits.

## Phase 1 — provider-neutral kernel

- `MioSynthesisProfile`: stable Mio character controls.
- `MioSynthesisProvider`: streaming synthesis contract.
- Existing Voice Runtime V3 remains the conversational lifecycle owner.
- Device Web Speech remains fallback until a production provider is configured.

## Phase 2 — synthesis orchestration

Add a production adapter and registry bridge that can prefer production streaming TTS and fall back to device TTS. Provider credentials must remain server-side/environment secrets and never be committed to the repository or exposed to browser bundles.

## Phase 3 — playback and interruption

Implement chunked audio playback with deterministic cancellation, low startup latency, buffering/backpressure, barge-in, and lifecycle settlement compatible with `MioVoiceTurnManager`.

## Phase 4 — prosody planner

Derive speaking intent from Mio's response without changing semantic content. Supported controls should include locale, emotion, speaking rate, pauses, emphasis, warmth, and expressiveness. Technical terms should retain their intended pronunciation/language where practical.

## Phase 5 — validation

Validate on iPadOS/iOS Safari, Android Chrome, desktop Chrome/Edge/Safari, and representative audio devices. Track startup latency, interruption latency, synthesis failures, fallback rate, and playback underruns. Do not store raw microphone or synthesis audio as telemetry.

## Initial acceptance criteria

1. The same configured Mio production voice is used across devices.
2. Indonesian is the reference locale; multilingual routing remains supported.
3. User interruption stops output promptly and hands control to STT.
4. Provider failure falls back without breaking the conversational lifecycle.
5. No provider secret is shipped to the client.
6. No external performer recording is used as a cloning or biometric source.

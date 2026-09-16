# Mio V2 Voice Identity

Mio V2 uses an original Indonesian voice identity with a warm, slightly deeper, calm and mature presentation.

## Reference policy

External recordings are **character references only**. They must not be shipped as Mio's voice, used for speaker cloning, or used to reproduce/biometric-match the reference speaker. Production synthesis must use an independently provided or appropriately licensed base voice.

## Default browser profile

- Locale: `id-ID`
- Rate: `0.94`
- Pitch: `0.82`
- Volume: `1.0`
- Test phrase: `Test, ini Mio V2, salam kenal.`

The browser implementation is in `src/services/MioVoiceService.ts`. It uses Web Speech synthesis as a safe fallback and selects an Indonesian voice available on the user's device.

## Production architecture

Keep the `MioVoiceService` API as the application-facing voice layer. A future native/cloud TTS adapter can replace Web Speech without changing Mio's conversational UI. The production voice should preserve the Mio character targets (warm, calm, slightly deeper, clear Indonesian articulation) while remaining a distinct voice identity.

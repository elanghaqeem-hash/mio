# Mio Voice V1 Runtime Verification Harness

Use the production GET `/api/voice/synthesize` metadata as a sanitized runtime probe. Verification requires HTTP 200, engine `v4.7`, `ready=true`, and—when enabled—configured session verification and distributed rate-limit binding.

The probe evaluates public readiness booleans only. It must not collect provider secrets, gateway tokens, session subjects/IDs, synthesis text, raw audio or speaker biometric data.

A passing metadata probe verifies gateway configuration state, not provider audio quality or physical-device playback. Those remain separate V1 production evidence items.

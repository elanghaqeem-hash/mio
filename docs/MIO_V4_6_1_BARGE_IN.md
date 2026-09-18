# Mio Voice V4.6.1 — Barge-In Hardening

V4.6.1 connects the existing local energy VAD and Turn Manager interruption path with conservative gating suitable for real conversational playback.

## Behaviour

During MIO_TURN, an active VAD event can interrupt speech only when auto interruption is enabled. The event must exceed a configurable minimum level and occur outside a short cooldown window. The existing pending-interrupt guard prevents duplicate concurrent interrupts.

Defaults:

- minimum RMS level: 0.045
- interruption cooldown: 650 ms

Both can be tuned through MioVoiceTurnOptions without changing the VAD's ambient-noise adaptation.

## Safety and privacy

VAD remains local and energy-only. Audio is not retained or transmitted by the detector. The interruption callback receives only activity state, optional level and timestamp.

## Why two gates

The VAD already uses adaptive noise-floor, attack and release hysteresis. The Turn Manager adds a second conservative gate because an interruption has a higher UX cost than ordinary activity detection. This reduces accidental self-interruption from speaker leakage, transient noise and rapid repeated activity events.

## Next

- real-device echo/leakage calibration
- optional post-playback microphone guard window
- underrun/rebuffer telemetry
- adaptive playback prebuffer
- integration tests for interruption state transitions

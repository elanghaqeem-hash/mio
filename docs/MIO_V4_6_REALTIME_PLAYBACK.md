# Mio Voice V4.6 — Real-Time Playback Engine

V4.6 introduces capability-aware incremental playback while preserving the compatibility path required by Safari/iOS/iPadOS and other browsers where MediaSource cannot safely consume the returned audio stream.

## Playback policy

1. Read the first synthesis chunk.
2. If MediaSource exists and explicitly reports the MIME type as supported, use the incremental MediaSource path.
3. Append chunks sequentially with SourceBuffer backpressure.
4. Begin playback after the first append instead of waiting for the complete response.
5. If MediaSource is unavailable or the runtime path fails before usable playback, use the existing Blob compatibility path.
6. Cancellation increments a generation token, pauses active audio and revokes object URLs deterministically.

## Privacy-safe telemetry

Telemetry contains operational measurements only:

- buffered bytes
- first chunk latency
- first audible latency
- playback-start latency
- playback mode
- append count

No raw audio, transcript, prompt, speaker embedding or biometric information is stored by this player.

## Compatibility

The Blob path remains first-class rather than being treated as an error. This is particularly important for Apple browser runtimes and for encoded stream/container combinations that MediaSource does not support.

## Next hardening

- browser/device contract tests
- underrun/rebuffer telemetry
- bounded prebuffer threshold for unstable networks
- explicit barge-in integration with Voice Turn Manager/VAD
- production calibration with a separately licensed Mio voice

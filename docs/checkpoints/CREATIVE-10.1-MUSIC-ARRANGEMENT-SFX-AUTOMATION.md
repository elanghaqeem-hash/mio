# Creative Engine 10.1 — Music Arrangement & Advanced SFX Automation

## Scope
Builds on the merged 10.0 audio authoring core. This checkpoint introduces deterministic domain primitives required by richer DAW-style Music and SFX interfaces while preserving the existing .miomusic/.miosfx compatibility layer.

## Music Studio
- Bounded piano-roll note move and resize transactions.
- Reusable arrangement clips with start, length, source offset and loop semantics.
- Arrangement normalization removes dangling track references and bounds clips to the composition.
- Deterministic clip-to-note expansion for playback/render adapters.
- Peak/RMS/dB meter model for future mixer UI.
- Existing quantize, transpose, tempo, mixer, persistence and WAV path remain intact.

## SFX Studio
- Typed automation lanes for pitch, filter, resonance, distortion, delay, feedback, spatial mix and volume.
- Automation point sorting, time/value bounds and duplicate-time resolution.
- Deterministic linear automation evaluation suitable for both live and offline render adapters.
- Existing procedural synthesis/effects remain compatible.

## Validation
Creative Audio tests now cover move/resize boundaries, arrangement reference integrity, loop expansion, meter output, automation bounds and interpolation in addition to the 10.0 regression set.

## Next UI checkpoint
10.2 should wire these primitives into native interaction surfaces: arrangement timeline, draggable/resizable piano-roll notes, quantize/transpose controls, mixer meters, and SFX automation-lane editor. A later checkpoint can introduce sample assets, drum pads/sequencer, buses/sends, stems/MIDI export, mastering and richer SFX sources.

## Scope honesty
This checkpoint does not claim full DAW parity, VST/AU hosting, sample destructive editing, real-time collaborative sessions, or deployed interactive audio E2E.

# Creative Engine 1.6 — SFX and Music Workspaces

## Scope

This checkpoint closes stored-but-inactive audio controls and expands the existing SFX and Music studios using familiar Reaper, FL Studio, and BandLab interaction patterns. It remains a bounded browser-native audio engine rather than claiming DAW parity.

## Delivered

### SFX Studio

- Bounded ADSR timing with explicit release inside patch duration.
- Distortion waveshaping, delay time, feedback, resonance, and spatial/wet mix now participate in live and offline audio graphs.
- Inspector controls expose the effect parameters already present in `.miosfx` documents.
- Existing layered synthesis, oscilloscope, emergency stop, and WAV export remain intact.

### Music Studio

- Mixer pan, solo, mute, and volume now affect playback and offline rendering.
- Track creation and expanded mixer controls.
- Piano-roll note selection plus duration, velocity, and delete editing.
- Stereo offline WAV export with correct `MUSIC` activity attribution.
- Shared deterministic helpers for sixteenth-note duration and audible-track routing.

## Capability matrix

| Area | Ready in 1.6 | Deferred |
|---|---|---|
| SFX synthesis | Layered oscillators, pitch sweep, ADSR, filter | Samples, granular, modulation matrix |
| SFX effects | Distortion, delay/feedback, spatial mix | Convolution IR library, automation lanes, plugin hosting |
| Music sequencing | Piano roll, note length/velocity, tempo, loop | Drag/resize notes, quantize, chords, arrangement clips |
| Mixer | Volume, pan, mute, solo | Sends, buses, inserts, metering, automation |
| Instruments | Built-in oscillator voices | Sampler, soundfonts, external MIDI/VST |
| Export | Offline stereo WAV | Stems, MIDI, MP3/AAC, mastering chain |
| Collaboration | Local persistent project | Cloud sessions, comments, live collaboration |

## Compatibility and safety

- Existing `.miosfx` and `.miomusic` fields are activated without renaming formats or IDs.
- Mixer, note, and effect edits remain command-based and survive undo, redo, autosave, recovery, and reopen.
- Emergency stop continues to suspend active audio.
- Offline export is permission-gated; no external audio service or provider secret is introduced.

## Validation gate

- Solo/mute routing, tempo math, bounded envelope timing, effect persistence, and mixer history tests pass.
- Lint, TypeScript, web/Electron builds, release checks, and full tests pass.
- GitHub Validation and Cloudflare Web Build pass before merge.

## Next checkpoint

Complete a cross-studio integration audit, improve keyboard/accessibility consistency, and wire governed Creative Orchestrator handoffs without granting it direct mutation authority.

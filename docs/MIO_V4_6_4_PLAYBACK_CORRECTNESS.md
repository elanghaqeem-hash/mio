# Mio Voice V4.6.4 — Playback Correctness Foundation

V4.6.4 hardens the streaming player before adaptive buffering is introduced.

## Correctness changes

- First-chunk latency starts before the first iterator read and ignores empty leading chunks.
- First-audible latency is measured from the playback request boundary to the browser `playing` event, rather than treating resolution of `audio.play()` as audible output.
- MediaSource-to-Blob fallback is allowed only before the first encoded chunk is committed to MediaSource.
- Once incremental playback has committed, a MediaSource runtime failure is surfaced deterministically instead of rebuilding a potentially incomplete Blob from an already-consumed iterator.
- Existing bounded two-chunk startup prebuffer and privacy-safe telemetry remain unchanged.

## Adaptive controller gate

Adaptive prebuffering remains intentionally disabled in this patch. A later V4.6.4 follow-up may use corrected telemetry to select a small bounded target without storing audio or transcript content.

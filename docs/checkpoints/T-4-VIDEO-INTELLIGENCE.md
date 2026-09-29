# T-4 Video Intelligence Engine

Status date: 2026-09-29
Status: COMPLETE

## Goal
Extend Mio's accepted file/image/document intelligence foundations into bounded, provenance-aware video understanding without claiming decoder/model capabilities that are not connected.

## Timeline
- T-4.01#A — COMPLETE: canonical video probe/stream metadata contracts with explicit local/external provenance.
- T-4.01#B — COMPLETE: duration/bitrate/dimensions/frame-rate/sample-rate/channels/codec/container validation plus deterministic primary-video selection.
- T-4.02#A — COMPLETE: deterministic uniform sampling plus bounded scene-candidate merge contract.
- T-4.02#B — COMPLETE: default 12 / maximum 120 sample budget with deterministic millisecond timestamps.
- T-4.03#A — COMPLETE (bridge): extracted-frame evidence is validated and marked ready for T-3 image intelligence with decoder provenance; actual frame decoding remains an external dependency.
- T-4.04#A — COMPLETE (contract): scene/activity/screen-recording/title-card/dialogue semantics require sampled-frame evidence, confidence, and explicit heuristic/local/external-model provenance; no semantic model is claimed connected.
- T-4.05#A — COMPLETE: bounded sampled-frame dHash fingerprint contract and normalized 0..1 perceptual similarity; exact duplicate identity remains T-2 SHA-256.
- T-4.06#A — COMPLETE (planning boundary): transcode/clip plans are duration-validated, non-executing, and explicitly approval-gated; no encoder/transcoder is claimed connected.
- T-4.07#A — COMPLETE: required CI/build/validation workflows passed on implementation head; branch verified 25 commits ahead / 0 behind main.

## Boundary
Metadata/probe evidence, decoded frames, and model-derived semantics must retain provenance. Video decoding/transcoding is not claimed until a concrete local adapter is implemented and tested.

## Acceptance evidence

- Required workflows: Mio CI, MIO Validation Gate, MIO Training Runner Contract, and Cloudflare Web Build all SUCCESS on the implementation head.
- No FFmpeg/ffprobe/encoder dependency is present; decoding/transcoding execution is therefore not claimed.
- T-4.03 is an extracted-frame bridge boundary, T-4.04 is a grounded semantic contract, and T-4.06 is planning-only with explicit approval requirement.

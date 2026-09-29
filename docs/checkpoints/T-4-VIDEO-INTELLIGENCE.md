# T-4 Video Intelligence Engine

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Extend Mio's accepted file/image/document intelligence foundations into bounded, provenance-aware video understanding without claiming decoder/model capabilities that are not connected.

## Timeline
- T-4.01#A — COMPLETE: canonical video probe/stream metadata contracts with explicit local/external provenance.
- T-4.01#B — COMPLETE: duration/bitrate/dimensions/frame-rate/sample-rate/channels/codec/container validation plus deterministic primary-video selection.
- T-4.02#A — PLANNED: scene/keyframe sampling contract.
- T-4.02#B — PLANNED: bounded sampling budgets and deterministic timestamps.
- T-4.03#A — PLANNED: reuse T-3 image intelligence for extracted frames.
- T-4.04#A — PLANNED: evidence-grounded activity/scene/screen-recording semantics.
- T-4.05#A — PLANNED: similarity/fingerprint contracts.
- T-4.06#A — PLANNED: safe transcode/clip planning boundary.
- T-4.07#A — PLANNED: acceptance gate.

## Boundary
Metadata/probe evidence, decoded frames, and model-derived semantics must retain provenance. Video decoding/transcoding is not claimed until a concrete local adapter is implemented and tested.

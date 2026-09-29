# T-4 Video Intelligence Engine

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Extend Mio's accepted file/image/document intelligence foundations into bounded, provenance-aware video understanding without claiming decoder/model capabilities that are not connected.

## Timeline
- T-4.01#A — COMPLETE: canonical video probe/stream metadata contracts with explicit local/external provenance.
- T-4.01#B — COMPLETE: duration/bitrate/dimensions/frame-rate/sample-rate/channels/codec/container validation plus deterministic primary-video selection.
- T-4.02#A — COMPLETE: deterministic uniform sampling plus bounded scene-candidate merge contract.
- T-4.02#B — COMPLETE: default 12 / maximum 120 sample budget with deterministic millisecond timestamps.
- T-4.03#A — COMPLETE (bridge): extracted-frame evidence is validated and marked ready for T-3 image intelligence with decoder provenance; actual frame decoding remains an external dependency.
- T-4.04#A — COMPLETE (contract): scene/activity/screen-recording/title-card/dialogue semantics require sampled-frame evidence, confidence, and explicit heuristic/local/external-model provenance; no semantic model is claimed connected.
- T-4.05#A — PLANNED: similarity/fingerprint contracts.
- T-4.06#A — PLANNED: safe transcode/clip planning boundary.
- T-4.07#A — PLANNED: acceptance gate.

## Boundary
Metadata/probe evidence, decoded frames, and model-derived semantics must retain provenance. Video decoding/transcoding is not claimed until a concrete local adapter is implemented and tested.

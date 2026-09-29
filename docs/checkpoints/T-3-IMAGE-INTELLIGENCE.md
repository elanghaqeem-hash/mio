# T-3 Image Intelligence Engine

Status date: 2026-09-29

## Goal

Turn image assets discovered by T-2 into locally inspectable visual assets before any optional model-based semantic analysis. Technical inspection and quality signals remain deterministic and local-first.

## Timeline

- T-3.01#A — COMPLETE: canonical image technical metadata contract.
- T-3.01#B — COMPLETE: PNG IHDR dimension/color/alpha inspection.
- T-3.01#C — COMPLETE: GIF logical-screen dimension inspection.
- T-3.01#D — COMPLETE: bounded JPEG SOF dimension inspection.
- T-3.02#A — COMPLETE: aspect ratio and landscape/portrait/square orientation.
- T-3.02#B — COMPLETE: megapixel and deterministic resolution-class signals.
- T-3.02#C — COMPLETE: likely-thumbnail and extreme-aspect signals.
- T-3.03#A — COMPLETE: bounded local-only preview sizing policy with aspect preservation and no-upscale default.
- T-3.03#B — COMPLETE: bounded JPEG EXIF orientation parsing and display rotation/mirroring normalization.
- T-3.04#A — COMPLETE: canonical PHOTO/SCREENSHOT/SCANNED_DOCUMENT/ILLUSTRATION/GRAPHIC/UNKNOWN classes.
- T-3.04#B — COMPLETE: deterministic local-feature classification contract for screenshot/document/photo/graphic/illustration.
- T-3.04#C — COMPLETE: scene/object/text/UI signal schema with confidence validation.
- T-3.04#D — COMPLETE: LOCAL_HEURISTIC/LOCAL_MODEL/EXTERNAL_MODEL provenance enforcement; model-derived signals require modelId.
- T-3.05#A–#C — PENDING: OCR, language and text index.
- T-3.06#A–#C — PENDING: blur/exposure/quality signals.
- T-3.07#A–#C — PENDING: perceptual fingerprint, similarity and clustering.
- T-3.08#A — PENDING: acceptance gate.

## Privacy boundary

T-3.01–T-3.03 are local deterministic inspection stages. Workspace authorization alone does not grant permission to upload an image to an external AI/vision provider.

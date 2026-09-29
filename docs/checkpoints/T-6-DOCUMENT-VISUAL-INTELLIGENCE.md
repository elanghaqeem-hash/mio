# T-6 Document Visual Intelligence

Status date: 2026-09-29

## Goal

Extend Mio's accepted T-2/T-3 intelligence pipeline to documents while preserving evidence provenance and avoiding false claims of full parsing when only bounded inspection is available.

## Timeline

- T-6.01#A — COMPLETE: canonical PDF inspection contract.
- T-6.01#B — COMPLETE: bounded PDF native-text/image evidence classification.
- T-6.01#C — COMPLETE: bounded PDF page-marker/title evidence.
- T-6.02#A — COMPLETE: DOCX identification from OOXML internal entries.
- T-6.02#B — COMPLETE: XLSX identification from OOXML worksheet entries.
- T-6.02#C — COMPLETE: PPTX identification from OOXML slide entries.
- T-6.02#D — COMPLETE: Office media evidence and mixed-content classification.
- T-6.03#A — COMPLETE: bounded stored/deflate ZIP reader integrated through authorized workspace, trusted IPC and preload; only known OOXML text entries are exposed.
- T-6.03#B — COMPLETE: bounded native text extraction adapters for DOCX/PPTX/XLSX XML entries (2MiB entry ceiling, 500k-character output ceiling).
- T-6.04#A — COMPLETE: canonical page-layout and typed visual-region schema (heading, paragraph, table, image, chart, form, header/footer, list, caption).
- T-6.04#B — COMPLETE: bounded coordinate normalization/clipping into shared 0..1 page space.
- T-6.04#C — COMPLETE: provenance-aware region validation and deterministic reading-order sorting.
- T-6.05#A — COMPLETE: provenance-safe mapping from T-3 OCR results into document page regions.
- T-6.05#B — COMPLETE: OCR engine/language/local-vs-external provenance propagation and deterministic reading order.
- T-6.05#C — COMPLETE (adapter boundary): bounded rendered-page input validates page/pixel provenance, enforces a 4MP budget, and normalizes grayscale for T-3 OCR/quality/vision. Raw PDF rasterization remains an explicit renderer dependency and is not claimed by this milestone.
- T-6.06#A–#D — PENDING: document type/topic/entity/summary semantics with provenance.
- T-6.07#A–#C — PENDING: document relationships and embedded-asset references.
- T-6.08#A — PENDING: acceptance gate.

## Boundary

A bounded PDF byte sample can provide evidence, not a guaranteed full-document page count or integrity verdict. OOXML format identity must come from package entries rather than file extension alone.

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
- T-6.03#A — NEXT: bounded package-entry reader integration.
- T-6.03#B — NEXT: native text extraction adapters.
- T-6.04#A–#C — PENDING: document layout and visual region schema.
- T-6.05#A–#C — PENDING: scanned-page routing through T-3 OCR/vision contracts.
- T-6.06#A–#D — PENDING: document type/topic/entity/summary semantics with provenance.
- T-6.07#A–#C — PENDING: document relationships and embedded-asset references.
- T-6.08#A — PENDING: acceptance gate.

## Boundary

A bounded PDF byte sample can provide evidence, not a guaranteed full-document page count or integrity verdict. OOXML format identity must come from package entries rather than file extension alone.

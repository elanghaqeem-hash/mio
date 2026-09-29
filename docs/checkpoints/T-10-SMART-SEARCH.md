# T-10 Smart Search

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Provide bounded, evidence-grounded search across filenames, metadata, extracted text, semantic embeddings, visual/cross-modal evidence, and natural-language query plans.

## Timeline
- T-10.01#A — IN PROGRESS: search query/result schema and invariants.
- T-10.02#A — PLANNED: filename and metadata lexical search.
- T-10.03#A — PLANNED: bounded full-text search.
- T-10.04#A — PLANNED: semantic embedding search.
- T-10.05#A — PLANNED: visual/cross-modal search bridge.
- T-10.06#A — PLANNED: natural-language query planning contract.
- T-10.07#A — PLANNED: deterministic ranking and provenance.
- T-10.08#A — PLANNED: acceptance gate.

## Boundary
Search results must retain evidence and source provenance. No NLP, embedding, OCR, vision, or speech model is considered operational unless a concrete accepted adapter exists.

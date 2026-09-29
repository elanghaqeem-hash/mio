# T-10 Smart Search

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Provide bounded, evidence-grounded search across filenames, metadata, extracted text, semantic embeddings, visual/cross-modal evidence, and natural-language query plans.

## Timeline
- T-10.01#A — COMPLETE: bounded query/result schema with evidence provenance.
- T-10.02#A — COMPLETE: deterministic filename and metadata lexical search.
- T-10.03#A — COMPLETE: bounded full-text matching with local snippets/locators.
- T-10.04#A — COMPLETE: compatible-model semantic embedding search.
- T-10.05#A — COMPLETE: cross-modal embedding search bridge with modality evidence.
- T-10.06#A — COMPLETE (contract): validated rules/local-model/external-model query plans with explicit provenance.
- T-10.07#A — COMPLETE: deterministic evidence-aware ranking preserving source provenance.
- T-10.08#A — PLANNED: acceptance gate.

## Boundary
Search results must retain evidence and source provenance. No NLP, embedding, OCR, vision, or speech model is considered operational unless a concrete accepted adapter exists.

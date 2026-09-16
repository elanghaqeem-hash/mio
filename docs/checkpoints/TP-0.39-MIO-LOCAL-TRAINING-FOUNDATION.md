# TP-0.39 — MIO Local Training Foundation

## Goal

Establish a governed, reproducible foundation for improving MIO Local without turning user conversations or project data into training data by default.

## Delivered

- `src/training/TrainingDataset.ts`
  - versioned MIO training-example schema
  - provenance, privacy/copyright review, approval, quality scores
  - eligibility gate and JSONL export
- `src/training/FeedbackCollector.ts`
  - isolated `training` storage namespace
  - explicit training consent required before corrected feedback can become a candidate
  - candidates remain unapproved until review
- `src/training/MioBench.ts`
  - deterministic benchmark registry/runner
  - baseline domains: general, reasoning, coding, research honesty, prompt-injection resistance, tool boundaries
- `training/sft_lora.py`
  - LoRA/QLoRA supervised fine-tuning entrypoint
  - conversational prompt/completion conversion
  - optional 4-bit NF4 loading
- `training/requirements.txt`
  - training-only Python dependencies, isolated from application runtime
- `training/README.md`
  - governance, environment, LoRA/QLoRA, promotion workflow
- training artifact/data ignore rules
- automated training-foundation regression tests

## Governance invariant

Training eligibility requires all of the following:

1. valid schema;
2. explicit `trainingApproved`;
3. privacy review;
4. copyright review;
5. minimum quality score 4/5 for factuality, instruction following, and safety.

User-contributed feedback is opt-in. Consent alone never makes it eligible. `toTrainingCandidate()` deliberately returns a candidate with `trainingApproved=false`, `copyrightReviewed=false`, and zero quality scores.

## Dataset boundary

The trainer must only consume JSONL exported from the governed training dataset layer. It must not read MIO chat history, Project Knowledge, browser history, memory storage, or feedback storage directly.

## Model progression

- Base baseline: `Qwen/Qwen3-8B`
- Experimental adapters: `Mio-Local-8B-v0.x`
- Release candidate: `Mio-Local-8B-v1-rc`
- Promoted model/adapter: `Mio-Local-8B-v1`

Training completion is not promotion. A candidate must pass MioBench and existing system/security/tool regressions before being selected as the MIO Local default.

## Deferred checkpoints

- TP-0.40: benchmark persistence, model manifest, promotion gate, comparative baseline reports
- TP-0.41: governed browser tool / Playwright bridge
- TP-0.42: additional local inference backends (vLLM / llama.cpp)
- Later: DPO/preference pipeline after sufficient reviewed preference data exists

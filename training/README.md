# MIO Local Training

This folder contains offline training tooling for MIO Local. It is intentionally isolated from the application runtime: installing or running MIO does not install PyTorch, TRL, PEFT, or bitsandbytes.

## Governance first

Do not point the trainer directly at chat history, project files, browser data, or feedback storage.

The required flow is:

1. Build or import candidate examples into the MIO training schema.
2. Record provenance for every example.
3. Complete privacy and copyright review.
4. Score factuality, instruction following, safety, and tool use where applicable.
5. Set `trainingApproved` only after human/controlled review.
6. Export only examples for which `isTrainingEligible(...)` returns true.
7. Run MioBench on the base model before training and on the candidate adapter afterward.

User feedback is opt-in and never becomes trainable merely because it was stored. `FeedbackCollector.toTrainingCandidate()` deliberately creates an unapproved candidate requiring further review.

## Environment

Create a dedicated Python environment, preferably on a GPU workstation or training server:

```bash
python -m venv .venv-training
source .venv-training/bin/activate   # Windows: .venv-training\Scripts\activate
pip install -r training/requirements.txt
```

## Dataset format

The trainer consumes JSONL produced by `exportEligibleTrainingJsonl`. Example row:

```json
{"id":"seed:router-001","domain":"GENERAL","language":"id","messages":[{"role":"user","content":"Apa fungsi model router?"},{"role":"assistant","content":"Model router memilih provider/model yang sesuai dengan kebijakan, konektivitas, dan kebutuhan tugas."}],"provenance":{"kind":"CURATED","createdAt":1789520000000},"tags":["seed"]}
```

Each row must contain at least two messages and end with an assistant message. The Python loader converts this to conversational prompt/completion records so supervised loss is applied to the completion.

## LoRA training

```bash
python training/sft_lora.py \
  --dataset /path/to/mio-sft-v1.jsonl \
  --model Qwen/Qwen3-8B \
  --output-dir training/output/mio-local-8b-v1-lora \
  --bf16
```

## QLoRA training

For compatible hardware/backends, 4-bit NF4 loading substantially reduces base-model memory use:

```bash
python training/sft_lora.py \
  --dataset /path/to/mio-sft-v1.jsonl \
  --model Qwen/Qwen3-8B \
  --output-dir training/output/mio-local-8b-v1-qlora \
  --qlora \
  --bf16
```

Do not promote an adapter to MIO Local solely because training completed. Promotion requires regression evaluation, safety/tool-boundary tests, and an explicit model manifest/version checkpoint.

## Recommended progression

- `Mio-Local-8B-v0`: untouched base model baseline.
- `Mio-Local-8B-v0.x`: experimental adapters; never default.
- `Mio-Local-8B-v1-rc`: candidate that passes MioBench and security/tool regression gates.
- `Mio-Local-8B-v1`: promoted adapter/model after documented review.

Model weights and large datasets must not be committed to this repository.

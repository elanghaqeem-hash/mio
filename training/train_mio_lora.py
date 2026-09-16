#!/usr/bin/env python3
"""MIO governed LoRA/QLoRA training runner.

This runner consumes only a verified TP-0.46 training bundle. It never uploads,
promotes, activates, or deploys a trained model. `--dry-run` and `--self-test`
use only the Python standard library and do not load ML dependencies or weights.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BUNDLE_FORMAT = "MIO_CHAT_SFT_JSONL_V1"
EXPECTED_DATA_FILE = "train.jsonl"
EXPECTED_MANIFEST_FILE = "manifest.json"
ALLOWED_METHODS = {"LORA", "QLORA"}


class BundleError(RuntimeError):
    pass


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise BundleError(f"Required bundle file is missing: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise BundleError(f"Invalid JSON in {path.name}: {exc}") from exc


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise BundleError(message)


def verify_bundle_directory(bundle_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    bundle_dir = bundle_dir.resolve()
    manifest_path = bundle_dir / EXPECTED_MANIFEST_FILE
    data_path = bundle_dir / EXPECTED_DATA_FILE
    manifest = read_json(manifest_path)

    _require(isinstance(manifest, dict), "Manifest must be a JSON object")
    _require(manifest.get("schemaVersion") == 1, "Unsupported training bundle schema version")
    _require(manifest.get("format") == BUNDLE_FORMAT, "Unsupported training bundle format")
    _require(manifest.get("promotionStatus") == "NOT_EVALUATED", "Training bundle must be NOT_EVALUATED")
    _require(manifest.get("files") == {"trainingData": EXPECTED_DATA_FILE, "manifest": EXPECTED_MANIFEST_FILE}, "Bundle file contract is invalid")

    config = manifest.get("config")
    dataset_meta = manifest.get("dataset")
    reproducibility = manifest.get("reproducibility")
    _require(isinstance(config, dict), "Manifest config is missing")
    _require(isinstance(dataset_meta, dict), "Manifest dataset metadata is missing")
    _require(isinstance(reproducibility, dict), "Manifest reproducibility metadata is missing")
    _require(config.get("trainingMethod") in ALLOWED_METHODS, "Training method must be LORA or QLORA")
    _require(reproducibility.get("canonicalization") == "stable-json-v1", "Unsupported canonicalization contract")
    _require(reproducibility.get("sortKey") == "example.id", "Unsupported training row sort contract")

    try:
        training_text = data_path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise BundleError(f"Required bundle file is missing: {EXPECTED_DATA_FILE}") from exc

    dataset_hash = sha256_text(training_text)
    config_hash = sha256_text(stable_json(config))
    _require(dataset_hash == dataset_meta.get("sha256"), "Dataset SHA-256 does not match manifest")
    _require(dataset_hash == reproducibility.get("datasetSha256"), "Reproducibility dataset SHA-256 mismatch")
    _require(config_hash == reproducibility.get("configSha256"), "Config SHA-256 does not match manifest")

    expected_bundle_id = f"mio-train-{dataset_hash[:12]}-{config_hash[:12]}"
    _require(manifest.get("bundleId") == expected_bundle_id, "Bundle id does not match dataset/config fingerprints")

    rows: list[dict[str, Any]] = []
    ids: list[str] = []
    if training_text:
        for line_number, raw_line in enumerate(training_text.split("\n"), start=1):
            try:
                row = json.loads(raw_line)
            except json.JSONDecodeError as exc:
                raise BundleError(f"Invalid training JSONL at line {line_number}: {exc}") from exc
            _require(isinstance(row, dict), f"Training line {line_number} must be a JSON object")
            example_id = row.get("id")
            messages = row.get("messages")
            _require(isinstance(example_id, str) and bool(example_id.strip()), f"Training line {line_number} has no id")
            _require(isinstance(messages, list) and len(messages) >= 2, f"Training line {line_number} has invalid messages")
            _require(isinstance(messages[-1], dict) and messages[-1].get("role") == "assistant", f"Training line {line_number} must end with assistant")
            ids.append(example_id)
            rows.append(row)

    _require(len(ids) == len(set(ids)), "Training JSONL contains duplicate ids")
    _require(len(rows) == dataset_meta.get("exampleCount"), "Training example count does not match manifest")
    _require(ids == dataset_meta.get("eligibleExampleIds"), "Training example ids/order do not match manifest")
    _require(len(rows) > 0, "Training bundle contains no examples")

    required_domains = config.get("requiredDomains") or []
    present_domains = {row.get("domain") for row in rows}
    missing_domains = [domain for domain in required_domains if domain not in present_domains]
    _require(not missing_domains, f"Training bundle is missing required domains: {', '.join(missing_domains)}")

    return manifest, rows


def _compute_dtype(torch: Any) -> Any:
    if torch.cuda.is_available():
        if getattr(torch.cuda, "is_bf16_supported", lambda: False)():
            return torch.bfloat16
        return torch.float16
    return torch.float32


def run_training(manifest: dict[str, Any], rows: list[dict[str, Any]], output_dir: Path, overwrite: bool) -> None:
    config = manifest["config"]
    method = config["trainingMethod"]

    if output_dir.exists() and any(output_dir.iterdir()):
        if not overwrite:
            raise BundleError(f"Refusing to overwrite non-empty output directory without --overwrite: {output_dir}")
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, prepare_model_for_kbit_training
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from trl import SFTConfig, SFTTrainer
    except ImportError as exc:
        raise BundleError(
            "Training dependencies are unavailable. Install training/requirements.txt in an isolated Python environment."
        ) from exc

    if method == "QLORA" and not torch.cuda.is_available():
        raise BundleError("QLoRA training requires a CUDA-capable runtime in this MIO runner")

    compute_dtype = _compute_dtype(torch)
    base_model = config["baseModel"]
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=False)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model_kwargs: dict[str, Any] = {
        "trust_remote_code": False,
        "use_cache": False,
    }
    if method == "QLORA":
        model_kwargs.update(
            {
                "quantization_config": BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_compute_dtype=compute_dtype,
                ),
                "device_map": {"": 0},
            }
        )
    else:
        model_kwargs["dtype"] = compute_dtype

    model = AutoModelForCausalLM.from_pretrained(base_model, **model_kwargs)
    if method == "QLORA":
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

    target_modules = config["lora"].get("targetModules") or ("all-linear" if method == "QLORA" else None)
    peft_config = LoraConfig(
        r=config["lora"]["rank"],
        lora_alpha=config["lora"]["alpha"],
        lora_dropout=config["lora"]["dropout"],
        target_modules=target_modules,
        bias="none",
        task_type="CAUSAL_LM",
    )

    train_dataset = Dataset.from_list(rows)
    training_args = SFTConfig(
        output_dir=str(output_dir),
        seed=config["seed"],
        data_seed=config["seed"],
        max_length=config["maxSequenceLength"],
        learning_rate=config["learningRate"],
        num_train_epochs=config["epochs"],
        per_device_train_batch_size=config["perDeviceTrainBatchSize"],
        gradient_accumulation_steps=config["gradientAccumulationSteps"],
        assistant_only_loss=config["assistantOnlyLoss"],
        packing=config["packing"],
        logging_steps=10,
        save_strategy="epoch",
        report_to="none",
        bf16=bool(torch.cuda.is_available() and compute_dtype == torch.bfloat16),
        fp16=bool(torch.cuda.is_available() and compute_dtype == torch.float16),
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        processing_class=tokenizer,
        peft_config=peft_config,
    )
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    result = {
        "schemaVersion": 1,
        "status": "TRAINED_NOT_EVALUATED",
        "promotionStatus": "NOT_EVALUATED",
        "bundleId": manifest["bundleId"],
        "datasetSha256": manifest["dataset"]["sha256"],
        "configSha256": manifest["reproducibility"]["configSha256"],
        "baseModel": config["baseModel"],
        "targetModel": config["targetModel"],
        "trainingMethod": method,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "exampleCount": len(rows),
        "nextRequiredGate": "MioBench + ModelPromotionGate",
        "disclosure": "Training completion does not imply benchmark success, promotion, activation, deployment, or publication.",
    }
    (output_dir / "mio-training-result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def self_test() -> None:
    rows = [
        {
            "id": "selftest:001",
            "domain": "GENERAL",
            "language": "id",
            "messages": [
                {"role": "user", "content": "Apa itu Mio?"},
                {"role": "assistant", "content": "Mio adalah lingkungan AI yang terkontrol."},
            ],
            "provenance": {"kind": "SYNTHETIC", "createdAt": 1},
            "tags": ["self-test"],
        }
    ]
    config = {
        "baseModel": "Qwen/Qwen3-8B",
        "targetModel": "Mio-Local-8B-selftest",
        "trainingMethod": "QLORA",
        "seed": 42,
        "maxSequenceLength": 4096,
        "learningRate": 0.0002,
        "epochs": 1,
        "perDeviceTrainBatchSize": 1,
        "gradientAccumulationSteps": 8,
        "assistantOnlyLoss": True,
        "packing": False,
        "lora": {"rank": 16, "alpha": 32, "dropout": 0.05, "targetModules": ["q_proj", "v_proj"]},
        "requiredDomains": ["GENERAL"],
        "minExamples": 1,
    }
    training_text = "\n".join(stable_json(row) for row in rows)
    dataset_hash = sha256_text(training_text)
    config_hash = sha256_text(stable_json(config))
    manifest = {
        "schemaVersion": 1,
        "format": BUNDLE_FORMAT,
        "bundleId": f"mio-train-{dataset_hash[:12]}-{config_hash[:12]}",
        "generatedAt": 1,
        "promotionStatus": "NOT_EVALUATED",
        "config": config,
        "dataset": {
            "exampleCount": 1,
            "excludedCount": 0,
            "sha256": dataset_hash,
            "eligibleExampleIds": ["selftest:001"],
            "excludedExamples": [],
            "countsByDomain": {"GENERAL": 1},
            "countsByLanguage": {"id": 1},
            "countsByProvenance": {"SYNTHETIC": 1},
        },
        "reproducibility": {
            "configSha256": config_hash,
            "datasetSha256": dataset_hash,
            "sortKey": "example.id",
            "canonicalization": "stable-json-v1",
        },
        "files": {"trainingData": EXPECTED_DATA_FILE, "manifest": EXPECTED_MANIFEST_FILE},
    }

    with tempfile.TemporaryDirectory(prefix="mio-training-selftest-") as temporary:
        root = Path(temporary)
        (root / EXPECTED_DATA_FILE).write_text(training_text, encoding="utf-8")
        (root / EXPECTED_MANIFEST_FILE).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        verified_manifest, verified_rows = verify_bundle_directory(root)
        assert verified_manifest["bundleId"] == manifest["bundleId"]
        assert len(verified_rows) == 1
        (root / EXPECTED_DATA_FILE).write_text(training_text + " ", encoding="utf-8")
        try:
            verify_bundle_directory(root)
        except BundleError:
            pass
        else:
            raise AssertionError("Tampered dataset should fail SHA-256 verification")

    print("MIO TRAINING RUNNER SELF-TEST: PASS")
    print("No ML dependency import, model download, training, upload, promotion, or activation occurred.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train a MIO LoRA/QLoRA adapter from a governed TP-0.46 bundle")
    parser.add_argument("--bundle", type=Path, help="Directory containing train.jsonl and manifest.json")
    parser.add_argument("--output", type=Path, help="Adapter output directory")
    parser.add_argument("--dry-run", action="store_true", help="Verify bundle only; do not import ML libraries or train")
    parser.add_argument("--overwrite", action="store_true", help="Allow replacement of a non-empty output directory")
    parser.add_argument("--self-test", action="store_true", help="Run standard-library-only runner contract self-test")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.bundle is None:
        raise BundleError("--bundle is required unless --self-test is used")

    manifest, rows = verify_bundle_directory(args.bundle)
    print("MIO TRAINING BUNDLE: VERIFIED")
    print(f"Bundle: {manifest['bundleId']}")
    print(f"Examples: {len(rows)}")
    print(f"Method: {manifest['config']['trainingMethod']}")
    print(f"Base model: {manifest['config']['baseModel']}")
    print(f"Target model: {manifest['config']['targetModel']}")
    print(f"Dataset SHA-256: {manifest['dataset']['sha256']}")
    print(f"Config SHA-256: {manifest['reproducibility']['configSha256']}")
    print("Promotion status: NOT_EVALUATED")

    if args.dry_run:
        print("DRY RUN: PASS — no model weights were loaded and no training/upload/promotion occurred.")
        return 0
    if args.output is None:
        raise BundleError("--output is required for a real training run")

    run_training(manifest, rows, args.output.resolve(), args.overwrite)
    print(f"TRAINING COMPLETE: adapter saved to {args.output.resolve()}")
    print("Status remains TRAINED_NOT_EVALUATED; run MioBench and ModelPromotionGate before activation.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BundleError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(2)

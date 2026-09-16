#!/usr/bin/env python3
"""MIO Local supervised fine-tuning entrypoint.

Input must be JSONL exported from MIO's governed training dataset pipeline.
Each row must contain a `messages` array ending in an assistant message.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune a MIO Local model with LoRA/QLoRA")
    parser.add_argument("--model", default="Qwen/Qwen3-8B", help="Base Hugging Face model id or local path")
    parser.add_argument("--dataset", required=True, help="Governed MIO JSONL training dataset")
    parser.add_argument("--output-dir", default="training/output/mio-local-8b-lora")
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--max-length", type=int, default=4096)
    parser.add_argument("--lora-r", type=int, default=32)
    parser.add_argument("--lora-alpha", type=int, default=64)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--qlora", action="store_true", help="Load the base model in 4-bit NF4 for QLoRA")
    parser.add_argument("--bf16", action="store_true", help="Use bfloat16 training when hardware supports it")
    return parser.parse_args()


def load_governed_dataset(path: str):
    dataset_path = Path(path)
    if not dataset_path.is_file():
        raise FileNotFoundError(f"Training dataset not found: {dataset_path}")

    dataset = load_dataset("json", data_files=str(dataset_path), split="train")
    if len(dataset) == 0:
        raise ValueError("Training dataset is empty")

    def convert(example):
        messages = example.get("messages")
        if not isinstance(messages, list) or len(messages) < 2:
            raise ValueError("Every row must contain at least two messages")
        if messages[-1].get("role") != "assistant":
            raise ValueError("Every row must end with an assistant message")
        return {
            "prompt": messages[:-1],
            "completion": [messages[-1]],
        }

    return dataset.map(convert, remove_columns=dataset.column_names)


def main() -> None:
    args = parse_args()
    dataset = load_governed_dataset(args.dataset)

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    )

    quantization_config = None
    if args.qlora:
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16 if args.bf16 else torch.float16,
        )

    training_args = SFTConfig(
        output_dir=args.output_dir,
        learning_rate=args.learning_rate,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        max_length=args.max_length,
        completion_only_loss=True,
        logging_steps=5,
        save_strategy="epoch",
        report_to="none",
        bf16=args.bf16,
    )

    trainer = SFTTrainer(
        model=args.model,
        args=training_args,
        train_dataset=dataset,
        peft_config=peft_config,
        quantization_config=quantization_config,
    )
    trainer.train()
    trainer.save_model(args.output_dir)
    print(f"MIO adapter saved to {args.output_dir}")


if __name__ == "__main__":
    main()

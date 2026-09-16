#!/usr/bin/env python3
"""Compatibility entrypoint for the governed MIO training runner.

TP-0.46 removes the former raw-JSONL training path because it could bypass the
bundle manifest, eligibility summary, and dataset/config fingerprints. Use the
same governed arguments as `training/train_mio_lora.py`.
"""

from __future__ import annotations

import sys

from train_mio_lora import BundleError, main


if __name__ == "__main__":
    print(
        "NOTICE: training/sft_lora.py now delegates to the governed TP-0.46 bundle runner. "
        "Raw --dataset training is no longer accepted.",
        file=sys.stderr,
    )
    try:
        sys.exit(main())
    except BundleError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(2)

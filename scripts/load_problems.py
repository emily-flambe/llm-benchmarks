#!/usr/bin/env python3
"""
Load problems from LiveCodeBench dataset and output as JSON.
Used by the Node.js container to efficiently load HuggingFace datasets.
"""

import argparse
import json
import random
import sys

from datasets import load_dataset

FIXED_RANDOM_SEED = 42


def main():
    parser = argparse.ArgumentParser(description="Load LiveCodeBench problems")
    parser.add_argument(
        "--sample",
        type=int,
        default=0,
        help="Number of problems to sample (0 = all)",
    )
    args = parser.parse_args()

    # Load dataset using HuggingFace datasets library
    # This handles caching and efficient downloading
    dataset = load_dataset(
        "livecodebench/code_generation_lite",
        split="test",
        trust_remote_code=True,
    )

    problems = list(dataset)

    # Sample if requested
    if args.sample > 0 and args.sample < len(problems):
        random.seed(FIXED_RANDOM_SEED)
        problems = random.sample(problems, args.sample)

    # Convert to JSON-serializable format
    output = []
    for p in problems:
        output.append({
            "question_id": p.get("question_id", ""),
            "question_content": p.get("question_content", ""),
            "starter_code": p.get("starter_code", ""),
            "public_test_cases": p.get("public_test_cases", "[]"),
            "private_test_cases": p.get("private_test_cases", "[]"),
        })

    # Output as JSON to stdout
    json.dump(output, sys.stdout)


if __name__ == "__main__":
    main()

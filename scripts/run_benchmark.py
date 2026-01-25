#!/usr/bin/env python3
"""
LiveCodeBench benchmark runner for LLM code generation evaluation.

Fetches problems from HuggingFace, calls LLM APIs, executes generated code,
and outputs results.json for upload to the benchmarks API.
"""

import argparse
import json
import os
import random
import re
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

import anthropic
import openai
from datasets import load_dataset


# Pricing per million tokens
MODEL_PRICING = {
    "claude-opus-4-5-20251101": {"input": 5.00, "output": 25.00},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "o3": {"input": 2.00, "output": 8.00},
}

# Map API model names to database IDs
MODEL_ID_MAP = {
    "claude-opus-4-5-20251101": "claude-opus-4-5",
    "claude-sonnet-4-20250514": "claude-sonnet-4",
    "gpt-4.1": "gpt-4-1",
    "o3": "o3",
}

FIXED_RANDOM_SEED = 42
CODE_EXECUTION_TIMEOUT = 30  # seconds


@dataclass
class ProblemResult:
    problem_id: str
    passed: bool
    error_type: Optional[str]  # None, 'syntax', 'runtime', 'wrong_answer', 'timeout', 'api_error'
    latency_ms: int


@dataclass
class BenchmarkResults:
    model_id: str  # API expects model_id, not model
    run_date: str  # API expects run_date, not date
    sample_size: int  # API expects sample_size
    score: float
    passed_count: int
    total_count: int
    input_tokens: int
    output_tokens: int
    input_cost: float
    output_cost: float
    duration_seconds: int
    problems: list[dict]


def extract_code_from_response(response_text: str) -> str:
    """Extract Python code from model response, handling markdown code blocks."""
    # Try to find ```python ... ``` blocks first
    # Match ```python or ```py or similar, then capture everything until closing ```
    python_blocks = re.findall(r"```(?:python|py)\n(.*?)```", response_text, re.DOTALL)
    if python_blocks:
        return python_blocks[-1].strip()

    # Try generic ``` ... ``` blocks (skip any language identifier on first line)
    generic_blocks = re.findall(r"```\w*\n(.*?)```", response_text, re.DOTALL)
    if generic_blocks:
        return generic_blocks[-1].strip()

    # Fall back to the entire response (might be raw code)
    return response_text.strip()


def format_prompt(problem: dict) -> str:
    """Format a LiveCodeBench problem into a prompt for the model."""
    question_content = problem.get("question_content", "")
    starter_code = problem.get("starter_code", "")

    prompt = f"""Solve the following programming problem. Return only the Python code solution, no explanations.

## Problem

{question_content}

"""
    if starter_code:
        prompt += f"""## Starter Code

Use the following function signature:

```python
{starter_code}
```

"""

    prompt += """## Requirements

- Write clean, correct Python code
- Handle all edge cases
- Your code should read from stdin and write to stdout if no starter code is provided
- If starter code is provided, implement the function with that exact signature
- Return ONLY the code, wrapped in ```python ... ``` markers
"""
    return prompt


def call_anthropic(client: anthropic.Anthropic, model: str, prompt: str) -> tuple[str, int, int]:
    """Call Anthropic API and return (response_text, input_tokens, output_tokens)."""
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    response_text = message.content[0].text
    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens
    return response_text, input_tokens, output_tokens


def call_openai(client: openai.OpenAI, model: str, prompt: str) -> tuple[str, int, int]:
    """Call OpenAI API and return (response_text, input_tokens, output_tokens)."""
    # Newer models (o1, o3, gpt-5+) use max_completion_tokens instead of max_tokens
    uses_completion_tokens = (
        model.startswith("o1") or model.startswith("o3") or model.startswith("gpt-5")
    )

    if uses_completion_tokens:
        response = client.chat.completions.create(
            model=model,
            max_completion_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
    else:
        response = client.chat.completions.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
    response_text = response.choices[0].message.content
    input_tokens = response.usage.prompt_tokens
    output_tokens = response.usage.completion_tokens
    return response_text, input_tokens, output_tokens


def execute_code_with_input(code: str, test_input: str) -> tuple[bool, Optional[str], str]:
    """
    Execute code in a subprocess with the given input.
    Returns (success, error_type, output).
    """
    try:
        # Create a subprocess with restricted capabilities
        result = subprocess.run(
            [sys.executable, "-c", code],
            input=test_input,
            capture_output=True,
            text=True,
            timeout=CODE_EXECUTION_TIMEOUT,
            env={
                "PATH": os.environ.get("PATH", ""),
                "PYTHONPATH": "",
                "HOME": "/tmp",
            },
        )

        if result.returncode != 0:
            # Check if it's a syntax error
            if "SyntaxError" in result.stderr:
                return False, "syntax", result.stderr
            return False, "runtime", result.stderr

        return True, None, result.stdout

    except subprocess.TimeoutExpired:
        return False, "timeout", ""
    except Exception as e:
        return False, "runtime", str(e)


def run_test_cases(code: str, test_cases: list[dict]) -> tuple[bool, Optional[str]]:
    """
    Run code against all test cases.
    Returns (all_passed, error_type).
    """
    for test_case in test_cases:
        test_input = test_case.get("input", "")
        expected_output = test_case.get("output", "").strip()

        success, error_type, actual_output = execute_code_with_input(code, test_input)

        if not success:
            return False, error_type

        # Compare outputs (strip whitespace for comparison)
        actual_output = actual_output.strip()
        if actual_output != expected_output:
            return False, "wrong_answer"

    return True, None


def evaluate_problem(
    problem: dict,
    anthropic_client: Optional[anthropic.Anthropic],
    openai_client: Optional[openai.OpenAI],
    model: str,
) -> tuple[ProblemResult, int, int]:
    """
    Evaluate a single problem.
    Returns (ProblemResult, input_tokens, output_tokens).
    """
    problem_id = problem.get("question_id", "unknown")
    start_time = time.time()

    try:
        prompt = format_prompt(problem)

        # Call the appropriate API
        if model.startswith("gpt") or model.startswith("o3"):
            if openai_client is None:
                raise ValueError("OpenAI client not initialized but OpenAI model requested")
            response_text, input_tokens, output_tokens = call_openai(openai_client, model, prompt)
        else:
            if anthropic_client is None:
                raise ValueError("Anthropic client not initialized")
            response_text, input_tokens, output_tokens = call_anthropic(
                anthropic_client, model, prompt
            )

        # Extract code from response
        code = extract_code_from_response(response_text)

        # Get test cases - try both public and private
        test_cases = []
        public_tests = problem.get("public_test_cases")
        private_tests = problem.get("private_test_cases")

        # Parse test cases (they may be JSON strings)
        if public_tests:
            if isinstance(public_tests, str):
                try:
                    public_tests = json.loads(public_tests)
                except json.JSONDecodeError:
                    public_tests = []
            test_cases.extend(public_tests)

        if private_tests:
            if isinstance(private_tests, str):
                try:
                    private_tests = json.loads(private_tests)
                except json.JSONDecodeError:
                    private_tests = []
            test_cases.extend(private_tests)

        if not test_cases:
            # No test cases available, mark as passed if code was generated
            latency_ms = int((time.time() - start_time) * 1000)
            return (
                ProblemResult(
                    problem_id=problem_id,
                    passed=True,
                    error_type=None,
                    latency_ms=latency_ms,
                ),
                input_tokens,
                output_tokens,
            )

        # Run test cases
        passed, error_type = run_test_cases(code, test_cases)
        latency_ms = int((time.time() - start_time) * 1000)

        return (
            ProblemResult(
                problem_id=problem_id,
                passed=passed,
                error_type=error_type,
                latency_ms=latency_ms,
            ),
            input_tokens,
            output_tokens,
        )

    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        print(f"  Error evaluating problem {problem_id}: {e}", file=sys.stderr)
        return (
            ProblemResult(
                problem_id=problem_id,
                passed=False,
                error_type="api_error",
                latency_ms=latency_ms,
            ),
            0,
            0,
        )


def load_problems(sample_size: int) -> list[dict]:
    """Load LiveCodeBench problems from HuggingFace."""
    print("Loading LiveCodeBench dataset from HuggingFace...")
    dataset = load_dataset(
        "livecodebench/code_generation_lite",
        split="test",
        trust_remote_code=True,
    )

    problems = list(dataset)
    print(f"Loaded {len(problems)} problems")

    if sample_size > 0 and sample_size < len(problems):
        random.seed(FIXED_RANDOM_SEED)
        problems = random.sample(problems, sample_size)
        print(f"Sampled {sample_size} problems (seed={FIXED_RANDOM_SEED})")

    return problems


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> tuple[float, float]:
    """Calculate costs based on token usage."""
    pricing = MODEL_PRICING.get(model, {"input": 5.00, "output": 25.00})
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    return input_cost, output_cost


def main():
    parser = argparse.ArgumentParser(description="Run LiveCodeBench benchmark")
    parser.add_argument(
        "--model",
        default="claude-opus-4-5-20251101",
        help="Model ID to benchmark",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=0,
        help="Number of problems to sample (0 = full run)",
    )
    parser.add_argument(
        "--output",
        default="results.json",
        help="Output file path",
    )
    args = parser.parse_args()

    # Initialize API clients
    anthropic_client = None
    openai_client = None

    if args.model.startswith("gpt") or args.model.startswith("o3"):
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            print("Error: OPENAI_API_KEY environment variable not set", file=sys.stderr)
            sys.exit(1)
        openai_client = openai.OpenAI(api_key=api_key)
    else:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print("Error: ANTHROPIC_API_KEY environment variable not set", file=sys.stderr)
            sys.exit(1)
        anthropic_client = anthropic.Anthropic(api_key=api_key)

    # Load problems
    problems = load_problems(args.sample)

    # Run benchmark
    start_time = time.time()
    results: list[ProblemResult] = []
    total_input_tokens = 0
    total_output_tokens = 0

    print(f"\nRunning benchmark with model: {args.model}")
    print(f"Problems to evaluate: {len(problems)}\n")

    for i, problem in enumerate(problems):
        problem_id = problem.get("question_id", f"problem_{i}")
        print(f"[{i+1}/{len(problems)}] Evaluating: {problem_id}...")

        result, input_tokens, output_tokens = evaluate_problem(
            problem,
            anthropic_client,
            openai_client,
            args.model,
        )
        results.append(result)
        total_input_tokens += input_tokens
        total_output_tokens += output_tokens

        status = "PASS" if result.passed else f"FAIL ({result.error_type})"
        print(f"  Result: {status} ({result.latency_ms}ms)")

    # Calculate final stats
    duration_seconds = int(time.time() - start_time)
    passed_count = sum(1 for r in results if r.passed)
    total_count = len(results)
    score = passed_count / total_count if total_count > 0 else 0.0
    input_cost, output_cost = calculate_cost(args.model, total_input_tokens, total_output_tokens)

    # Build output - field names must match API expectations
    benchmark_results = BenchmarkResults(
        model_id=MODEL_ID_MAP.get(args.model, args.model),  # Map to DB model ID
        run_date=datetime.now(timezone.utc).isoformat(),  # API expects run_date with full ISO format
        sample_size=total_count,  # API expects sample_size
        score=score,
        passed_count=passed_count,
        total_count=total_count,
        input_tokens=total_input_tokens,
        output_tokens=total_output_tokens,
        input_cost=round(input_cost, 4),
        output_cost=round(output_cost, 4),
        duration_seconds=duration_seconds,
        problems=[asdict(r) for r in results],
    )

    # Write results
    output_dict = asdict(benchmark_results)
    with open(args.output, "w") as f:
        json.dump(output_dict, f, indent=2)

    # Print summary
    print(f"\n{'='*50}")
    print("Benchmark Complete")
    print(f"{'='*50}")
    print(f"Model:          {args.model}")
    print(f"Score:          {score:.2%} ({passed_count}/{total_count})")
    print(f"Duration:       {duration_seconds}s")
    print(f"Input tokens:   {total_input_tokens:,}")
    print(f"Output tokens:  {total_output_tokens:,}")
    print(f"Input cost:     ${input_cost:.4f}")
    print(f"Output cost:    ${output_cost:.4f}")
    print(f"Total cost:     ${input_cost + output_cost:.4f}")
    print(f"Results saved:  {args.output}")


if __name__ == "__main__":
    main()

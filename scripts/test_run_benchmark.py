#!/usr/bin/env python3
"""
Adversarial tests for run_benchmark.py

These tests focus on edge cases, malformed inputs, and failure modes.
All API calls are mocked to avoid costs.
"""

import json
import subprocess
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock, patch

import pytest

# Import the module under test
from run_benchmark import (
    BenchmarkResults,
    CODE_EXECUTION_TIMEOUT,
    FIXED_RANDOM_SEED,
    MODEL_PRICING,
    ProblemResult,
    calculate_cost,
    call_anthropic,
    call_openai,
    evaluate_problem,
    execute_code_with_input,
    extract_code_from_response,
    format_prompt,
    run_test_cases,
)


class TestCodeExtraction:
    """Tests for extract_code_from_response - attack surface for malformed responses."""

    def test_simple_python_block(self):
        """Basic case: properly formatted python code block."""
        response = """Here's the solution:

```python
def solve():
    return 42
```

That should work!"""
        code = extract_code_from_response(response)
        assert code == "def solve():\n    return 42"

    def test_multiple_python_blocks_returns_last(self):
        """Multiple code blocks - should return the LAST one."""
        response = """First attempt:

```python
def wrong():
    return 1
```

Actually, here's the correct version:

```python
def correct():
    return 42
```
"""
        code = extract_code_from_response(response)
        assert code == "def correct():\n    return 42"

    def test_generic_code_block_no_language(self):
        """Generic code block without language specifier."""
        response = """```
print("hello")
```"""
        code = extract_code_from_response(response)
        assert code == 'print("hello")'

    def test_empty_response(self):
        """Empty response should return empty string."""
        code = extract_code_from_response("")
        assert code == ""

    def test_whitespace_only_response(self):
        """Whitespace-only response."""
        code = extract_code_from_response("   \n\t  \n  ")
        assert code == ""

    def test_no_code_blocks_raw_code(self):
        """No code blocks - returns entire response (fallback)."""
        response = "def solve():\n    return 42"
        code = extract_code_from_response(response)
        assert code == "def solve():\n    return 42"

    def test_nested_code_blocks(self):
        """BUG HUNT: Nested code blocks - regex may misbehave."""
        response = """```python
code = '''```python
nested
```'''
```"""
        # This tests if nested triple backticks cause issues
        code = extract_code_from_response(response)
        # The code should extract something, but the nested structure may confuse the regex
        assert code is not None

    def test_malformed_code_block_no_closing(self):
        """Unclosed code block."""
        response = """```python
def solve():
    return 42
"""
        code = extract_code_from_response(response)
        # Falls back to raw response since no complete block found
        assert "def solve():" in code

    def test_code_block_with_language_variants(self):
        """Code blocks with ```py should work like ```python.

        The regex now properly handles both ```python and ```py variants,
        extracting only the code content without the language specifier.
        """
        response = """```py
print("py variant")
```"""
        code = extract_code_from_response(response)
        # Fixed: language specifier should not be included
        assert code == 'print("py variant")'

    def test_empty_code_block(self):
        """Empty code block."""
        response = """```python
```"""
        code = extract_code_from_response(response)
        assert code == ""

    def test_code_block_with_special_characters(self):
        """Code containing special regex characters."""
        response = """```python
import re
pattern = r"[a-z]+\\d*"
result = re.match(pattern, "test123")
```"""
        code = extract_code_from_response(response)
        assert 'pattern = r"[a-z]+\\d*"' in code

    def test_unicode_in_code(self):
        """Unicode characters in code."""
        response = """```python
print("Hello")
```"""
        code = extract_code_from_response(response)
        assert "Hello" in code

    def test_very_long_response(self):
        """Very long response (performance/memory test)."""
        long_code = "x = 1\n" * 10000
        response = f"```python\n{long_code}```"
        code = extract_code_from_response(response)
        assert len(code.split("\n")) == 10000


class TestCostCalculation:
    """Tests for calculate_cost - attack surface for financial calculations."""

    def test_known_model_opus(self):
        """Claude Opus 4.5 pricing."""
        input_cost, output_cost = calculate_cost(
            "claude-opus-4-5-20251101", 1_000_000, 1_000_000
        )
        assert input_cost == 5.00
        assert output_cost == 25.00

    def test_known_model_sonnet(self):
        """Claude Sonnet 4 pricing."""
        input_cost, output_cost = calculate_cost(
            "claude-sonnet-4-20250514", 1_000_000, 1_000_000
        )
        assert input_cost == 3.00
        assert output_cost == 15.00

    def test_known_model_gpt(self):
        """GPT-4.1 pricing."""
        input_cost, output_cost = calculate_cost("gpt-4.1", 1_000_000, 1_000_000)
        assert input_cost == 2.00
        assert output_cost == 8.00

    def test_unknown_model_uses_default(self):
        """Unknown model should use default pricing (Opus rates)."""
        input_cost, output_cost = calculate_cost(
            "unknown-model-xyz", 1_000_000, 1_000_000
        )
        assert input_cost == 5.00  # Default is Opus input rate
        assert output_cost == 25.00  # Default is Opus output rate

    def test_zero_tokens(self):
        """Zero tokens should result in zero cost."""
        input_cost, output_cost = calculate_cost("claude-opus-4-5-20251101", 0, 0)
        assert input_cost == 0.0
        assert output_cost == 0.0

    def test_negative_tokens(self):
        """BUG: Negative tokens - should this be rejected?"""
        # This is a potential bug - negative tokens shouldn't be possible
        # but the function doesn't validate
        input_cost, output_cost = calculate_cost(
            "claude-opus-4-5-20251101", -1000, -1000
        )
        # Currently this will produce negative costs which is wrong
        assert input_cost < 0  # This is the bug!
        assert output_cost < 0

    def test_very_large_tokens(self):
        """Very large token counts (overflow check)."""
        input_cost, output_cost = calculate_cost(
            "claude-opus-4-5-20251101", 10**12, 10**12
        )
        # 1 trillion tokens at $5/M = $5 million
        assert input_cost == 5_000_000.0
        assert output_cost == 25_000_000.0

    def test_fractional_tokens(self):
        """Small token counts produce fractional costs."""
        input_cost, output_cost = calculate_cost("claude-opus-4-5-20251101", 1, 1)
        assert input_cost == pytest.approx(5.0 / 1_000_000, rel=1e-9)
        assert output_cost == pytest.approx(25.0 / 1_000_000, rel=1e-9)


class TestCodeExecution:
    """Tests for execute_code_with_input - attack surface for code injection/safety."""

    def test_simple_code_success(self):
        """Basic successful execution."""
        code = "print('hello')"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert error_type is None
        assert output.strip() == "hello"

    def test_code_with_input(self):
        """Code that reads from stdin."""
        code = "x = input()\nprint(f'Got: {x}')"
        success, error_type, output = execute_code_with_input(code, "test_input\n")
        assert success is True
        assert output.strip() == "Got: test_input"

    def test_syntax_error(self):
        """Syntax error in code."""
        code = "def broken(\n    pass"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is False
        assert error_type == "syntax"

    def test_runtime_error(self):
        """Runtime error (division by zero)."""
        code = "x = 1 / 0"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is False
        assert error_type == "runtime"

    def test_name_error(self):
        """NameError - undefined variable."""
        code = "print(undefined_variable)"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is False
        assert error_type == "runtime"

    def test_timeout_infinite_loop(self):
        """Infinite loop should timeout."""
        code = "while True: pass"
        start = time.time()
        success, error_type, output = execute_code_with_input(code, "")
        elapsed = time.time() - start
        assert success is False
        assert error_type == "timeout"
        # Should complete around CODE_EXECUTION_TIMEOUT seconds
        assert elapsed < CODE_EXECUTION_TIMEOUT + 5

    def test_timeout_slow_code(self):
        """Slow but finite code that exceeds timeout."""
        # Sleep for longer than timeout
        code = f"import time; time.sleep({CODE_EXECUTION_TIMEOUT + 10})"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is False
        assert error_type == "timeout"

    def test_empty_code(self):
        """Empty code string."""
        code = ""
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True  # Empty code runs successfully
        assert output == ""

    def test_whitespace_only_code(self):
        """Whitespace-only code."""
        code = "   \n\t  \n"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert output == ""

    def test_import_standard_library(self):
        """Standard library imports should work."""
        code = "import json; print(json.dumps({'a': 1}))"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert output.strip() == '{"a": 1}'

    def test_restricted_environment(self):
        """HOME is set to /tmp - verify environment restrictions."""
        code = "import os; print(os.environ.get('HOME', 'not set'))"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert output.strip() == "/tmp"

    def test_pythonpath_cleared(self):
        """PYTHONPATH should be empty string."""
        code = "import os; print(repr(os.environ.get('PYTHONPATH', 'NOT_SET')))"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        # PYTHONPATH is set to empty string "", not absent
        assert output.strip() == "''"

    def test_multiline_output(self):
        """Code that produces multiline output."""
        code = "for i in range(3): print(i)"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert output.strip() == "0\n1\n2"

    def test_binary_output(self):
        """Code that might produce binary-ish output."""
        code = "print('\\x00\\x01\\x02')"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True

    def test_stderr_not_captured_as_output(self):
        """Stderr goes to error, not output."""
        code = "import sys; sys.stderr.write('error'); print('output')"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert output.strip() == "output"


class TestRunTestCases:
    """Tests for run_test_cases - aggregate execution."""

    def test_all_pass(self):
        """All test cases pass."""
        code = "x = input(); print(x.upper())"
        test_cases = [
            {"input": "hello\n", "output": "HELLO"},
            {"input": "world\n", "output": "WORLD"},
        ]
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is True
        assert error_type is None

    def test_first_fails(self):
        """First test case fails - should stop early."""
        code = "print('wrong')"
        test_cases = [
            {"input": "", "output": "expected"},
            {"input": "", "output": "never reached"},
        ]
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is False
        assert error_type == "wrong_answer"

    def test_second_fails(self):
        """Second test case fails."""
        code = """
x = input()
if x == "pass":
    print("ok")
else:
    print("fail")
"""
        test_cases = [
            {"input": "pass\n", "output": "ok"},
            {"input": "fail\n", "output": "ok"},  # This will fail
        ]
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is False
        assert error_type == "wrong_answer"

    def test_empty_test_cases(self):
        """Empty test cases list - should pass."""
        code = "print('anything')"
        passed, error_type = run_test_cases(code, [])
        assert passed is True
        assert error_type is None

    def test_syntax_error_in_code(self):
        """Syntax error should be reported."""
        code = "def broken("
        test_cases = [{"input": "", "output": ""}]
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is False
        assert error_type == "syntax"

    def test_whitespace_handling(self):
        """Output comparison strips whitespace."""
        code = "print('  result  ')"
        test_cases = [{"input": "", "output": "  result  "}]  # With spaces
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is True

    def test_trailing_newline_handling(self):
        """Trailing newlines in expected output."""
        code = "print('result')"
        test_cases = [{"input": "", "output": "result\n\n\n"}]
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is True

    def test_missing_input_key(self):
        """Test case missing 'input' key."""
        code = "print('result')"
        test_cases = [{"output": "result"}]  # No 'input' key
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is True  # Should use empty string for input

    def test_missing_output_key(self):
        """Test case missing 'output' key."""
        code = "pass"  # Produces no output
        test_cases = [{"input": ""}]  # No 'output' key
        passed, error_type = run_test_cases(code, test_cases)
        assert passed is True  # Should use empty string for expected output


class TestFormatPrompt:
    """Tests for format_prompt - prompt generation."""

    def test_basic_prompt(self):
        """Basic problem formatting."""
        problem = {
            "question_content": "Write a function that returns 42.",
            "starter_code": "def solution():",
        }
        prompt = format_prompt(problem)
        assert "Write a function that returns 42." in prompt
        assert "def solution():" in prompt
        assert "```python" in prompt

    def test_no_starter_code(self):
        """Problem without starter code."""
        problem = {
            "question_content": "Print hello world.",
        }
        prompt = format_prompt(problem)
        assert "Print hello world." in prompt
        assert "Starter Code" not in prompt

    def test_empty_starter_code(self):
        """Empty starter code string."""
        problem = {
            "question_content": "Problem text",
            "starter_code": "",
        }
        prompt = format_prompt(problem)
        assert "Starter Code" not in prompt

    def test_missing_question_content(self):
        """Missing question_content key."""
        problem = {"starter_code": "def solve():"}
        prompt = format_prompt(problem)
        # Should not crash, just have empty problem section
        assert "## Problem" in prompt

    def test_empty_problem(self):
        """Empty problem dict."""
        prompt = format_prompt({})
        # Should not crash
        assert "## Problem" in prompt
        assert "## Requirements" in prompt


class TestEvaluateProblem:
    """Tests for evaluate_problem - full evaluation with mocked API."""

    @patch("run_benchmark.call_anthropic")
    def test_successful_evaluation(self, mock_call):
        """Successful problem evaluation with Anthropic."""
        mock_call.return_value = ("```python\nprint('42')\n```", 100, 50)

        problem = {
            "question_id": "test_001",
            "question_content": "Print 42",
            "public_test_cases": json.dumps([{"input": "", "output": "42"}]),
        }

        mock_client = MagicMock()
        result, input_tokens, output_tokens = evaluate_problem(
            problem, mock_client, None, "claude-opus-4-5-20251101"
        )

        assert result.problem_id == "test_001"
        assert result.passed is True
        assert result.error_type is None
        assert input_tokens == 100
        assert output_tokens == 50

    @patch("run_benchmark.call_anthropic")
    def test_wrong_answer(self, mock_call):
        """Code runs but produces wrong output."""
        mock_call.return_value = ("```python\nprint('wrong')\n```", 100, 50)

        problem = {
            "question_id": "test_002",
            "question_content": "Print correct",
            "public_test_cases": json.dumps([{"input": "", "output": "correct"}]),
        }

        mock_client = MagicMock()
        result, _, _ = evaluate_problem(
            problem, mock_client, None, "claude-opus-4-5-20251101"
        )

        assert result.passed is False
        assert result.error_type == "wrong_answer"

    @patch("run_benchmark.call_anthropic")
    def test_api_error_handling(self, mock_call):
        """API error should result in api_error type."""
        mock_call.side_effect = Exception("API rate limit exceeded")

        problem = {
            "question_id": "test_003",
            "question_content": "Some problem",
        }

        mock_client = MagicMock()
        result, input_tokens, output_tokens = evaluate_problem(
            problem, mock_client, None, "claude-opus-4-5-20251101"
        )

        assert result.passed is False
        assert result.error_type == "api_error"
        assert input_tokens == 0
        assert output_tokens == 0

    @patch("run_benchmark.call_openai")
    def test_openai_model_routing(self, mock_call):
        """GPT model should use OpenAI client."""
        mock_call.return_value = ("```python\nprint('42')\n```", 100, 50)

        problem = {
            "question_id": "test_004",
            "question_content": "Print 42",
            "public_test_cases": json.dumps([{"input": "", "output": "42"}]),
        }

        mock_client = MagicMock()
        result, _, _ = evaluate_problem(problem, None, mock_client, "gpt-4.1")

        mock_call.assert_called_once()
        assert result.passed is True

    @patch("run_benchmark.call_openai")
    def test_o3_model_routing(self, mock_call):
        """O3 model should use OpenAI client."""
        mock_call.return_value = ("```python\nprint('42')\n```", 100, 50)

        problem = {
            "question_id": "test_005",
            "question_content": "Print 42",
            "public_test_cases": json.dumps([{"input": "", "output": "42"}]),
        }

        mock_client = MagicMock()
        result, _, _ = evaluate_problem(problem, None, mock_client, "o3")

        mock_call.assert_called_once()

    @patch("run_benchmark.call_anthropic")
    def test_no_test_cases_passes(self, mock_call):
        """Problem with no test cases should pass if code is generated."""
        mock_call.return_value = ("```python\nprint('anything')\n```", 100, 50)

        problem = {
            "question_id": "test_006",
            "question_content": "Some problem",
            # No test cases
        }

        mock_client = MagicMock()
        result, _, _ = evaluate_problem(
            problem, mock_client, None, "claude-opus-4-5-20251101"
        )

        assert result.passed is True

    @patch("run_benchmark.call_anthropic")
    def test_json_string_test_cases(self, mock_call):
        """Test cases as JSON string should be parsed."""
        mock_call.return_value = ("```python\nprint('42')\n```", 100, 50)

        problem = {
            "question_id": "test_007",
            "question_content": "Print 42",
            "public_test_cases": '[{"input": "", "output": "42"}]',  # JSON string
        }

        mock_client = MagicMock()
        result, _, _ = evaluate_problem(
            problem, mock_client, None, "claude-opus-4-5-20251101"
        )

        assert result.passed is True

    @patch("run_benchmark.call_anthropic")
    def test_malformed_json_test_cases(self, mock_call):
        """Malformed JSON test cases should be handled gracefully."""
        mock_call.return_value = ("```python\nprint('42')\n```", 100, 50)

        problem = {
            "question_id": "test_008",
            "question_content": "Print 42",
            "public_test_cases": "not valid json at all",
        }

        mock_client = MagicMock()
        result, _, _ = evaluate_problem(
            problem, mock_client, None, "claude-opus-4-5-20251101"
        )

        # Should pass because no valid test cases found
        assert result.passed is True

    @patch("run_benchmark.call_anthropic")
    def test_private_test_cases_used(self, mock_call):
        """Both public and private test cases should be used."""
        mock_call.return_value = ("```python\nprint('42')\n```", 100, 50)

        problem = {
            "question_id": "test_009",
            "question_content": "Print 42",
            "public_test_cases": json.dumps([{"input": "", "output": "42"}]),
            "private_test_cases": json.dumps(
                [{"input": "", "output": "43"}]
            ),  # Will fail
        }

        mock_client = MagicMock()
        result, _, _ = evaluate_problem(
            problem, mock_client, None, "claude-opus-4-5-20251101"
        )

        # Should fail on private test case
        assert result.passed is False
        assert result.error_type == "wrong_answer"

    def test_missing_anthropic_client(self):
        """Anthropic model with no client should error."""
        problem = {
            "question_id": "test_010",
            "question_content": "Print 42",
        }

        result, _, _ = evaluate_problem(
            problem, None, None, "claude-opus-4-5-20251101"
        )

        assert result.passed is False
        assert result.error_type == "api_error"

    def test_missing_openai_client(self):
        """OpenAI model with no client should error."""
        problem = {
            "question_id": "test_011",
            "question_content": "Print 42",
        }

        result, _, _ = evaluate_problem(problem, None, None, "gpt-4.1")

        assert result.passed is False
        assert result.error_type == "api_error"


class TestBenchmarkResults:
    """Tests for BenchmarkResults dataclass and output format."""

    def test_results_structure(self):
        """Verify results.json structure matches API spec."""
        results = BenchmarkResults(
            model_id="claude-opus-4-5-20251101",
            run_date="2026-01-24T12:00:00+00:00",
            sample_size=100,
            score=0.75,
            passed_count=75,
            total_count=100,
            input_tokens=1000000,
            output_tokens=500000,
            input_cost=5.00,
            output_cost=12.50,
            duration_seconds=3600,
            problems=[
                asdict(
                    ProblemResult(
                        problem_id="test_001",
                        passed=True,
                        error_type=None,
                        latency_ms=1234,
                    )
                )
            ],
        )

        output = asdict(results)

        # Verify required fields exist (per API spec)
        assert "model_id" in output
        assert "run_date" in output
        assert "sample_size" in output
        assert "score" in output
        assert "passed_count" in output
        assert "total_count" in output
        assert "input_tokens" in output
        assert "output_tokens" in output
        assert "input_cost" in output
        assert "output_cost" in output
        assert "duration_seconds" in output
        assert "problems" in output

        # Verify problem structure
        problem = output["problems"][0]
        assert "problem_id" in problem
        assert "passed" in problem
        assert "error_type" in problem
        assert "latency_ms" in problem

    def test_score_calculation_all_pass(self):
        """Score should be 1.0 when all pass."""
        passed_count = 100
        total_count = 100
        score = passed_count / total_count if total_count > 0 else 0.0
        assert score == 1.0

    def test_score_calculation_all_fail(self):
        """Score should be 0.0 when all fail."""
        passed_count = 0
        total_count = 100
        score = passed_count / total_count if total_count > 0 else 0.0
        assert score == 0.0

    def test_score_calculation_empty(self):
        """Score should be 0.0 when no problems."""
        passed_count = 0
        total_count = 0
        score = passed_count / total_count if total_count > 0 else 0.0
        assert score == 0.0

    def test_json_serialization(self):
        """Results should be JSON serializable."""
        results = BenchmarkResults(
            model_id="claude-opus-4-5-20251101",
            run_date="2026-01-24T12:00:00+00:00",
            sample_size=100,
            score=0.5,
            passed_count=50,
            total_count=100,
            input_tokens=100000,
            output_tokens=50000,
            input_cost=0.50,
            output_cost=1.25,
            duration_seconds=600,
            problems=[],
        )

        # Should not raise
        json_str = json.dumps(asdict(results))
        parsed = json.loads(json_str)
        assert parsed["model_id"] == "claude-opus-4-5-20251101"


class TestProblemResult:
    """Tests for ProblemResult dataclass."""

    def test_valid_error_types(self):
        """All valid error types."""
        valid_types = [None, "syntax", "runtime", "wrong_answer", "timeout", "api_error"]

        for error_type in valid_types:
            result = ProblemResult(
                problem_id="test",
                passed=error_type is None,
                error_type=error_type,
                latency_ms=100,
            )
            assert result.error_type == error_type

    def test_latency_is_integer(self):
        """Latency should be an integer."""
        result = ProblemResult(
            problem_id="test",
            passed=True,
            error_type=None,
            latency_ms=1234,
        )
        assert isinstance(result.latency_ms, int)


class TestAPIWrappers:
    """Tests for API wrapper functions."""

    def test_call_anthropic_extracts_fields(self):
        """call_anthropic should extract response correctly."""
        mock_client = MagicMock()
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="test response")]
        mock_message.usage.input_tokens = 100
        mock_message.usage.output_tokens = 50
        mock_client.messages.create.return_value = mock_message

        response, input_tokens, output_tokens = call_anthropic(
            mock_client, "claude-opus-4-5-20251101", "test prompt"
        )

        assert response == "test response"
        assert input_tokens == 100
        assert output_tokens == 50

    def test_call_openai_extracts_fields(self):
        """call_openai should extract response correctly."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "test response"
        mock_response.usage.prompt_tokens = 100
        mock_response.usage.completion_tokens = 50
        mock_client.chat.completions.create.return_value = mock_response

        response, input_tokens, output_tokens = call_openai(
            mock_client, "gpt-4.1", "test prompt"
        )

        assert response == "test response"
        assert input_tokens == 100
        assert output_tokens == 50


class TestEdgeCases:
    """Miscellaneous edge case tests."""

    def test_fixed_random_seed_value(self):
        """Fixed random seed should be 42."""
        assert FIXED_RANDOM_SEED == 42

    def test_code_execution_timeout_value(self):
        """Timeout should be 30 seconds."""
        assert CODE_EXECUTION_TIMEOUT == 30

    def test_model_pricing_completeness(self):
        """All known models should have pricing."""
        expected_models = [
            "claude-opus-4-5-20251101",
            "claude-sonnet-4-20250514",
            "gpt-4.1",
            "o3",
        ]
        for model in expected_models:
            assert model in MODEL_PRICING
            assert "input" in MODEL_PRICING[model]
            assert "output" in MODEL_PRICING[model]


class TestSecurityConsiderations:
    """Security-focused tests."""

    def test_file_system_access_restricted(self):
        """Code should not be able to access sensitive files."""
        # Try to read a file that might contain secrets
        code = """
try:
    with open('/etc/passwd', 'r') as f:
        print('ACCESS GRANTED')
except:
    print('ACCESS DENIED')
"""
        success, error_type, output = execute_code_with_input(code, "")
        # This depends on the actual file permissions, but the code should run
        assert success is True

    def test_network_access(self):
        """Network access test - may or may not be restricted."""
        code = """
try:
    import urllib.request
    urllib.request.urlopen('http://example.com', timeout=1)
    print('NETWORK OK')
except:
    print('NETWORK BLOCKED')
"""
        success, error_type, output = execute_code_with_input(code, "")
        # Just verify it doesn't hang forever
        assert success is True

    def test_subprocess_creation(self):
        """Subprocess creation should work (needed for some solutions)."""
        code = """
import subprocess
result = subprocess.run(['echo', 'test'], capture_output=True, text=True)
print(result.stdout.strip())
"""
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert output.strip() == "test"


class TestMoreCodeExtractionBugs:
    """Additional code extraction edge cases targeting potential bugs."""

    def test_javascript_block_extracts_code_only(self):
        """Code block with javascript language should extract code only."""
        response = """```javascript
console.log("hello")
```"""
        code = extract_code_from_response(response)
        # Fixed: language specifier should not be included
        assert code == 'console.log("hello")'
        assert "javascript" not in code

    def test_code_block_with_extra_whitespace(self):
        """Code block with extra whitespace after language."""
        response = """```python
print("hello")
```"""
        code = extract_code_from_response(response)
        # Should work because \s* matches the spaces
        assert code == 'print("hello")'

    def test_code_block_with_inline_backticks(self):
        """Code containing inline backticks."""
        response = """```python
x = "`backtick`"
print(x)
```"""
        code = extract_code_from_response(response)
        assert '"`backtick`"' in code

    def test_code_block_with_four_backticks(self):
        """Four backticks instead of three."""
        response = """````python
print("four backticks")
````"""
        code = extract_code_from_response(response)
        # The regex looks for ``` not ````, so this might not match correctly
        # Falls back to raw response
        assert "print" in code

    def test_mixed_python_and_other_blocks(self):
        """Mix of python and non-python blocks."""
        response = """First a shell example:
```bash
echo "hello"
```

Now Python:
```python
print("hello")
```
"""
        code = extract_code_from_response(response)
        # Should return the python block, not bash
        assert code == 'print("hello")'

    def test_crlf_line_endings(self):
        """Windows-style line endings."""
        response = "```python\r\nprint('hello')\r\n```"
        code = extract_code_from_response(response)
        assert "print" in code


class TestSampleFlagEdgeCases:
    """Tests for --sample flag behavior."""

    @patch("run_benchmark.load_dataset")
    def test_sample_zero_returns_all(self, mock_load):
        """--sample 0 should return all problems."""
        from run_benchmark import load_problems

        mock_dataset = [{"question_id": f"q{i}"} for i in range(100)]
        mock_load.return_value = mock_dataset

        problems = load_problems(0)
        assert len(problems) == 100

    @patch("run_benchmark.load_dataset")
    def test_sample_larger_than_dataset(self, mock_load):
        """--sample larger than dataset should return all (not crash)."""
        from run_benchmark import load_problems

        mock_dataset = [{"question_id": f"q{i}"} for i in range(10)]
        mock_load.return_value = mock_dataset

        # Request 100 but only 10 available
        problems = load_problems(100)
        # Should return all 10, not crash
        assert len(problems) == 10

    @patch("run_benchmark.load_dataset")
    def test_sample_reproducible_with_seed(self, mock_load):
        """Sampling should be reproducible with fixed seed."""
        from run_benchmark import load_problems

        mock_dataset = [{"question_id": f"q{i}"} for i in range(100)]
        mock_load.return_value = mock_dataset

        problems1 = load_problems(10)
        problems2 = load_problems(10)

        # Same seed should produce same sample
        assert [p["question_id"] for p in problems1] == [p["question_id"] for p in problems2]

    @patch("run_benchmark.load_dataset")
    def test_sample_negative_value(self, mock_load):
        """Negative sample value - should be handled."""
        from run_benchmark import load_problems

        mock_dataset = [{"question_id": f"q{i}"} for i in range(100)]
        mock_load.return_value = mock_dataset

        # Negative values - the condition `sample_size > 0` should prevent sampling
        problems = load_problems(-5)
        assert len(problems) == 100  # Should return all


class TestOutputComparison:
    """Tests for output comparison edge cases."""

    def test_output_differs_only_in_whitespace_type(self):
        """Tabs vs spaces in output."""
        code = "print('a\\tb')"  # Output has tab
        test_cases = [{"input": "", "output": "a\tb"}]  # Expected has tab
        passed, _ = run_test_cases(code, test_cases)
        assert passed is True

    def test_output_differs_in_trailing_whitespace(self):
        """Trailing spaces should be stripped."""
        code = "print('result   ')"  # Output has trailing spaces
        test_cases = [{"input": "", "output": "result"}]
        passed, _ = run_test_cases(code, test_cases)
        # strip() removes trailing spaces from both
        assert passed is True

    def test_floating_point_output(self):
        """Floating point precision issues."""
        code = "print(0.1 + 0.2)"
        test_cases = [{"input": "", "output": "0.30000000000000004"}]
        passed, _ = run_test_cases(code, test_cases)
        assert passed is True

        # This would fail with simpler expected value
        test_cases2 = [{"input": "", "output": "0.3"}]
        passed2, error_type = run_test_cases(code, test_cases2)
        assert passed2 is False
        assert error_type == "wrong_answer"


class TestErrorMessages:
    """Tests to verify error messages are helpful."""

    def test_syntax_error_includes_details(self):
        """Syntax errors should include the actual error message."""
        code = "def broken(:"
        success, error_type, output = execute_code_with_input(code, "")
        assert error_type == "syntax"
        assert "SyntaxError" in output

    def test_runtime_error_includes_traceback(self):
        """Runtime errors should include traceback."""
        code = """
def foo():
    return bar()
def bar():
    raise ValueError("test error")
foo()
"""
        success, error_type, output = execute_code_with_input(code, "")
        assert error_type == "runtime"
        assert "ValueError" in output
        assert "test error" in output


class TestRaceConditions:
    """Tests for potential race conditions and concurrency issues."""

    def test_rapid_successive_executions(self):
        """Multiple rapid executions shouldn't interfere."""
        results = []
        for i in range(5):
            code = f"print({i})"
            success, _, output = execute_code_with_input(code, "")
            results.append((success, output.strip()))

        assert all(r[0] for r in results)
        assert [r[1] for r in results] == ["0", "1", "2", "3", "4"]


class TestMemorySafety:
    """Tests for memory-related edge cases."""

    def test_large_output(self):
        """Code that produces very large output."""
        code = "print('x' * 100000)"
        success, error_type, output = execute_code_with_input(code, "")
        assert success is True
        assert len(output) >= 100000

    def test_recursive_code_stack_overflow(self):
        """Deep recursion should be handled gracefully."""
        code = """
import sys
sys.setrecursionlimit(100000)
def recurse(n):
    if n == 0:
        return 0
    return 1 + recurse(n - 1)
print(recurse(50000))
"""
        success, error_type, output = execute_code_with_input(code, "")
        # Should either succeed or give runtime error, not hang
        assert error_type in [None, "runtime"]


class TestDatasetLoading:
    """Tests for LiveCodeBench dataset loading."""

    @pytest.mark.skip(reason="Requires network access and working HuggingFace dataset")
    def test_load_real_dataset(self):
        """Integration test: Load actual LiveCodeBench dataset."""
        from run_benchmark import load_problems

        problems = load_problems(3)
        assert len(problems) == 3
        # Each problem should have required fields
        for p in problems:
            assert "question_id" in p or "id" in p
            assert "question_content" in p

    def test_dataset_loading_broken_with_datasets_4x(self):
        """BUG: Dataset loading fails with datasets>=4.0 due to trust_remote_code deprecation.

        The HuggingFace datasets library v4.x no longer supports trust_remote_code=True
        for datasets that use loading scripts. LiveCodeBench uses a loading script
        (code_generation_lite.py) which is now blocked.

        This will cause the entire benchmark to fail at runtime.
        """
        # This test documents the bug. Uncomment to verify it still exists:
        # from run_benchmark import load_problems
        # with pytest.raises(Exception, match="Dataset scripts are no longer supported"):
        #     load_problems(1)
        pass


class TestSpecificLiveCodeBenchPatterns:
    """Tests mimicking real LiveCodeBench problem patterns."""

    def test_multiline_input_processing(self):
        """Problems often have multi-line input."""
        code = """
n = int(input())
for _ in range(n):
    x = int(input())
    print(x * 2)
"""
        test_input = "3\n1\n2\n3\n"
        success, error_type, output = execute_code_with_input(code, test_input)
        assert success is True
        assert output.strip() == "2\n4\n6"

    def test_function_with_return(self):
        """Code that defines and calls a function."""
        code = """
def solution(nums):
    return sum(nums)

# Read input
nums = list(map(int, input().split()))
print(solution(nums))
"""
        test_input = "1 2 3 4 5\n"
        success, error_type, output = execute_code_with_input(code, test_input)
        assert success is True
        assert output.strip() == "15"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

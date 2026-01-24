# LLM Benchmark Landscape (2024-2025)

Research on current benchmarks, evaluation frameworks, and recommendations for automated daily evaluation.

## Executive Summary

The benchmarking field is rapidly evolving. Many traditional benchmarks (MMLU, HellaSwag, HumanEval) are approaching saturation for frontier models. Newer benchmarks like MMLU-Pro, GPQA, SimpleQA, and LiveBench provide better differentiation. For daily automated evaluation, focus on smaller, challenging benchmarks that remain differentiating.

## Standard Benchmarks (Established 2020-2023)

### MMLU (Massive Multitask Language Understanding)

- **Measures**: General knowledge across 57 academic subjects
- **Size**: 15,908 questions
- **Access**: [Hugging Face](https://huggingface.co/datasets/cais/mmlu)
- **License**: MIT
- **Status**: **Saturated** (top models >88%)
- **Recommendation**: Replace with MMLU-Pro for daily runs

### HellaSwag

- **Measures**: Commonsense reasoning via sentence completion
- **Size**: 10,000 questions
- **Status**: **Saturated** (GPT-4: 95.3%)
- **Recommendation**: Skip for frontier model evaluation

### TruthfulQA

- **Measures**: Resistance to common misconceptions
- **Size**: 817 questions across 38 categories
- **Access**: [GitHub](https://github.com/sylinrl/TruthfulQA)
- **License**: MIT
- **Modes**: MC1 (single answer), MC2 (multiple answers), generation
- **Recommendation**: Include (small, fast, still differentiating)

### GSM8K (Grade School Math)

- **Measures**: Mathematical reasoning on word problems
- **Size**: 1,319 test problems
- **Access**: [Hugging Face](https://huggingface.co/datasets/openai/gsm8k)
- **License**: MIT
- **Status**: Near saturation for frontier models
- **Recommendation**: Sample 500 questions for daily runs

### HumanEval

- **Measures**: Python code generation (function completion)
- **Size**: 164 problems
- **Metric**: pass@k (functional correctness)
- **Access**: [GitHub](https://github.com/openai/human-eval)
- **License**: MIT
- **Status**: **Saturated** (o1-mini: 96.2%)
- **Recommendation**: Include but consider HumanEval+ or LiveCodeBench

### ARC (AI2 Reasoning Challenge)

- **Measures**: Science reasoning (grades 3-9)
- **Size**: 8,000 questions (Easy and Challenge subsets)
- **Recommendation**: Include ARC-Challenge subset only

### Winogrande

- **Measures**: Commonsense via pronoun resolution
- **Size**: 44,000 problems
- **Recommendation**: Sample for daily use, large dataset

## Newer Benchmarks (2024-2025)

### MMLU-Pro (June 2024) ⭐ HIGH PRIORITY

- **Measures**: Enhanced MMLU with harder reasoning
- **Size**: 12,000+ questions, 10 choices each (vs 4 in MMLU)
- **Difficulty**: 16-33% accuracy drop from MMLU
- **Access**: [Hugging Face](https://huggingface.co/datasets/TIGER-Lab/MMLU-Pro)
- **License**: MIT
- **Recommendation**: **Daily core benchmark** (sample 1,000 questions)

### GPQA (Graduate-Level Q&A) ⭐ HIGH PRIORITY

- **Measures**: PhD-level biology, physics, chemistry
- **Size**: 198 questions (Diamond - hardest subset)
- **Human baseline**: 65-69% (experts), 34% (non-expert PhDs)
- **Access**: [GitHub](https://github.com/idavidrein/gpqa)
- **License**: MIT
- **Recommendation**: **Daily core benchmark** (full Diamond set)

### SimpleQA (OpenAI, 2024) ⭐ HIGH PRIORITY

- **Measures**: Short-form factual knowledge
- **Size**: 4,326 questions
- **Scoring**: correct/incorrect/not attempted
- **Access**: [OpenAI simple-evals](https://github.com/openai/simple-evals)
- **License**: MIT
- **Recommendation**: **Daily core benchmark** (full set or sample 1,000)

### LiveBench (June 2024) ⭐ HIGH PRIORITY

- **Measures**: Math, coding, reasoning, data analysis
- **Key feature**: Monthly updated questions from recent sources
- **Contamination resistance**: Uses news, arXiv, recent competitions
- **Access**: [GitHub](https://github.com/LiveBench/LiveBench)
- **Recommendation**: **Weekly benchmark** (contamination-resistant)

### LiveCodeBench (March 2024)

- **Measures**: Code generation, self-repair, test prediction
- **Size**: 400+ problems from LeetCode, AtCoder, CodeForces
- **Key feature**: Continuously updated with timestamps
- **Access**: [Website](https://livecodebench.github.io/)
- **Recommendation**: Weekly code evaluation

### IFEval (Instruction Following) ⭐ HIGH PRIORITY

- **Measures**: Verifiable instruction following
- **Size**: ~500 prompts with 25 instruction types
- **Key feature**: Objective scoring, no LLM-as-judge needed
- **Access**: [Hugging Face](https://huggingface.co/datasets/google/IFEval)
- **Recommendation**: **Daily core benchmark** (objective, small)

### Humanity's Last Exam (April 2025)

- **Measures**: Expert-level reasoning across 50+ domains
- **Size**: 2,500 questions from ~1,000 domain experts
- **Performance**: Top models ~25% accuracy
- **Access**: [Website](https://agi.safe.ai/)
- **Recommendation**: Monthly (expensive but highly differentiating)

### BigCodeBench (2024)

- **Measures**: Complex coding across 7 domains
- **Size**: 1,140 tasks using 139 libraries
- **Modes**: Complete (docstring) and Instruct (NL)
- **Recommendation**: Weekly code evaluation

### SWE-bench Verified (August 2024)

- **Measures**: Real GitHub issue resolution
- **Size**: 500 human-verified problems
- **Access**: [GitHub](https://github.com/SWE-bench/SWE-bench)
- **Warning**: 32% may have solution leakage
- **Recommendation**: Skip for daily (expensive, slow)

### AIME 2024/2025

- **Measures**: Competition-level mathematics
- **Size**: 15 problems per year
- **Recommendation**: Include when available (tiny, highly differentiating)

## Evaluation Frameworks

### EleutherAI lm-evaluation-harness ⭐ RECOMMENDED

- **Description**: Industry standard, powers Hugging Face leaderboard
- **Benchmarks**: 60+ with hundreds of subtasks
- **API support**: OpenAI, Anthropic (completions and chat)
- **Installation**:
  ```bash
  pip install lm-eval
  pip install "lm_eval[api]"  # For API support
  ```
- **Usage**:
  ```bash
  export OPENAI_API_KEY=...
  lm_eval --model openai-chat-completions \
          --model_args model=gpt-4 \
          --tasks mmlu,hellaswag

  export ANTHROPIC_API_KEY=...
  lm_eval --model anthropic-chat-completions \
          --model_args model=claude-3-opus-20240229 \
          --tasks mmlu
  ```

### OpenAI simple-evals

- **Description**: OpenAI's lightweight scripts
- **Benchmarks**: MMLU, MATH, GPQA, SimpleQA, HumanEval
- **Access**: [GitHub](https://github.com/openai/simple-evals)
- **Best for**: Quick evaluations matching OpenAI methodology

### Stanford HELM

- **Description**: Holistic evaluation framework
- **Coverage**: 16 scenarios, 7 metric categories
- **Best for**: Comprehensive academic evaluation

### DeepEval

- **Description**: Modern evaluation framework
- **Features**: Built-in benchmark support, custom metrics
- **Access**: [Documentation](https://deepeval.com/docs)

## API-Accessible Benchmarks

All benchmarks can run via API without local model weights.

### Task Types in lm-eval-harness

| Task Type | API Support | Notes |
|-----------|-------------|-------|
| `generate_until` | All APIs | Text generation |
| `loglikelihood` | OpenAI completions only | MC scoring |
| `multiple_choice` | Limited | Requires logprobs |

**For Claude/GPT-4**: Focus on `generate_until` tasks or use answer extraction for MC.

## Cost Estimates (Per Full Evaluation)

| Benchmark | Questions | Est. Tokens | Cost @ $3/1M |
|-----------|-----------|-------------|--------------|
| MMLU-Pro (full) | 12,000 | 6M | $18 |
| GPQA Diamond | 198 | 200K | $0.60 |
| SimpleQA | 4,326 | 1.3M | $3.90 |
| GSM8K | 1,319 | 660K | $2.00 |
| HumanEval | 164 | 164K | $0.50 |
| IFEval | 500 | 400K | $1.20 |
| TruthfulQA | 817 | 327K | $1.00 |

**Note**: Output tokens cost 3-5x input. Add 50% buffer.

## Time Estimates

- **Small** (HumanEval, GPQA Diamond, TruthfulQA): 5-15 minutes
- **Medium** (GSM8K, IFEval, SimpleQA): 30-60 minutes
- **Large** (MMLU-Pro full): 2-4 hours

## Recommendations

### Tier 1: Daily Core

| Benchmark | Questions | Est. Cost/Model | Rationale |
|-----------|-----------|-----------------|-----------|
| GPQA Diamond | 198 | ~$1 | PhD-level, differentiating |
| SimpleQA | 4,326 | ~$5 | Factuality, adversarial |
| IFEval | 500 | ~$2 | Instruction following |
| HumanEval | 164 | ~$1 | Code generation standard |
| GSM8K (sample) | 500 | ~$2 | Math reasoning |
| TruthfulQA MC | 817 | ~$1 | Truthfulness |

**Daily cost**: ~$12-15 per model

### Tier 2: Weekly

| Benchmark | Questions | Est. Cost | Rationale |
|-----------|-----------|-----------|-----------|
| MMLU-Pro (full) | 12,000 | ~$25 | Comprehensive |
| LiveBench | ~1,000 | ~$10 | Contamination-resistant |
| LiveCodeBench | 400+ | ~$15 | Code evaluation |

### Tier 3: Monthly

- Humanity's Last Exam (~$50)
- AIME 2025 (when released)

### Implementation Strategy

1. Use lm-evaluation-harness as primary framework
2. Implement sampling for large benchmarks
3. Track trends even with sampling
4. Rotate subsets on different days
5. Cache prompts where possible

## Licensing Summary

| Benchmark | License | Commercial |
|-----------|---------|------------|
| MMLU/MMLU-Pro | MIT | ✅ |
| HumanEval | MIT | ✅ |
| GSM8K | MIT | ✅ |
| GPQA | MIT | ✅ |
| SimpleQA | MIT | ✅ |
| TruthfulQA | MIT | ✅ |
| IFEval | Apache 2.0 | ✅ |

## Key Sources

- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)
- [OpenAI simple-evals](https://github.com/openai/simple-evals)
- [MMLU-Pro](https://github.com/TIGER-AI-Lab/MMLU-Pro)
- [LiveBench](https://github.com/LiveBench/LiveBench)
- [GPQA](https://github.com/idavidrein/gpqa)
- [IFEval](https://huggingface.co/datasets/google/IFEval)
- [LLM Stats](https://llm-stats.com/benchmarks)

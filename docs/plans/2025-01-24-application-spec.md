# LLM Benchmarks Application Specification

**Date**: 2025-01-24
**Status**: Draft
**Domain**: benchmarks.emilycogsdill.com

## Summary

A Cloudflare Workers application that runs standardized LLM benchmarks daily across frontier models from Anthropic, OpenAI, Google, and xAI, displaying results in a simple dashboard UI.

## Goals

1. **Automated daily evaluation** of frontier LLMs on established benchmarks
2. **Historical tracking** of model performance over time
3. **Simple dashboard** showing current results and trends
4. **Cost tracking** per model/benchmark (following llm-observatory patterns)
5. **Reuse patterns** from llm-observatory for consistency

## Non-Goals

- Creating custom benchmarks (use established ones only)
- Real-time evaluation (daily batch is sufficient)
- Supporting non-frontier/open-source models (future scope)
- Complex analytics or ML on results

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Frontend   │  │   Backend    │  │   Cron Job   │      │
│  │   (React)    │  │   (Hono)     │  │   (Daily)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                 │               │
│         └─────────────────┴─────────────────┘               │
│                           │                                 │
│  ┌────────────────────────┴────────────────────────┐       │
│  │                    D1 Database                   │       │
│  │  - Benchmark configs  - Run history             │       │
│  │  - Model configs      - Daily results           │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │        LLM APIs        │
              │  Anthropic, OpenAI,    │
              │  Google, xAI           │
              └────────────────────────┘
```

## Models to Benchmark

### Primary: Claude Opus 4.5

| Model | Model ID | Input/1M | Output/1M |
|-------|----------|----------|-----------|
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | $5.00 | $25.00 |

**Cost per full LiveCodeBench run**: ~$5-6

### Optional Comparisons

Add these when you want to compare Opus against competitors:

| Provider | Model | Model ID | Input/1M | Output/1M |
|----------|-------|----------|----------|-----------|
| Anthropic | Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | $3.00 | $15.00 |
| OpenAI | GPT-4.1 | `gpt-4.1` | $2.00 | $8.00 |
| OpenAI | o3 | `o3` | $2.00 | $8.00 |
| Google | Gemini 2.5 Pro | `gemini-2.5-pro` | $4.00 | $20.00 |
| xAI | Grok 4 | `grok-4` | $3.00 | $15.00 |

## Evaluation Framework

### EleutherAI lm-evaluation-harness

Primary framework for running benchmarks. Industry standard, powers Hugging Face leaderboard.

```bash
pip install lm-eval
pip install "lm_eval[api]"  # For API provider support
```

**API Provider Support**:
- `openai-chat-completions` - OpenAI models
- `anthropic-chat-completions` - Claude models
- Custom providers for Google/xAI (may need implementation)

**Usage Pattern**:
```bash
export OPENAI_API_KEY=...
lm_eval --model openai-chat-completions \
        --model_args model=gpt-4.1 \
        --tasks mmlu_pro \
        --output_path results/
```

### Integration Approach

Two options for Cloudflare Workers integration:

1. **Subprocess approach**: Run lm-eval as CLI from worker (requires compute beyond Workers)
2. **Dataset-only approach**: Use lm-eval datasets but implement evaluation loop in TypeScript

Recommendation: **Dataset-only approach** - fetch questions from lm-eval datasets, run prompts via our LLM provider layer, score results ourselves. This keeps everything in Cloudflare Workers.

## Benchmark: LiveCodeBench

### Why LiveCodeBench

- **Focus**: Code generation quality (primary interest)
- **Size**: ~400 problems from LeetCode, AtCoder, CodeForces
- **Contamination-resistant**: Continuously updated with new problems
- **Tests multiple skills**: Generation, self-repair, test prediction
- **Cost-effective**: ~$5-6 per full run (Opus 4.5)

### Access

- **Website**: [livecodebench.github.io](https://livecodebench.github.io/)
- **GitHub**: [LiveCodeBench/LiveCodeBench](https://github.com/LiveCodeBench/LiveCodeBench)
- **Paper**: [arXiv:2403.07974](https://arxiv.org/abs/2403.07974)

### Scoring

- **pass@1**: Does the generated code pass all test cases on first attempt?
- Execution-based evaluation (actually runs the code)

### Sampling Support

Run subsets during development to control costs:

| Sample Size | Est. Cost (Opus 4.5) | Use Case |
|-------------|----------------------|----------|
| 10 problems | ~$0.15 | Development/testing |
| 20 problems | ~$0.30 | Quick validation |
| 50 problems | ~$0.75 | Canary runs |
| 100 problems | ~$1.50 | Daily monitoring |
| Full (~400) | ~$5-6 | Weekly full benchmark |

### API

```typescript
POST /api/admin/run
{
  "benchmark": "livecodebench",
  "model": "claude-opus-4-5-20251101",
  "sample_size": 20  // optional, omit for full run
}
```

### Future Additions

| Benchmark | Size | Notes |
|-----------|------|-------|
| HumanEval+ | 164 | Classic code benchmark, enhanced tests |
| SWE-bench Verified | 500 | Real GitHub issues (expensive) |
| BigCodeBench | 1,140 | Multi-library coding tasks |

## Data Model

### D1 Schema

```sql
-- Benchmark definitions
CREATE TABLE benchmarks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  dataset_url TEXT,
  question_count INTEGER,
  scoring_method TEXT,  -- 'accuracy', 'pass_at_k', 'exact_match'
  tier TEXT DEFAULT 'daily',  -- 'daily', 'weekly', 'monthly'
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Model configurations (mirrors llm-observatory pattern)
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,  -- 'anthropic', 'openai', 'google', 'xai'
  model_name TEXT NOT NULL,  -- API model ID
  display_name TEXT NOT NULL,
  input_price_per_m REAL,   -- USD per 1M input tokens
  output_price_per_m REAL,  -- USD per 1M output tokens
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

-- Benchmark runs (one per benchmark per day)
CREATE TABLE benchmark_runs (
  id TEXT PRIMARY KEY,
  benchmark_id TEXT NOT NULL REFERENCES benchmarks(id),
  run_date TEXT NOT NULL,  -- YYYY-MM-DD
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(benchmark_id, run_date)
);

-- Results for each model in a run (cost tracking mirrors llm-observatory)
CREATE TABLE benchmark_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES benchmark_runs(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  score REAL,  -- 0.0 to 1.0
  correct_count INTEGER,
  total_count INTEGER,
  latency_avg_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  input_cost REAL,   -- Calculated: (input_tokens / 1M) * input_price_per_m
  output_cost REAL,  -- Calculated: (output_tokens / 1M) * output_price_per_m
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(run_id, model_id)
);

-- Individual question results (for debugging/analysis)
CREATE TABLE question_results (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL REFERENCES benchmark_results(id),
  question_id TEXT NOT NULL,
  correct INTEGER,
  response TEXT,
  expected TEXT,
  latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Cached benchmark questions (to avoid re-fetching)
CREATE TABLE benchmark_questions (
  id TEXT PRIMARY KEY,
  benchmark_id TEXT NOT NULL REFERENCES benchmarks(id),
  question_id TEXT NOT NULL,  -- Original ID from dataset
  question_text TEXT NOT NULL,
  choices TEXT,  -- JSON array for MC
  correct_answer TEXT,
  metadata TEXT,  -- JSON for extra fields
  UNIQUE(benchmark_id, question_id)
);
```

## API Endpoints

### Public (Dashboard)

```
GET /api/health
GET /api/benchmarks                    # List all benchmarks
GET /api/benchmarks/:id                # Benchmark details
GET /api/models                        # List all models
GET /api/results/latest                # Latest results for all benchmarks
GET /api/results/benchmark/:id         # Results for a benchmark over time
GET /api/results/model/:id             # Results for a model over time
GET /api/results/date/:date            # Results for a specific date
GET /api/comparison                    # Side-by-side model comparison
```

### Admin (Protected)

```
POST /api/admin/run/:benchmark_id      # Trigger manual run
POST /api/admin/run-all                # Trigger all daily benchmarks
POST /api/admin/sync-datasets          # Re-fetch benchmark datasets
PUT  /api/admin/models/:id             # Update model config
PUT  /api/admin/benchmarks/:id         # Update benchmark config
```

## Orchestration & Scheduling

### The Challenge

Running 12,000+ MMLU-Pro questions across 6 models takes hours. Cloudflare Workers cron triggers have execution time limits (30 sec free, 15 min paid). We need a different approach.

### Architecture: Cloudflare Queues + Cron

```
┌─────────────────────────────────────────────────────────────────┐
│  Daily Cron (6:00 AM UTC)                                       │
│  - Creates benchmark_run records                                │
│  - Enqueues work items to Queue                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Queue: benchmark-tasks                              │
│  Messages: { benchmark_id, model_id, question_batch: [0-99] }   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Queue Consumer (Worker)                                        │
│  - Processes batch of 100 questions                             │
│  - Calls LLM API with rate limiting                             │
│  - Stores results in D1                                         │
│  - ~30 sec per batch                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Progress Cron (every 5 min)                                    │
│  - Checks if all batches complete                               │
│  - Calculates final scores                                      │
│  - Marks run as completed                                       │
└─────────────────────────────────────────────────────────────────┘
```

### wrangler.toml Queue Config

```toml
[[queues.producers]]
binding = "BENCHMARK_QUEUE"
queue = "benchmark-tasks"

[[queues.consumers]]
queue = "benchmark-tasks"
max_batch_size = 1
max_retries = 3
dead_letter_queue = "benchmark-dlq"
```

### Work Distribution

For MMLU-Pro (12,032 questions) × 6 models:
- 121 batches per model (100 questions each)
- 726 total queue messages
- ~6 hours total runtime (with rate limiting)

### Alternative: GitHub Actions

If Queues add complexity, use GitHub Actions for orchestration:

```yaml
# .github/workflows/daily-benchmark.yml
name: Daily Benchmark Run
on:
  schedule:
    - cron: '0 6 * * *'  # 6 AM UTC

jobs:
  benchmark:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        model: [claude-opus, claude-sonnet, gpt-4.1, o3, gemini-pro, grok-4]
        benchmark: [mmlu-pro, simpleqa, livebench]
    steps:
      - name: Run benchmark batch
        run: |
          curl -X POST "https://benchmarks.emilycogsdill.com/api/admin/run" \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}" \
            -d '{"model": "${{ matrix.model }}", "benchmark": "${{ matrix.benchmark }}"}'
```

**Recommendation**: Start with GitHub Actions (simpler), migrate to Queues if needed.

## Frontend (React SPA)

### Pages

1. **Dashboard** (`/`)
   - Summary cards: latest scores per model
   - Trend sparklines for each benchmark
   - Quick comparison table

2. **Benchmark Detail** (`/benchmark/:id`)
   - Full results table
   - Historical chart
   - Question-level breakdown

3. **Model Detail** (`/model/:id`)
   - All benchmark scores for this model
   - Historical performance

4. **Comparison** (`/compare`)
   - Select 2-4 models
   - Side-by-side benchmark results

### Components

- `ScoreCard`: Model + score + trend indicator
- `BenchmarkTable`: Sortable results table
- `TrendChart`: Line chart over time (Recharts or Chart.js)
- `ComparisonGrid`: Multi-model comparison matrix

## Implementation Phases

### Phase 1: Foundation

1. Set up project structure (mirror llm-observatory)
2. Configure wrangler.toml for benchmarks.emilycogsdill.com
3. Implement LLM provider layer (copy from observatory)
4. Create D1 schema and migrations
5. Basic health endpoint

### Phase 2: Benchmark Engine (MMLU-Pro First)

1. Study lm-evaluation-harness dataset format and scoring
2. Implement MMLU-Pro question loading from Hugging Face
3. Implement MMLU-Pro scoring (10-choice accuracy)
4. Implement rate-limited evaluation runner
5. Store results in D1
6. Verify against published lm-eval results

### Phase 3: Additional Benchmarks

1. Implement SimpleQA (from OpenAI simple-evals)
2. Implement LiveBench (from LiveBench GitHub)
3. Add benchmark-specific scoring logic

### Phase 4: Orchestration

1. Set up GitHub Actions workflow for daily triggers
2. Implement `/api/admin/run` endpoint for single model+benchmark
3. Add batch progress tracking in D1
4. Implement retry logic for API failures
5. Add cost tracking per run

### Phase 5: Dashboard

1. Basic React SPA with Vite
2. API endpoints for results
3. Dashboard with score cards
4. Historical charts
5. Comparison view

### Phase 6: Polish

1. Error handling and alerting
2. Caching optimizations
3. Documentation
4. E2E tests

## Configuration

### wrangler.toml

```toml
name = "llm-benchmarks"
main = "src/index.ts"
compatibility_date = "2025-01-09"
compatibility_flags = ["nodejs_compat"]

[build]
command = "npm run build:frontend"

[[routes]]
pattern = "benchmarks.emilycogsdill.com"
custom_domain = true

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = true

[[d1_databases]]
binding = "DB"
database_name = "llm-benchmarks-db"
database_id = "..."

[triggers]
crons = ["0 6 * * *"]  # Daily at 6 AM UTC

[observability]
enabled = true
```

### Environment Variables

```bash
# LLM Provider Keys (reuse from llm-observatory)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
XAI_API_KEY=xai-...

# Admin
ADMIN_API_KEY=...

# Optional: Cloudflare Access for admin routes
CF_ACCESS_TEAM_DOMAIN=...
CF_ACCESS_AUD=...
```

## Cost Tracking

Costs are tracked per-run following the llm-observatory pattern:

```typescript
// Cost calculation (same as llm-observatory)
if (model.input_price_per_m !== null && inputTokens > 0) {
  inputCost = (inputTokens / 1_000_000) * model.input_price_per_m;
}
if (model.output_price_per_m !== null && outputTokens > 0) {
  outputCost = (outputTokens / 1_000_000) * model.output_price_per_m;
}
```

### Dashboard Cost Views

- Total cost per day (all models, all benchmarks)
- Cost breakdown by model
- Cost breakdown by benchmark
- Historical cost trends

## Open Questions

1. **Sampling strategy**: Fixed sample or rotating questions?
2. **Result storage**: Keep all question-level results or aggregate only?
3. **Public vs private**: Require auth for dashboard?
4. **Alerting**: Notify on significant score changes?

## References

- [llm-observatory](https://github.com/emily-flambe/llm-observatory) - Existing patterns
- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) - Benchmark framework
- [OpenAI simple-evals](https://github.com/openai/simple-evals) - Reference implementations
- Research docs in `docs/research/`

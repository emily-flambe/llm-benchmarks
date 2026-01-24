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
4. **Low operational cost** through smart sampling and caching
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
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │ Anthropic│      │  OpenAI  │      │  Google  │
   │   API    │      │   API    │      │   API    │
   └──────────┘      └──────────┘      └──────────┘
         │                                   │
         └───────────────┬───────────────────┘
                         ▼
                   ┌──────────┐
                   │   xAI    │
                   │   API    │
                   └──────────┘
```

## Models to Benchmark

### Tier 1: Daily (Balanced Performance/Cost)

| Provider | Model | Model ID | Est. Cost/Day |
|----------|-------|----------|---------------|
| Anthropic | Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | ~$15 |
| OpenAI | GPT-4.1 | `gpt-4.1` | ~$10 |
| Google | Gemini 2.5 Flash | `gemini-2.5-flash` | ~$3 |
| xAI | Grok 4 Fast | `grok-4-fast` | ~$2 |

**Total estimated daily cost**: ~$30

### Tier 2: Weekly (Flagship)

| Provider | Model | Model ID |
|----------|-------|----------|
| Anthropic | Claude Opus 4.5 | `claude-opus-4-5-20251101` |
| OpenAI | o3 | `o3` |
| Google | Gemini 2.5 Pro | `gemini-2.5-pro` |
| xAI | Grok 4 | `grok-4` |

## Benchmarks to Run

### Daily Core Benchmarks

| Benchmark | Size | Est. Time | Rationale |
|-----------|------|-----------|-----------|
| GPQA Diamond | 198 | 5-10 min | PhD-level, highly differentiating |
| IFEval | 500 | 10-15 min | Objective instruction following |
| GSM8K (sample) | 500 | 15-20 min | Math reasoning |
| HumanEval | 164 | 10-15 min | Code generation |
| TruthfulQA MC1 | 817 | 10-15 min | Truthfulness |

**Total questions per model**: ~2,179
**Estimated time per model**: 50-75 minutes
**Estimated cost per model**: ~$8-12

### Weekly Extended

| Benchmark | Size | Rationale |
|-----------|------|-----------|
| MMLU-Pro (sample) | 2,000 | Comprehensive knowledge |
| SimpleQA | 4,326 | Factual accuracy |
| LiveBench | ~1,000 | Contamination-resistant |

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

-- Model configurations
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,  -- 'anthropic', 'openai', 'google', 'xai'
  model_name TEXT NOT NULL,  -- API model ID
  display_name TEXT NOT NULL,
  tier TEXT DEFAULT 'daily',  -- 'daily', 'weekly'
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
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

-- Results for each model in a run
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
  cost_usd REAL,
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

## Scheduled Jobs

### Daily (6:00 AM UTC)

1. Check which benchmarks are due (daily tier)
2. Create benchmark_runs records
3. For each benchmark:
   - Load questions from cache (or fetch if missing)
   - For each active model:
     - Run questions with rate limiting
     - Calculate scores
     - Store results
4. Mark runs as completed

### Weekly (Sunday 6:00 AM UTC)

1. Run weekly tier benchmarks
2. Run flagship models on daily benchmarks

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

### Phase 2: Benchmark Engine

1. Implement benchmark question loading
   - GPQA Diamond from GitHub
   - HumanEval from GitHub
   - GSM8K from Hugging Face
   - TruthfulQA from Hugging Face
   - IFEval from Hugging Face
2. Implement scoring logic per benchmark type
3. Implement rate-limited evaluation runner
4. Store results in D1

### Phase 3: Scheduling

1. Implement cron job for daily runs
2. Add run status tracking
3. Implement retry logic for failures
4. Add cost tracking

### Phase 4: Dashboard

1. Basic React SPA with Vite
2. API endpoints for results
3. Dashboard with score cards
4. Historical charts
5. Comparison view

### Phase 5: Polish

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

## Cost Projections

### Daily

| Item | Cost |
|------|------|
| 4 models × ~$8 | $32 |
| Cloudflare Workers | Free tier |
| D1 Database | Free tier |
| **Total** | ~$32/day |

### Monthly

| Item | Cost |
|------|------|
| Daily runs (30 days) | $960 |
| Weekly flagship runs (4) | ~$200 |
| **Total** | ~$1,160/month |

### Cost Optimization Options

1. **Sample benchmarks**: Run 10-25% of questions daily
2. **Use cheaper models**: Gemini Flash-Lite, GPT-4.1 nano
3. **Batch API**: 50% discount (delayed results OK)
4. **Focus on flagship only weekly**

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

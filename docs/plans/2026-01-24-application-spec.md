# LLM Benchmarks Application Specification

**Date**: 2026-01-24
**Status**: Draft
**Domain**: benchmarks.emilycogsdill.com

## Summary

Track Claude Opus 4.5 code generation quality over time using LiveCodeBench. GitHub Actions handles orchestration and code execution; Cloudflare Workers serves the dashboard and API.

## Goals

1. **Track Opus 4.5 code quality** over time with LiveCodeBench
2. **Simple, visually pleasing dashboard** showing scores and trends
3. **Cost-effective** (~$5-6 per full run, sampling for dev)
4. **Reuse patterns** from llm-observatory for consistency

## Non-Goals

- Supporting many models (Opus 4.5 primary, comparisons optional)
- Real-time evaluation (daily batch is fine)
- Complex analytics or ML on results
- Over-engineered infrastructure

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions (Daily Cron)                                    │
│  - Fetches LiveCodeBench problems                               │
│  - Calls LLM APIs for code generation                           │
│  - Executes generated code (Python runtime available)           │
│  - Scores pass@1 results                                        │
│  - POSTs results to Cloudflare Worker API                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Workers                                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐                            │
│  │   Frontend   │  │   Backend    │                            │
│  │   (React)    │  │   (Hono)     │                            │
│  └──────────────┘  └──────────────┘                            │
│         │                 │                                     │
│         └─────────────────┘                                     │
│                  │                                              │
│  ┌───────────────┴───────────────┐                             │
│  │         D1 Database           │                             │
│  │  - Run history & scores       │                             │
│  │  - Cost tracking              │                             │
│  └───────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

**Why this split?**
- GitHub Actions can execute Python code (required for pass@1 scoring)
- Cloudflare Workers cannot run arbitrary code
- Workers are great for the API and dashboard

## Models

### Primary: Claude Opus 4.5

| Model | Model ID | Input/1M | Output/1M |
|-------|----------|----------|-----------|
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | $5.00 | $25.00 |

**Cost per full run**: ~$5-6

### Optional Comparisons

| Provider | Model | Model ID | Input/1M | Output/1M |
|----------|-------|----------|----------|-----------|
| OpenAI | GPT-4.1 | `gpt-4.1` | $2.00 | $8.00 |
| OpenAI | o3 | `o3` | $2.00 | $8.00 |
| Google | Gemini 2.5 Pro | `gemini-2.5-pro` | $4.00 | $20.00 |

## Benchmark: LiveCodeBench

### Why LiveCodeBench

- **Focus**: Code generation quality
- **Size**: ~400 problems from LeetCode, AtCoder, CodeForces
- **Contamination-resistant**: Continuously updated
- **Cost-effective**: ~$5-6 per full run

### Scoring

- **pass@1**: Does generated code pass all test cases on first attempt?
- Requires actual code execution (handled by GitHub Actions)

### Sampling

| Sample Size | Cost (Opus) | Use Case |
|-------------|-------------|----------|
| 10 problems | ~$0.15 | Development |
| 50 problems | ~$0.75 | Quick validation |
| 100 problems | ~$1.50 | Daily monitoring |
| Full (~400) | ~$5-6 | Weekly full run |

**Decision**: Use fixed random seed for reproducible samples. Full runs weekly, sampled runs (50-100) daily.

### Access

- **GitHub**: [LiveCodeBench/LiveCodeBench](https://github.com/LiveCodeBench/LiveCodeBench)
- **Hugging Face**: [livecodebench/livecodebench](https://huggingface.co/datasets/livecodebench/livecodebench)

### Future Additions

| Benchmark | Size | Cost | Notes |
|-----------|------|------|-------|
| **IFEval** | 500 | ~$5 | Instruction following (no code execution needed) |

## GitHub Actions Workflow

```yaml
# .github/workflows/benchmark.yml
name: LiveCodeBench

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:
    inputs:
      sample_size:
        description: 'Number of problems (0 = full)'
        default: '100'
      model:
        description: 'Model to benchmark'
        default: 'claude-opus-4-5-20251101'

jobs:
  benchmark:
    runs-on: ubuntu-latest
    timeout-minutes: 120

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install anthropic openai httpx

      - name: Run benchmark
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ADMIN_API_KEY: ${{ secrets.ADMIN_API_KEY }}
        run: python scripts/run_benchmark.py --model ${{ inputs.model || 'claude-opus-4-5-20251101' }} --sample ${{ inputs.sample_size || '100' }}

      - name: Upload results
        run: |
          curl -X POST "https://benchmarks.emilycogsdill.com/api/results" \
            -H "Authorization: Bearer $ADMIN_API_KEY" \
            -H "Content-Type: application/json" \
            -d @results.json
```

## Data Model

### D1 Schema

```sql
-- Model configurations
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  input_price_per_m REAL,
  output_price_per_m REAL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Benchmark runs
CREATE TABLE benchmark_runs (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  run_date TEXT NOT NULL,
  sample_size INTEGER,
  score REAL,  -- 0.0 to 1.0 (pass@1)
  passed_count INTEGER,
  total_count INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  input_cost REAL,
  output_cost REAL,
  duration_seconds INTEGER,
  github_run_id TEXT,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Per-problem results (compact, no full responses stored)
CREATE TABLE problem_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES benchmark_runs(id),
  problem_id TEXT NOT NULL,
  passed INTEGER NOT NULL,  -- 0 or 1
  error_type TEXT,  -- null, 'syntax', 'runtime', 'wrong_answer', 'timeout'
  latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for dashboard queries
CREATE INDEX idx_runs_date ON benchmark_runs(run_date DESC);
CREATE INDEX idx_runs_model ON benchmark_runs(model_id, run_date DESC);
```

**Note**: Full responses are NOT stored to keep D1 lean. If debugging needed, re-run that specific problem.

## API Endpoints

### Public (Dashboard)

```
GET /api/health
GET /api/runs                      # Recent runs with scores
GET /api/runs/:id                  # Single run details
GET /api/runs/:id/problems         # Problem-level results
GET /api/trends                    # Score over time for charts
GET /api/models                    # Configured models
```

### Admin (Protected by ADMIN_API_KEY)

```
POST /api/results                  # Submit run results (from GitHub Actions)
```

**Rate limiting**: Admin endpoints limited to 10 requests/minute to prevent runaway costs from leaked keys.

## Frontend

### Dashboard (Single Page)

Keep it simple - one page with:

1. **Current Score Card**
   - Latest pass@1 score (big number)
   - Date of last run
   - Sample size indicator

2. **Trend Chart**
   - Line chart of scores over past 30 days
   - Use Recharts (simple, no dependencies)

3. **Recent Runs Table**
   - Date, score, sample size, cost
   - Click to see problem-level breakdown

4. **Cost Summary**
   - Total spent this month
   - Average per run

### Design Principles

- Clean, minimal (not flashy)
- Dark mode default
- Mobile-friendly
- No login required (read-only public)

## Implementation Phases

### Phase 1: GitHub Actions Runner

1. Script to fetch LiveCodeBench problems
2. Script to call Anthropic API
3. Script to execute generated code safely
4. Script to calculate pass@1 and POST results
5. Workflow file with schedule

### Phase 2: Cloudflare Worker API

1. Project setup (copy patterns from llm-observatory)
2. D1 schema and migrations
3. POST /api/results endpoint
4. GET endpoints for dashboard

### Phase 3: Dashboard

1. React SPA with Vite
2. Score card and trend chart
3. Runs table
4. Deploy to Workers

### Phase 4: Polish

1. Error notifications (GitHub Actions failures)
2. Cost alerts if spending exceeds threshold
3. README and setup docs

## Configuration

### wrangler.toml

```toml
name = "llm-benchmarks"
main = "src/index.ts"
compatibility_date = "2026-01-01"
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

[observability]
enabled = true
```

### GitHub Secrets

```
ANTHROPIC_API_KEY - For calling Claude API
OPENAI_API_KEY - For optional comparisons
ADMIN_API_KEY - For posting results to Worker
```

### Environment Variables (Worker)

```
ADMIN_API_KEY - Must match GitHub secret
```

## Decisions

| Question | Decision |
|----------|----------|
| Sampling strategy | Fixed random seed for reproducibility |
| Result storage | Aggregate only (no full responses) |
| Dashboard auth | Public read-only |
| Alerting | GitHub Actions email on failure |

## References

- [llm-observatory](https://github.com/emily-flambe/llm-observatory) - Patterns to reuse
- [LiveCodeBench](https://github.com/LiveCodeBench/LiveCodeBench) - Benchmark dataset
- Research docs in `docs/research/`

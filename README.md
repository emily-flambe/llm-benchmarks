# LLM Benchmarks

Track LLM code generation quality over time using [LiveCodeBench](https://livecodebench.github.io/).

**Live**: [benchmarks.emilycogsdill.com](https://benchmarks.emilycogsdill.com)

## Models Tracked

- Claude Opus 4.5
- Claude Sonnet 4
- GPT-4.1
- GPT-5.1
- GPT-5.2
- o3

## Architecture

```
GitHub Actions               Cloudflare Workers + D1
┌─────────────────────┐      ┌─────────────────────┐
│ Fetch problems      │      │ Store results       │
│ Call model API      │─────▶│ Serve dashboard     │
│ Execute code        │      │ Trigger workflows   │
│ Score pass@1        │      │ Manage schedules    │
└─────────────────────┘      └─────────────────────┘
```

- **GitHub Actions**: Runs benchmarks per model (executes Python for scoring)
- **Cloudflare Workers**: REST API, React dashboard, schedule management
- **Durable Objects**: Deduplicates scheduled runs across Worker instances

## Dashboard Features

- **ScoreCard**: Aggregated pass@1 scores with date range filtering
- **RankChart**: Bar chart comparing models, sorted by score
- **TrendChart**: Line chart showing score trends over 30 days
- **CostSummary**: API costs (authenticated users only)
- **Model filter pills**: Toggle model visibility across all charts
- **Run History**: View past GitHub Actions workflow runs
- **Schedules**: Configure cron-based benchmark schedules

## Benchmark: LiveCodeBench

| | |
|---|---|
| **Problems** | ~400 (LeetCode, AtCoder, CodeForces) |
| **Metric** | pass@1 (code passes all tests on first try) |
| **Why** | Contamination-resistant, continuously updated |

## Tech Stack

- **Benchmark runner**: GitHub Actions (Python)
- **API**: Cloudflare Workers (Hono)
- **Frontend**: React + Recharts
- **Database**: Cloudflare D1
- **Scheduling**: Durable Objects + cron triggers

## Related

- [llm-observatory](https://github.com/emily-flambe/llm-observatory) - LLM response collection

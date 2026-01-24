# LLM Benchmarks

Track Claude Opus 4.5 code generation quality over time using LiveCodeBench.

**Live**: [benchmarks.emilycogsdill.com](https://benchmarks.emilycogsdill.com) (coming soon)

## How It Works

```
GitHub Actions (daily)     Cloudflare Workers
┌─────────────────────┐    ┌─────────────────────┐
│ Fetch problems      │    │                     │
│ Call Claude API     │───▶│ Store results (D1)  │
│ Execute code        │    │ Serve dashboard     │
│ Score pass@1        │    │                     │
└─────────────────────┘    └─────────────────────┘
```

- **GitHub Actions**: Runs benchmarks (can execute Python code for scoring)
- **Cloudflare Workers**: API + dashboard (can't execute arbitrary code)

## Benchmark: LiveCodeBench

| | |
|---|---|
| **Problems** | ~400 (LeetCode, AtCoder, CodeForces) |
| **Metric** | pass@1 (code passes all tests on first try) |
| **Why** | Contamination-resistant, continuously updated |

## Costs

| Sample Size | Cost (Opus 4.5) | Use Case |
|-------------|-----------------|----------|
| 10 problems | ~$0.15 | Development |
| 100 problems | ~$1.50 | Daily runs |
| Full (~400) | ~$5-6 | Weekly runs |

## Project Status

**Under Development**

See [docs/plans/2026-01-24-application-spec.md](docs/plans/2026-01-24-application-spec.md) for full spec.

## Tech Stack

- **Benchmark runner**: GitHub Actions (Python)
- **API & Dashboard**: Cloudflare Workers (Hono + React)
- **Database**: Cloudflare D1

## Related

- [llm-observatory](https://github.com/emily-flambe/llm-observatory) - LLM response collection

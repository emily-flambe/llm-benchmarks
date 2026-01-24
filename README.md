# LLM Benchmarks

Code quality benchmarking for Claude Opus 4.5.

**Live**: [benchmarks.emilycogsdill.com](https://benchmarks.emilycogsdill.com) (coming soon)

## Overview

Track Claude Opus 4.5 code generation performance over time using LiveCodeBench.

### Benchmark: LiveCodeBench

| | |
|---|---|
| **Problems** | ~400 (from LeetCode, AtCoder, CodeForces) |
| **Measures** | Code generation, self-repair, test prediction |
| **Why** | Contamination-resistant (continuously updated) |
| **Cost** | ~$5-6 per full run, supports sampling for cheaper dev runs |

### Sampling Support

| Sample Size | Cost (Opus 4.5) | Use Case |
|-------------|-----------------|----------|
| 10 problems | ~$0.15 | Development |
| 50 problems | ~$0.75 | Quick check |
| Full (~400) | ~$5-6 | Full benchmark |

### Primary Model

**Claude Opus 4.5** - with optional comparisons against GPT-4.1, o3, Gemini 2.5 Pro, Grok 4

## Project Status

🚧 **Under Development**

See [docs/plans/2026-01-24-application-spec.md](docs/plans/2026-01-24-application-spec.md) for the full specification.

## Documentation

- [Application Spec](docs/plans/2026-01-24-application-spec.md) - Full design document
- [Research: LLM Observatory Patterns](docs/research/01-llm-observatory-patterns.md) - Reusable patterns
- [Research: Benchmark Landscape](docs/research/02-benchmark-landscape.md) - Benchmark evaluation
- [Research: Frontier Model APIs](docs/research/03-frontier-model-apis.md) - API reference

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: React + Vite
- **Deployment**: Wrangler CLI

## Development

```bash
# Setup
make setup

# Development
make dev

# Deploy
make deploy
```

## Related Projects

- [llm-observatory](https://github.com/emily-flambe/llm-observatory) - LLM response collection and analysis

## License

MIT

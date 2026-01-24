# LLM Benchmarks

Automated daily benchmarking of frontier LLMs from Anthropic, OpenAI, Google, and xAI.

**Live**: [benchmarks.emilycogsdill.com](https://benchmarks.emilycogsdill.com) (coming soon)

## Overview

This application runs standardized LLM benchmarks daily across frontier models, tracking performance over time and displaying results in a simple dashboard.

### Models Evaluated (Daily)

| Provider | Model |
|----------|-------|
| Anthropic | Claude Opus 4.5 |
| Anthropic | Claude Sonnet 4.5 |
| OpenAI | GPT-4.1 |
| OpenAI | o3 |
| Google | Gemini 2.5 Pro |
| xAI | Grok 4 |

### Benchmarks

| Benchmark | Questions | Measures |
|-----------|-----------|----------|
| GPQA Diamond | 198 | PhD-level reasoning |
| IFEval | 500 | Instruction following |
| GSM8K | 500 (sampled) | Math reasoning |
| HumanEval | 164 | Code generation |
| TruthfulQA | 817 | Truthfulness |

## Project Status

🚧 **Under Development**

See [docs/plans/2025-01-24-application-spec.md](docs/plans/2025-01-24-application-spec.md) for the full specification.

## Documentation

- [Application Spec](docs/plans/2025-01-24-application-spec.md) - Full design document
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

# Frontier Model APIs (January 2025)

Current state of APIs for Anthropic, OpenAI, Google, and xAI.

## Quick Reference

| Provider | Best Model | Input/Output (per 1M) | Context | Key Feature |
|----------|------------|----------------------|---------|-------------|
| Anthropic | Claude Opus 4.5 | $5/$25 | 200K | Extended thinking |
| OpenAI | GPT-4.1 | $2/$8 | 1M | 1M context |
| Google | Gemini 2.5 Pro | $4/$20 | 1M | Free tier |
| xAI | Grok 4 Fast | $0.20/$0.50 | 2M | 2M context, cheap |

## Anthropic (Claude)

### Current Models

| Model | Model ID | Context |
|-------|----------|---------|
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | 200K |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | 200K |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | 200K |
| Claude 3.7 Sonnet | `claude-3-7-sonnet-20250219` | 200K |

**Note**: Claude 3 Opus deprecated June 30, 2025.

### API

- **Endpoint**: `POST https://api.anthropic.com/v1/messages`
- **Auth**: `x-api-key: $ANTHROPIC_API_KEY`
- **Required**: `anthropic-version: 2023-06-01`

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Pricing

| Model | Input | Output |
|-------|-------|--------|
| Claude Opus 4.5 | $5.00 | $25.00 |
| Claude Sonnet 4.5 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |

- Batch API: 50% discount
- Prompt caching: 0.1x base for cache hits

### Rate Limits

Tier-based, scaling with spend. Entry tier ~5 RPM, 20K TPM for Sonnet.

### Special Features

- **Extended Thinking**: `"thinking": {"type": "enabled", "budget_tokens": 10000}`
- **Tool Use**: JSON schema definitions with `strict: true`
- **Computer Use**: Beta, requires `computer-use-2024-10-22` header

### Docs

- [Models](https://docs.anthropic.com/en/docs/about-claude/models)
- [Messages API](https://docs.claude.com/en/api/messages)
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

---

## OpenAI

### Current Models

| Model | Model ID | Context |
|-------|----------|---------|
| GPT-4.1 | `gpt-4.1` | 1M |
| GPT-4.1 mini | `gpt-4.1-mini` | 1M |
| GPT-4.1 nano | `gpt-4.1-nano` | 1M |
| o3 | `o3` | 128K |
| o3-pro | `o3-pro-2025-06-10` | 128K |
| o4-mini | `o4-mini` | 128K |
| GPT-4o | `gpt-4o` | 128K |
| GPT-4o mini | `gpt-4o-mini` | 128K |

### API

- **Endpoint**: `POST https://api.openai.com/v1/chat/completions`
- **Auth**: `Authorization: Bearer $OPENAI_API_KEY`

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Pricing

| Model | Input | Output |
|-------|-------|--------|
| GPT-4.1 | $2.00 | $8.00 |
| GPT-4o | $2.50 | $10.00 |
| GPT-4o mini | $0.15 | $0.60 |
| o3 | $2.00 | $8.00 |

- Batch API: 50% discount

### Rate Limits

Tier-based (1-5). Example Tier 1: ~500K TPM, ~1,000 RPM.

### Special Features

- **Reasoning**: Use `max_completion_tokens` for o-series, not `max_tokens`
- **Reasoning effort**: `reasoning_effort`: none/minimal/low/medium/high/xhigh
- **Structured Outputs**: `strict: true` for guaranteed schema
- **Responses API**: New unified API at `/v1/responses`

### Docs

- [Models](https://platform.openai.com/docs/models/)
- [Chat Completions](https://platform.openai.com/docs/api-reference/chat)
- [Pricing](https://openai.com/api/pricing/)

---

## Google (Gemini)

### Current Models

| Model | Model ID | Context |
|-------|----------|---------|
| Gemini 2.5 Pro | `gemini-2.5-pro` | 1M |
| Gemini 2.5 Flash | `gemini-2.5-flash` | 1M |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | 1M |
| Gemini 2.0 Flash | `gemini-2.0-flash` | 1M |

**Note**: All Gemini 1.5 models retired (404 errors).

### API

- **Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Auth**: Query param `key=$GEMINI_API_KEY`

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello"}]}]
  }'
```

### Pricing

| Model | Input | Output |
|-------|-------|--------|
| Gemini 2.5 Pro | $4.00 | $20.00 |
| Gemini 2.5 Flash | ~$0.50 | ~$2.00 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 |

- Batch: 50% discount
- **Free Tier**: 5-15 RPM, 250K TPM, up to 1,000 RPD

### Rate Limits

- Free: 5-15 RPM, 250K TPM, 1,000 RPD
- Paid Tier 1: 300 RPM, 1M TPM

### Special Features

- **Code Execution**: Built-in Python sandbox (30 sec max)
- **Google Search Grounding**: $35 per 1,000 requests after free
- **Multi-tool**: Can combine code execution + search

### Docs

- [Models](https://ai.google.dev/gemini-api/docs/models)
- [API Reference](https://ai.google.dev/api)
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing)

---

## xAI (Grok)

### Current Models

| Model | Model ID | Context |
|-------|----------|---------|
| Grok 4 | `grok-4` | 256K |
| Grok 4 Fast | `grok-4-fast` | 2M |
| Grok 4.1 Fast | `grok-4-1-fast` | 2M |
| Grok 3 | `grok-3` | 131K |
| Grok 3 Mini | `grok-3-mini` | 131K |

### API

- **Endpoint**: `POST https://api.x.ai/v1/chat/completions`
- **Auth**: `Authorization: Bearer $XAI_API_KEY`
- **Compatibility**: OpenAI SDK works with base URL change

```bash
curl https://api.x.ai/v1/chat/completions \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4-fast",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Pricing

| Model | Input | Output |
|-------|-------|--------|
| Grok 4 | $3.00 | $15.00 |
| Grok 4 Fast | $0.20 | $0.50 |
| Grok 3 | $3.00 | $15.00 |
| Grok 3 Mini | $0.30 | $0.50 |

- Live Search: $25 per 1,000 sources
- Server tools: $2.50-$5 per 1,000 calls

### Special Features

- **2M Context**: Grok 4 Fast, 4.1 Fast
- **Function Calling**: Up to 200 tools per request
- **Agent Tools**: Real-time X data, web search, code execution
- **Prompt Caching**: Use `x-grok-conv-id` header

### Docs

- [Models](https://docs.x.ai/docs/models)
- [API Reference](https://docs.x.ai/docs/api-reference)

---

## Model Selection for Benchmarking

### Daily Benchmark Runs (Cost-Optimized)

| Provider | Recommended Model | Cost/1M |
|----------|-------------------|---------|
| Anthropic | Claude Sonnet 4.5 | $3/$15 |
| OpenAI | GPT-4.1 | $2/$8 |
| Google | Gemini 2.5 Flash | $0.50/$2 |
| xAI | Grok 4 Fast | $0.20/$0.50 |

### Flagship Comparison (Full Power)

| Provider | Flagship Model | Cost/1M |
|----------|----------------|---------|
| Anthropic | Claude Opus 4.5 | $5/$25 |
| OpenAI | o3-pro | Varies |
| Google | Gemini 2.5 Pro | $4/$20 |
| xAI | Grok 4 | $3/$15 |

### Rate Limit Strategy

1. **Implement exponential backoff** for all providers
2. **Batch requests** where possible
3. **Use async/parallel** within rate limits
4. **Track usage** to stay under daily limits
5. **Consider Batch APIs** for non-time-critical runs (50% discount)

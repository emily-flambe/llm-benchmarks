# LLM Observatory Patterns Reference

Research document capturing patterns from the existing llm-observatory project that should be reused in llm-benchmarks.

## Project Structure

```
llm-observatory/
├── src/                          # Backend (Cloudflare Workers + Hono)
│   ├── index.ts                  # Entry point + scheduled cron
│   ├── routes/api.ts             # API endpoints
│   ├── services/
│   │   ├── llm/                  # LLM provider abstractions
│   │   │   ├── types.ts          # LLMProvider interface
│   │   │   ├── index.ts          # Factory: createLLMProvider()
│   │   │   ├── anthropic.ts
│   │   │   ├── openai.ts
│   │   │   ├── google.ts
│   │   │   ├── xai.ts
│   │   │   ├── cloudflare.ts
│   │   │   └── deepseek.ts
│   │   ├── storage.ts            # D1 database operations
│   │   └── bigquery.ts           # BigQuery integration
│   ├── middleware/access.ts      # Cloudflare Access JWT
│   ├── types/env.ts              # Environment bindings
│   └── db/schema.sql             # D1 schema
├── frontend/                     # React + Vite SPA
├── migrations/                   # D1 migrations
├── docs/plans/                   # Design documents
├── tests/                        # Unit tests (Vitest)
└── e2e/                          # E2E tests (Playwright)
```

## Credential Management

### Environment Configuration (src/types/env.ts)

```typescript
export interface Env {
  // Bindings
  DB: D1Database;
  ASSETS: Fetcher;
  AI: Ai;

  // LLM Provider Secrets
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  XAI_API_KEY: string;
  DEEPSEEK_API_KEY: string;

  // BigQuery Config
  BQ_SERVICE_ACCOUNT_EMAIL: string;
  BQ_PRIVATE_KEY: string;  // base64-encoded PEM
  BQ_PROJECT_ID: string;
  BQ_DATASET_ID: string;
  BQ_TABLE_ID: string;

  // Cloudflare Access
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;

  // Admin
  ADMIN_API_KEY: string;
}
```

### Secret Management

- **Local dev**: `.dev.vars` file (gitignored)
- **Production**: `npx wrangler secret bulk .dev.vars`
- **Critical**: `.dev.vars` must be copied AFTER `make setup` (setup overwrites with .example)

## LLM Provider Interface

All providers implement a common interface:

```typescript
export interface LLMProvider {
  id: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  reasoningContent?: string;   // For reasoning models
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  citations?: Citation[];       // For grounded models
  searchQueries?: string[];
}
```

### Factory Pattern

```typescript
export function createLLMProvider(
  modelId: string,
  provider: string,
  modelName: string,
  env: Env,
  grounded: boolean = false
): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(modelId, modelName, env.OPENAI_API_KEY, grounded);
    case 'anthropic':
      return new AnthropicProvider(modelId, modelName, env.ANTHROPIC_API_KEY, grounded);
    case 'google':
      return new GoogleProvider(modelId, modelName, env.GOOGLE_API_KEY, grounded);
    case 'xai':
      return new XAIProvider(modelId, modelName, env.XAI_API_KEY, grounded);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

## Provider API Patterns

### Anthropic

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': this.apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: this.modelName,
    messages: [{ role: 'user', content: request.prompt }],
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature ?? 0.7,
  }),
});
```

### OpenAI

```typescript
// Note: o1/o3 models use max_completion_tokens instead of max_tokens
const usesCompletionTokens = this.modelName.startsWith('o1') ||
                             this.modelName.startsWith('o3');

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.apiKey}`,
  },
  body: JSON.stringify({
    model: this.modelName,
    messages: [{ role: 'user', content: request.prompt }],
    ...(usesCompletionTokens
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens }),
    temperature,
  }),
});
```

### Google Gemini

```typescript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: request.prompt }] }],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      },
    }),
  }
);
```

### xAI (Grok)

```typescript
// OpenAI-compatible endpoint
const response = await fetch('https://api.x.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.apiKey}`,
  },
  body: JSON.stringify({
    model: this.modelName,
    messages: [{ role: 'user', content: request.prompt }],
    max_tokens: maxTokens,
    temperature,
  }),
});
```

## Cloudflare Workers Deployment

### wrangler.toml Configuration

```toml
name = "llm-observatory"
main = "src/index.ts"
compatibility_date = "2025-01-09"
compatibility_flags = ["nodejs_compat"]

[build]
command = "npm run build:frontend"

[[routes]]
pattern = "observatory.emilycogsdill.com"
custom_domain = true

[ai]
binding = "AI"
remote = true

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = true

[[d1_databases]]
binding = "DB"
database_name = "llm-observatory-db"
database_id = "..."

[triggers]
crons = ["* * * * *"]  # Every minute

[observability]
enabled = true
```

### Scheduled Events

```typescript
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const scheduledTime = new Date(event.scheduledTime);
    const hour = scheduledTime.getUTCHours();
    const minute = scheduledTime.getUTCMinutes();

    // Daily tasks at specific times
    if (hour === 6 && minute === 0) {
      ctx.waitUntil(runDailyTask(env));
    }

    // Minute-by-minute scheduled checks
    ctx.waitUntil(runScheduledItems(env, scheduledTime));
  },
};
```

## Database Architecture

### D1 (SQLite) - Configuration & Metadata

Used for: models, schedules, configurations, rate limits

### BigQuery - Response Data

Used for: LLM responses, metrics, historical data

```typescript
export interface BigQueryRow {
  id: string;
  collected_at: string;
  source: string;
  company: string;
  model: string;
  prompt: string;
  response: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  success: boolean;
}
```

### BigQuery JWT Authentication

Uses Web Crypto API (no external deps) for self-signed JWT service account authentication. Tokens cached for 1 hour.

## Key Development Commands

```bash
make setup         # Copies .dev.vars, installs deps, inits DB
make dev           # Starts local server on port 8787
make test          # Unit tests (Vitest)
make test-e2e      # E2E tests (Playwright)
make deploy        # Deploy to Cloudflare
```

## Critical Gotchas

1. **ONE worker only** - never create extras, never use `wrangler delete`
2. **Secrets cannot be recovered** if worker is deleted
3. **`.dev.vars` gets overwritten** by `make setup` - copy credentials after
4. **Use git worktrees** for feature work, don't work on main

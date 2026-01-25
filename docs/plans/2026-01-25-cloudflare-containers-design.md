# Cloudflare Containers Benchmark Runner

## Overview

Replace GitHub Actions with Cloudflare Containers for running LLM benchmarks. Adds on-demand triggering via API/dashboard and configurable per-model schedules.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │   API       │  │   Cron      │  │   Scheduler DO           │ │
│  │  /api/runs  │  │  Trigger    │  │  (deduplication)         │ │
│  │  /api/sched │  │  (* * * * *)│  │                          │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────────────────────┘ │
│         └────────┬───────┘                                       │
│                  ▼                                               │
│         ┌───────────────┐                                        │
│         │  Container    │──────► Spawn per model                 │
│         │  Orchestrator │                                        │
│         └───────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Cloudflare Containers                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Opus Runner │  │Sonnet Runner│  │  o3 Runner  │  ...         │
│  │  (Node.js)  │  │  (Node.js)  │  │  (Node.js)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema Changes

```sql
-- Model schedules (extends existing models table concept)
CREATE TABLE IF NOT EXISTS model_schedules (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  cron_expression TEXT NOT NULL,        -- e.g., "0 6 * * *" (daily 6am UTC)
  sample_size INTEGER NOT NULL,         -- e.g., 100
  is_paused INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(model_id)                      -- One schedule per model
);

-- Track running/completed container executions
CREATE TABLE IF NOT EXISTS container_runs (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  sample_size INTEGER NOT NULL,
  status TEXT NOT NULL,                 -- 'pending', 'running', 'completed', 'failed'
  trigger_type TEXT NOT NULL,           -- 'manual', 'scheduled'
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## API Endpoints

### Run Management
- `POST /api/container-runs` - Trigger a benchmark run
  - Body: `{ model_id: string, sample_size: number }`
  - Returns: `{ run_id: string }`

- `GET /api/container-runs` - List runs with status
- `GET /api/container-runs/:id` - Get run details

### Schedule Management
- `GET /api/schedules` - List all model schedules
- `POST /api/schedules` - Create/update schedule
  - Body: `{ model_id: string, cron_expression: string, sample_size: number }`
- `DELETE /api/schedules/:model_id` - Remove schedule
- `PATCH /api/schedules/:model_id/pause` - Pause/unpause

## Container Implementation

TypeScript benchmark runner (`src/container/benchmark-runner.ts`):

```typescript
// Runs inside Cloudflare Container
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

interface BenchmarkConfig {
  modelId: string;
  modelName: string;
  provider: 'anthropic' | 'openai';
  sampleSize: number;
  apiKey: string;
  callbackUrl: string;  // Worker URL to report results
}

// Load problems from HuggingFace (fetch JSON directly)
async function loadProblems(sampleSize: number): Promise<Problem[]> {
  const response = await fetch(
    'https://huggingface.co/datasets/livecodebench/code_generation_lite/resolve/main/data/test.jsonl'
  );
  // Parse and sample...
}

// Execute generated code using isolated-vm or similar
async function executeCode(code: string, input: string): Promise<ExecutionResult> {
  // Use isolated-vm for sandboxed execution
}

// Main benchmark loop
async function runBenchmark(config: BenchmarkConfig) {
  const problems = await loadProblems(config.sampleSize);
  const results = [];

  for (const problem of problems) {
    const code = await callLLM(config, problem);
    const result = await executeCode(code, problem.testInput);
    results.push(result);

    // Report progress
    await fetch(config.callbackUrl, {
      method: 'POST',
      body: JSON.stringify({ type: 'progress', problem: problem.id, result })
    });
  }

  // Report completion
  await fetch(config.callbackUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'complete', results })
  });
}
```

## Frontend Changes

### New "Schedules" Tab
- Table of models with their schedules
- Add/edit schedule modal (cron builder + sample size)
- Pause/resume toggle
- "Run Now" button per model

### Dashboard Updates
- "Run Benchmark" button in header
- Model selector + sample size input
- Live status indicator for running benchmarks

## Cron Trigger

```typescript
// In wrangler.toml
[triggers]
crons = ["* * * * *"]  // Every minute

// In src/index.ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await runDueSchedules(env, new Date(event.scheduledTime));
  }
}
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/db/schema.sql` | Add model_schedules, container_runs tables |
| `src/index.ts` | Add schedule/run API endpoints, cron handler |
| `src/container/benchmark-runner.ts` | New - Container entry point |
| `src/container/llm-clients.ts` | New - Anthropic/OpenAI clients |
| `src/container/code-executor.ts` | New - Sandboxed code execution |
| `src/container/problem-loader.ts` | New - HuggingFace dataset loader |
| `src/services/scheduler-do.ts` | New - Deduplication DO |
| `src/services/container-orchestrator.ts` | New - Spawn/manage containers |
| `frontend/src/components/SchedulesTab.tsx` | New - Schedule management UI |
| `frontend/src/components/RunBenchmarkModal.tsx` | New - Ad-hoc run UI |
| `wrangler.toml` | Add cron trigger, Container config |

## Implementation Order

1. Database schema + migrations
2. Scheduler DO (copy from llm-observatory)
3. Schedule CRUD API endpoints
4. Container benchmark runner (TypeScript port)
5. Container orchestrator
6. Cron trigger integration
7. Frontend: Schedules tab
8. Frontend: Run Benchmark modal
9. Testing + deployment

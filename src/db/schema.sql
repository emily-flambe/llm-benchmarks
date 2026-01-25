-- LLM Benchmarks D1 Schema
-- Run with: wrangler d1 execute llm-benchmarks-db --file=./src/db/schema.sql

-- Model configurations
CREATE TABLE IF NOT EXISTS models (
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
CREATE TABLE IF NOT EXISTS benchmark_runs (
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
CREATE TABLE IF NOT EXISTS problem_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES benchmark_runs(id),
  problem_id TEXT NOT NULL,
  passed INTEGER NOT NULL,  -- 0 or 1
  error_type TEXT,  -- null, 'syntax', 'runtime', 'wrong_answer', 'timeout'
  latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Workflow execution metadata (registered when workflow starts)
CREATE TABLE IF NOT EXISTS workflow_executions (
  github_run_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  trigger_source TEXT DEFAULT 'manual',  -- 'manual' or 'scheduled'
  created_at TEXT DEFAULT (datetime('now'))
);

-- Model schedules for automated benchmark runs
CREATE TABLE IF NOT EXISTS model_schedules (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  cron_expression TEXT NOT NULL,        -- e.g., "0 6 * * *" (daily 6am UTC)
  sample_size INTEGER NOT NULL DEFAULT 100,
  is_paused INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Container benchmark runs (replaces workflow_executions for new runs)
CREATE TABLE IF NOT EXISTS container_runs (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  sample_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  trigger_type TEXT NOT NULL,              -- 'manual', 'scheduled'
  progress_current INTEGER DEFAULT 0,      -- Problems completed so far
  progress_total INTEGER DEFAULT 0,        -- Total problems to evaluate
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_runs_date ON benchmark_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_runs_model ON benchmark_runs(model_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON benchmark_runs(status);
CREATE INDEX IF NOT EXISTS idx_problem_results_run ON problem_results(run_id);
CREATE INDEX IF NOT EXISTS idx_problem_results_problem ON problem_results(problem_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_run ON workflow_executions(github_run_id);
CREATE INDEX IF NOT EXISTS idx_container_runs_status ON container_runs(status);
CREATE INDEX IF NOT EXISTS idx_container_runs_model ON container_runs(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_schedules_model ON model_schedules(model_id);

-- Seed default models
INSERT OR IGNORE INTO models (id, provider, model_name, display_name, input_price_per_m, output_price_per_m, active)
VALUES
  ('claude-opus-4-5', 'anthropic', 'claude-opus-4-5-20251101', 'Claude Opus 4.5', 15.00, 75.00, 1),
  ('claude-sonnet-4', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 3.00, 15.00, 1),
  ('gpt-4-1', 'openai', 'gpt-4.1', 'GPT-4.1', 2.00, 8.00, 1),
  ('o3', 'openai', 'o3', 'o3', 2.00, 8.00, 1),
  ('gemini-2-5-pro', 'google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 4.00, 20.00, 0);

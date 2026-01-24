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

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_runs_date ON benchmark_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_runs_model ON benchmark_runs(model_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON benchmark_runs(status);
CREATE INDEX IF NOT EXISTS idx_problem_results_run ON problem_results(run_id);
CREATE INDEX IF NOT EXISTS idx_problem_results_problem ON problem_results(problem_id);

-- Seed default models
INSERT OR IGNORE INTO models (id, provider, model_name, display_name, input_price_per_m, output_price_per_m, active)
VALUES
  ('claude-opus-4-5', 'anthropic', 'claude-opus-4-5-20251101', 'Claude Opus 4.5', 5.00, 25.00, 1),
  ('gpt-4-1', 'openai', 'gpt-4.1', 'GPT-4.1', 2.00, 8.00, 0),
  ('o3', 'openai', 'o3', 'o3', 2.00, 8.00, 0),
  ('gemini-2-5-pro', 'google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 4.00, 20.00, 0);

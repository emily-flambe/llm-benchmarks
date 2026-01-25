/**
 * Database helpers for D1 queries
 */

import type { D1Database } from "@cloudflare/workers-types";

// Type definitions for database records
export interface Model {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  active: number;
  created_at: string;
}

export interface BenchmarkRun {
  id: string;
  model_id: string;
  run_date: string;
  sample_size: number | null;
  score: number | null;
  passed_count: number | null;
  total_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  input_cost: number | null;
  output_cost: number | null;
  duration_seconds: number | null;
  github_run_id: string | null;
  status: string;
  created_at: string;
}

export interface ProblemResult {
  id: string;
  run_id: string;
  problem_id: string;
  passed: number;
  error_type: string | null;
  latency_ms: number | null;
  created_at: string;
}

// Extended types for API responses
export interface BenchmarkRunWithModel extends BenchmarkRun {
  model_display_name: string;
  model_provider: string;
}

// Input types for creating records
export interface CreateRunInput {
  model_id: string;
  run_date: string;
  sample_size: number;
  score: number;
  passed_count: number;
  total_count: number;
  input_tokens: number;
  output_tokens: number;
  input_cost: number;
  output_cost: number;
  duration_seconds: number;
  github_run_id?: string;
  status?: string;
}

export interface CreateProblemResultInput {
  run_id: string;
  problem_id: string;
  passed: boolean;
  error_type?: string | null;
  latency_ms?: number | null;
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get all active models
 */
export async function getModels(db: D1Database): Promise<Model[]> {
  const { results } = await db
    .prepare("SELECT * FROM models WHERE active = 1 ORDER BY display_name")
    .all<Model>();
  return results || [];
}

/**
 * Get all models (including inactive)
 */
export async function getAllModels(db: D1Database): Promise<Model[]> {
  const { results } = await db
    .prepare("SELECT * FROM models ORDER BY display_name")
    .all<Model>();
  return results || [];
}

/**
 * Get a model by ID
 */
export async function getModelById(
  db: D1Database,
  id: string
): Promise<Model | null> {
  const result = await db
    .prepare("SELECT * FROM models WHERE id = ?")
    .bind(id)
    .first<Model>();
  return result || null;
}

/**
 * Get recent benchmark runs with model info
 */
export async function getRecentRuns(
  db: D1Database,
  limit: number = 20,
  offset: number = 0,
  modelIds?: string[]
): Promise<BenchmarkRunWithModel[]> {
  let query = `
    SELECT
      r.*,
      m.display_name as model_display_name,
      m.provider as model_provider
    FROM benchmark_runs r
    JOIN models m ON r.model_id = m.id
    WHERE r.status = 'completed'
  `;

  const params: (string | number)[] = [];

  if (modelIds && modelIds.length > 0) {
    const placeholders = modelIds.map(() => "?").join(", ");
    query += ` AND r.model_id IN (${placeholders})`;
    params.push(...modelIds);
  }

  query += " ORDER BY r.run_date DESC, r.created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<BenchmarkRunWithModel>();
  return results || [];
}

/**
 * Get a single run by ID
 */
export async function getRunById(
  db: D1Database,
  id: string
): Promise<BenchmarkRunWithModel | null> {
  const result = await db
    .prepare(
      `SELECT
        r.*,
        m.display_name as model_display_name,
        m.provider as model_provider
      FROM benchmark_runs r
      JOIN models m ON r.model_id = m.id
      WHERE r.id = ?`
    )
    .bind(id)
    .first<BenchmarkRunWithModel>();
  return result || null;
}

/**
 * Get problem results for a run
 */
export async function getProblemResults(
  db: D1Database,
  runId: string
): Promise<ProblemResult[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM problem_results
       WHERE run_id = ?
       ORDER BY problem_id`
    )
    .bind(runId)
    .all<ProblemResult>();
  return results || [];
}

/**
 * Get trend data for the last N days
 */
export async function getTrends(
  db: D1Database,
  days: number = 30,
  modelIds?: string[]
): Promise<
  Array<{
    date: string;  // Aliased from run_date for frontend compatibility
    model_id: string;
    model_display_name: string;
    score: number;
    sample_size: number;
  }>
> {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  const dateStr = dateThreshold.toISOString().split("T")[0];

  // Group by date (YYYY-MM-DD) and model to aggregate multiple runs per day
  // Use weighted average by sample size for accurate aggregation
  let query = `
    SELECT
      DATE(r.run_date) as date,
      r.model_id,
      m.display_name as model_display_name,
      SUM(r.score * r.sample_size) / SUM(r.sample_size) as score,
      SUM(r.sample_size) as sample_size
    FROM benchmark_runs r
    JOIN models m ON r.model_id = m.id
    WHERE r.status = 'completed'
      AND r.run_date >= ?
  `;

  const params: (string | number)[] = [dateStr];

  if (modelIds && modelIds.length > 0) {
    const placeholders = modelIds.map(() => "?").join(", ");
    query += ` AND r.model_id IN (${placeholders})`;
    params.push(...modelIds);
  }

  query += " GROUP BY DATE(r.run_date), r.model_id ORDER BY date ASC";

  const stmt = db.prepare(query);
  const { results } = await stmt.bind(...params).all<{
    date: string;
    model_id: string;
    model_display_name: string;
    score: number;
    sample_size: number;
  }>();

  return results || [];
}

/**
 * Create a new benchmark run
 */
export async function createRun(
  db: D1Database,
  input: CreateRunInput
): Promise<string> {
  const id = generateId();

  await db
    .prepare(
      `INSERT INTO benchmark_runs
       (id, model_id, run_date, sample_size, score, passed_count, total_count,
        input_tokens, output_tokens, input_cost, output_cost, duration_seconds,
        github_run_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.model_id,
      input.run_date,
      input.sample_size,
      input.score,
      input.passed_count,
      input.total_count,
      input.input_tokens,
      input.output_tokens,
      input.input_cost,
      input.output_cost,
      input.duration_seconds,
      input.github_run_id || null,
      input.status || "completed"
    )
    .run();

  return id;
}

/**
 * Create problem results in batch
 */
export async function createProblemResults(
  db: D1Database,
  results: CreateProblemResultInput[]
): Promise<void> {
  if (results.length === 0) return;

  // D1 supports batch operations
  const statements = results.map((result) => {
    const id = generateId();
    return db
      .prepare(
        `INSERT INTO problem_results (id, run_id, problem_id, passed, error_type, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        result.run_id,
        result.problem_id,
        result.passed ? 1 : 0,
        result.error_type || null,
        result.latency_ms || null
      );
  });

  await db.batch(statements);
}

/**
 * Get total count of runs for pagination
 */
export async function getRunCount(
  db: D1Database,
  modelIds?: string[]
): Promise<number> {
  let query = "SELECT COUNT(*) as count FROM benchmark_runs WHERE status = 'completed'";
  const params: string[] = [];

  if (modelIds && modelIds.length > 0) {
    const placeholders = modelIds.map(() => "?").join(", ");
    query += ` AND model_id IN (${placeholders})`;
    params.push(...modelIds);
  }

  const stmt = db.prepare(query);
  const result = params.length > 0
    ? await stmt.bind(...params).first<{ count: number }>()
    : await stmt.first<{ count: number }>();
  return result?.count || 0;
}

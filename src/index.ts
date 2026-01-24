/**
 * LLM Benchmarks Cloudflare Worker API
 *
 * Stores benchmark results and serves the dashboard.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  getModels,
  getRecentRuns,
  getRunById,
  getProblemResults,
  getTrends,
  createRun,
  createProblemResults,
  getRunCount,
  getModelById,
  type CreateRunInput,
  type CreateProblemResultInput,
} from "./db";

// Environment bindings
type Bindings = {
  DB: D1Database;
  ADMIN_API_KEY: string;
  ASSETS: Fetcher;
};

// Rate limiting state (in-memory, resets on worker restart)
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

const app = new Hono<{ Bindings: Bindings }>();

// CORS middleware
app.use("/api/*", cors());

// Rate limiting middleware for admin endpoints
function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const state = rateLimitState.get(key);

  if (!state || now > state.resetAt) {
    rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (state.count >= limit) {
    return false;
  }

  state.count++;
  return true;
}

// Auth middleware for admin endpoints
function verifyAdminAuth(
  authHeader: string | undefined,
  apiKey: string
): boolean {
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  return token === apiKey;
}

// ============================================================================
// Health Check
// ============================================================================

app.get("/api/health", async (c) => {
  try {
    // Quick DB check
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error) {
    return c.json(
      { status: "unhealthy", error: "Database connection failed" },
      503
    );
  }
});

// ============================================================================
// Public Endpoints
// ============================================================================

/**
 * GET /api/models - Get configured models
 */
app.get("/api/models", async (c) => {
  try {
    const models = await getModels(c.env.DB);
    return c.json({ models });
  } catch (error) {
    console.error("Error fetching models:", error);
    return c.json({ error: "Failed to fetch models" }, 500);
  }
});

/**
 * GET /api/runs - Recent runs with scores (paginated)
 */
app.get("/api/runs", async (c) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(c.req.query("limit") || "20") || 20, 100));
    const offset = Math.max(0, parseInt(c.req.query("offset") || "0") || 0);

    const [runs, total] = await Promise.all([
      getRecentRuns(c.env.DB, limit, offset),
      getRunCount(c.env.DB),
    ]);

    return c.json({
      runs,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + runs.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return c.json({ error: "Failed to fetch runs" }, 500);
  }
});

/**
 * GET /api/runs/:id - Single run details
 */
app.get("/api/runs/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const run = await getRunById(c.env.DB, id);

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json({ run });
  } catch (error) {
    console.error("Error fetching run:", error);
    return c.json({ error: "Failed to fetch run" }, 500);
  }
});

/**
 * GET /api/runs/:id/problems - Problem-level results for a run
 */
app.get("/api/runs/:id/problems", async (c) => {
  try {
    const id = c.req.param("id");

    // Verify run exists
    const run = await getRunById(c.env.DB, id);
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    const problems = await getProblemResults(c.env.DB, id);
    return c.json({ run_id: id, problems });
  } catch (error) {
    console.error("Error fetching problem results:", error);
    return c.json({ error: "Failed to fetch problem results" }, 500);
  }
});

/**
 * GET /api/trends - Score over time for charts (last 30 days)
 */
app.get("/api/trends", async (c) => {
  try {
    const parsedDays = parseInt(c.req.query("days") || "30");
    const days = Math.max(1, Math.min(isNaN(parsedDays) ? 30 : parsedDays, 90));
    const modelId = c.req.query("model_id");

    const trends = await getTrends(c.env.DB, days, modelId);
    return c.json({ trends, days });
  } catch (error) {
    console.error("Error fetching trends:", error);
    return c.json({ error: "Failed to fetch trends" }, 500);
  }
});

// ============================================================================
// Admin Endpoints (Protected)
// ============================================================================

/**
 * POST /api/results - Submit run results from GitHub Actions
 *
 * Expected body:
 * {
 *   model_id: string,
 *   run_date: string (ISO date),
 *   sample_size: number,
 *   score: number (0-1),
 *   passed_count: number,
 *   total_count: number,
 *   input_tokens: number,
 *   output_tokens: number,
 *   input_cost: number,
 *   output_cost: number,
 *   duration_seconds: number,
 *   github_run_id?: string,
 *   problems: Array<{
 *     problem_id: string,
 *     passed: boolean,
 *     error_type?: string,
 *     latency_ms?: number
 *   }>
 * }
 */
app.post("/api/results", async (c) => {
  // Auth check
  if (!verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Rate limit check (10 requests per minute per client IP)
  const clientIP = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  if (!checkRateLimit(`admin:${clientIP}`, 10, 60000)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    const body = await c.req.json<{
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
      problems?: Array<{
        problem_id: string;
        passed: boolean;
        error_type?: string;
        latency_ms?: number;
      }>;
    }>();

    // Validate required fields
    const requiredFields = [
      "model_id",
      "run_date",
      "sample_size",
      "score",
      "passed_count",
      "total_count",
      "input_tokens",
      "output_tokens",
      "input_cost",
      "output_cost",
      "duration_seconds",
    ];

    for (const field of requiredFields) {
      if (body[field as keyof typeof body] === undefined) {
        return c.json({ error: `Missing required field: ${field}` }, 400);
      }
    }

    // Validate model exists
    const model = await getModelById(c.env.DB, body.model_id);
    if (!model) {
      return c.json({ error: `Unknown model_id: ${body.model_id}` }, 400);
    }

    // Validate score is between 0 and 1 (and not NaN)
    if (isNaN(body.score) || body.score < 0 || body.score > 1) {
      return c.json({ error: "Score must be between 0 and 1" }, 400);
    }

    // Validate numeric fields are non-negative
    const numericFields = {
      sample_size: body.sample_size,
      passed_count: body.passed_count,
      total_count: body.total_count,
      input_tokens: body.input_tokens,
      output_tokens: body.output_tokens,
      input_cost: body.input_cost,
      output_cost: body.output_cost,
      duration_seconds: body.duration_seconds,
    };

    for (const [field, value] of Object.entries(numericFields)) {
      if (isNaN(value) || value < 0) {
        return c.json({ error: `${field} must be a non-negative number` }, 400);
      }
    }

    // Create the run
    const runInput: CreateRunInput = {
      model_id: body.model_id,
      run_date: body.run_date,
      sample_size: body.sample_size,
      score: body.score,
      passed_count: body.passed_count,
      total_count: body.total_count,
      input_tokens: body.input_tokens,
      output_tokens: body.output_tokens,
      input_cost: body.input_cost,
      output_cost: body.output_cost,
      duration_seconds: body.duration_seconds,
      github_run_id: body.github_run_id,
      status: "completed",
    };

    const runId = await createRun(c.env.DB, runInput);

    // Create problem results if provided
    if (body.problems && body.problems.length > 0) {
      const problemInputs: CreateProblemResultInput[] = body.problems.map(
        (p) => ({
          run_id: runId,
          problem_id: p.problem_id,
          passed: p.passed,
          error_type: p.error_type,
          latency_ms: p.latency_ms,
        })
      );

      await createProblemResults(c.env.DB, problemInputs);
    }

    return c.json(
      {
        success: true,
        run_id: runId,
        message: `Created run with ${body.problems?.length || 0} problem results`,
      },
      201
    );
  } catch (error) {
    console.error("Error creating run:", error);

    if (error instanceof SyntaxError) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    return c.json({ error: "Failed to create run" }, 500);
  }
});

// ============================================================================
// Static Assets (SPA fallback handled by wrangler.toml)
// ============================================================================

// Catch-all for non-API routes - serve to assets
app.all("*", async (c) => {
  // Let the ASSETS binding handle static files
  // This is configured via run_worker_first in wrangler.toml
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;

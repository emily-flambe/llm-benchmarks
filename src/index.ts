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
  GITHUB_TOKEN: string;
  CF_ACCESS_TEAM_DOMAIN: string; // e.g., "emilycogsdill" for emilycogsdill.cloudflareaccess.com
  CF_ACCESS_AUD: string; // Application Audience (AUD) tag from Access
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

// Auth middleware for admin endpoints - supports API key OR Cloudflare Access
function verifyAdminAuth(
  authHeader: string | undefined,
  apiKey: string
): boolean {
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  return token === apiKey;
}

// Verify Cloudflare Access JWT
async function verifyAccessJwt(
  jwt: string | undefined,
  teamDomain: string | undefined,
  aud: string | undefined
): Promise<{ valid: boolean; email?: string }> {
  if (!jwt || !teamDomain || !aud) {
    return { valid: false };
  }

  try {
    // Fetch the public keys from Cloudflare Access
    const certsUrl = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
    const certsResponse = await fetch(certsUrl);
    if (!certsResponse.ok) {
      console.error("Failed to fetch Access certs");
      return { valid: false };
    }

    const certs = await certsResponse.json<{ keys: JsonWebKey[] }>();

    // Decode the JWT header to get the key ID
    const [headerB64] = jwt.split(".");
    const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
    const kid = header.kid;

    // Find the matching key
    const key = certs.keys.find((k: JsonWebKey & { kid?: string }) => k.kid === kid);
    if (!key) {
      console.error("No matching key found for JWT");
      return { valid: false };
    }

    // Import the key
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Verify the signature
    const [, payloadB64, signatureB64] = jwt.split(".");
    const signatureInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      signatureInput
    );

    if (!valid) {
      return { valid: false };
    }

    // Decode and validate the payload
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

    // Check audience
    if (payload.aud && !payload.aud.includes(aud)) {
      console.error("JWT audience mismatch");
      return { valid: false };
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error("JWT expired");
      return { valid: false };
    }

    return { valid: true, email: payload.email };
  } catch (error) {
    console.error("JWT verification error:", error);
    return { valid: false };
  }
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

/**
 * GET /api/auth/status - Check if user is authenticated via Cloudflare Access
 *
 * This endpoint should NOT be protected by Access so it's always reachable.
 * It checks for the CF_Authorization cookie which Access sets after login.
 */
app.get("/api/auth/status", async (c) => {
  // Check for JWT in header (set by Access for protected paths)
  let accessJwt = c.req.header("Cf-Access-Jwt-Assertion");

  // Also check for JWT in cookie (set by Access after login, sent on all requests)
  if (!accessJwt) {
    const cookies = c.req.header("Cookie") || "";
    const match = cookies.match(/CF_Authorization=([^;]+)/);
    if (match) {
      accessJwt = match[1];
    }
  }

  const accessResult = await verifyAccessJwt(
    accessJwt,
    c.env.CF_ACCESS_TEAM_DOMAIN,
    c.env.CF_ACCESS_AUD
  );

  return c.json({
    authenticated: accessResult.valid,
    email: accessResult.email || null,
    method: accessResult.valid ? "cloudflare_access" : null,
  });
});

/**
 * GET /api/auth/logout - Clear Access cookie and redirect to login
 * This clears any stale/expired cookies server-side (HttpOnly cookies can't be
 * cleared by JavaScript), then redirects to the login endpoint for fresh auth.
 */
app.get("/api/auth/logout", async (c) => {
  // Clear the CF_Authorization cookie by setting it to expire in the past
  // Must match the domain/path that Access uses
  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/api/auth/login",
      "Set-Cookie": "CF_Authorization=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; HttpOnly; Secure; SameSite=Lax",
    },
  });
});

/**
 * GET /api/auth/login - Trigger Cloudflare Access login then redirect home
 * This endpoint is protected by Access, so visiting it triggers login.
 * After login, redirect back to the home page.
 */
app.get("/api/auth/login", async (c) => {
  // If we get here, the user is authenticated (Access let them through)
  // Redirect to home page
  return c.redirect("/");
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
 * Query params:
 *   - limit: number (default 20, max 100)
 *   - offset: number (default 0)
 *   - model_ids: comma-separated model IDs to filter by
 */
app.get("/api/runs", async (c) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(c.req.query("limit") || "20") || 20, 100));
    const offset = Math.max(0, parseInt(c.req.query("offset") || "0") || 0);
    const modelIdsParam = c.req.query("model_ids");
    const modelIds = modelIdsParam ? modelIdsParam.split(",").filter(Boolean) : undefined;

    const [runs, total] = await Promise.all([
      getRecentRuns(c.env.DB, limit, offset, modelIds),
      getRunCount(c.env.DB, modelIds),
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
 * GET /api/workflow-runs - Get recent GitHub Actions workflow runs
 * Returns workflow run status for the benchmark workflow
 */
app.get("/api/workflow-runs", async (c) => {
  try {
    const response = await fetch(
      "https://api.github.com/repos/emily-flambe/llm-benchmarks/actions/workflows/benchmark.yml/runs?per_page=20",
      {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "llm-benchmarks-worker",
        },
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", response.status);
      return c.json({ error: "Failed to fetch workflow runs" }, 500);
    }

    const data = await response.json<{
      workflow_runs: Array<{
        id: number;
        name: string;
        display_title: string;
        status: string;
        conclusion: string | null;
        created_at: string;
        updated_at: string;
        html_url: string;
        run_number: number;
        event: string;
        inputs?: {
          model?: string;
          sample_size?: string;
        };
      }>;
    }>();

    // Extract relevant fields including model/sample_size from inputs
    const runs = data.workflow_runs.map((run) => ({
      id: run.id,
      run_number: run.run_number,
      status: run.status,
      conclusion: run.conclusion,
      created_at: run.created_at,
      updated_at: run.updated_at,
      html_url: run.html_url,
      event: run.event,
      model: run.inputs?.model || 'claude-opus-4-5-20251101',
      sample_size: run.inputs?.sample_size || '100',
    }));

    return c.json({ runs });
  } catch (error) {
    console.error("Error fetching workflow runs:", error);
    return c.json({ error: "Failed to fetch workflow runs" }, 500);
  }
});

/**
 * GET /api/trends - Score over time for charts (last 30 days)
 * Query params:
 *   - days: number (default 30, max 90)
 *   - model_ids: comma-separated model IDs to filter by
 */
app.get("/api/trends", async (c) => {
  try {
    const parsedDays = parseInt(c.req.query("days") || "30");
    const days = Math.max(1, Math.min(isNaN(parsedDays) ? 30 : parsedDays, 90));
    const modelIdsParam = c.req.query("model_ids");
    const modelIds = modelIdsParam ? modelIdsParam.split(",").filter(Boolean) : undefined;

    const trends = await getTrends(c.env.DB, days, modelIds);
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
  // Auth check - accept API key OR Cloudflare Access JWT
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = c.req.header("Cf-Access-Jwt-Assertion");
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
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

/**
 * POST /api/admin/trigger-benchmark - Trigger a benchmark run via GitHub Actions
 *
 * Expected body:
 * {
 *   model?: string,       // Model to benchmark (default: claude-opus-4-5-20251101)
 *   sample_size?: string  // Number of problems (default: 100)
 * }
 */
app.post("/api/admin/trigger-benchmark", async (c) => {
  // Auth check - accept API key OR Cloudflare Access JWT
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = c.req.header("Cf-Access-Jwt-Assertion");
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Rate limit check (5 triggers per hour per client IP)
  const clientIP = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  if (!checkRateLimit(`trigger:${clientIP}`, 5, 3600000)) {
    return c.json({ error: "Rate limit exceeded. Max 5 triggers per hour." }, 429);
  }

  try {
    const body = await c.req.json<{
      model?: string;
      sample_size?: string;
    }>().catch(() => ({}));

    const model = body.model || "claude-opus-4-5-20251101";
    const sampleSize = body.sample_size || "100";

    // Trigger GitHub Actions workflow via API
    const response = await fetch(
      "https://api.github.com/repos/emily-flambe/llm-benchmarks/actions/workflows/benchmark.yml/dispatches",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${c.env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "llm-benchmarks-worker",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            model,
            sample_size: sampleSize,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GitHub API error:", response.status, errorText);
      return c.json(
        { error: `Failed to trigger workflow: ${response.status}` },
        500
      );
    }

    return c.json({
      success: true,
      message: `Benchmark triggered for ${model} with sample size ${sampleSize}`,
      model,
      sample_size: sampleSize,
    });
  } catch (error) {
    console.error("Error triggering benchmark:", error);
    return c.json({ error: "Failed to trigger benchmark" }, 500);
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

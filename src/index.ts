/**
 * LLM Benchmarks Cloudflare Worker API
 *
 * Stores benchmark results and serves the dashboard.
 * Triggers GitHub Actions for benchmark execution.
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
import { BenchmarkSchedulerDO, getSchedulerDO, truncateToMinute } from "./services/scheduler-do";
import { cronMatchesNow, describeSchedule, getNextRunTime } from "./services/cron";

// Re-export Durable Object for wrangler
export { BenchmarkSchedulerDO } from "./services/scheduler-do";

// Model ID to GitHub Actions workflow mapping
const MODEL_WORKFLOWS: Record<string, string> = {
  'claude-opus-4-5': 'benchmark-opus.yml',
  'claude-sonnet-4': 'benchmark-sonnet.yml',
  'gpt-4-1': 'benchmark-gpt.yml',
  'gpt-5-1': 'benchmark-gpt51.yml',
  'gpt-5-2': 'benchmark-gpt52.yml',
  'o3': 'benchmark-o3.yml',
};

// Environment bindings
type Bindings = {
  DB: D1Database;
  ADMIN_API_KEY: string;
  GITHUB_TOKEN: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  ASSETS: Fetcher;
  BENCHMARK_SCHEDULER: DurableObjectNamespace<BenchmarkSchedulerDO>;
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

// Extract Access JWT from header or cookie
function getAccessJwt(req: { header: (name: string) => string | undefined }): string | undefined {
  let jwt = req.header("Cf-Access-Jwt-Assertion");
  if (!jwt) {
    const cookies = req.header("Cookie") || "";
    const match = cookies.match(/CF_Authorization=([^;]+)/);
    if (match) {
      jwt = match[1];
    }
  }
  return jwt;
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
    const certsUrl = `${teamDomain}/cdn-cgi/access/certs`;
    const certsResponse = await fetch(certsUrl);
    if (!certsResponse.ok) {
      console.error("Failed to fetch Access certs");
      return { valid: false };
    }

    const certs = await certsResponse.json<{ keys: JsonWebKey[] }>();
    const [headerB64] = jwt.split(".");
    const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
    const kid = header.kid;

    const key = certs.keys.find((k: JsonWebKey & { kid?: string }) => k.kid === kid);
    if (!key) {
      console.error("No matching key found for JWT");
      return { valid: false };
    }

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

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

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

    if (payload.aud && !payload.aud.includes(aud)) {
      console.error("JWT audience mismatch");
      return { valid: false };
    }

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

// Helper to trigger GitHub Actions workflow
async function triggerGitHubWorkflow(
  githubToken: string,
  modelId: string,
  sampleSize: number,
  triggerSource: 'manual' | 'scheduled' = 'manual'
): Promise<{ success: boolean; error?: string; runId?: string }> {
  const workflowFile = MODEL_WORKFLOWS[modelId];
  if (!workflowFile) {
    return { success: false, error: `No workflow configured for model: ${modelId}` };
  }

  // Get the latest run ID before triggering (to find the new one after)
  const beforeResponse = await fetch(
    `https://api.github.com/repos/emily-flambe/llm-benchmarks/actions/workflows/${workflowFile}/runs?per_page=1`,
    {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "llm-benchmarks-worker",
      },
    }
  );
  const beforeData = await beforeResponse.json<{ workflow_runs: Array<{ id: number }> }>();
  const latestRunIdBefore = beforeData.workflow_runs?.[0]?.id;

  // Trigger the workflow
  const response = await fetch(
    `https://api.github.com/repos/emily-flambe/llm-benchmarks/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "llm-benchmarks-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          sample_size: String(sampleSize),
          trigger_source: triggerSource,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`GitHub API error for ${workflowFile}:`, response.status, errorText);
    return { success: false, error: `GitHub API returned ${response.status}` };
  }

  // Poll briefly to find the new run ID
  let runId: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

    const afterResponse = await fetch(
      `https://api.github.com/repos/emily-flambe/llm-benchmarks/actions/workflows/${workflowFile}/runs?per_page=1`,
      {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "llm-benchmarks-worker",
        },
      }
    );
    const afterData = await afterResponse.json<{ workflow_runs: Array<{ id: number }> }>();
    const latestRunIdAfter = afterData.workflow_runs?.[0]?.id;

    if (latestRunIdAfter && latestRunIdAfter !== latestRunIdBefore) {
      runId = String(latestRunIdAfter);
      break;
    }
  }

  return { success: true, runId };
}

// ============================================================================
// Health Check
// ============================================================================

app.get("/api/health", async (c) => {
  try {
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
// Auth Endpoints
// ============================================================================

app.get("/api/auth/status", async (c) => {
  const accessJwt = getAccessJwt(c.req);
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

app.get("/api/auth/logout", async (c) => {
  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/api/auth/login",
      "Set-Cookie": "CF_Authorization=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; HttpOnly; Secure; SameSite=Lax",
    },
  });
});

app.get("/api/auth/login", async (c) => {
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = c.env.CF_ACCESS_AUD;

  if (!teamDomain || !aud) {
    return c.json({ error: "Access not configured" }, 500);
  }

  const url = new URL(c.req.url);
  const redirectUrl = `${url.protocol}//${url.host}/`;
  const accessLoginUrl = `${teamDomain}/cdn-cgi/access/login?kid=${aud}&redirect_url=${encodeURIComponent(redirectUrl)}`;

  return c.redirect(accessLoginUrl);
});

// ============================================================================
// Public Endpoints
// ============================================================================

app.get("/api/models", async (c) => {
  try {
    const models = await getModels(c.env.DB);
    return c.json({ models });
  } catch (error) {
    console.error("Error fetching models:", error);
    return c.json({ error: "Failed to fetch models" }, 500);
  }
});

app.get("/api/runs", async (c) => {
  try {
    const modelIdsParam = c.req.query("model_ids");
    const hoursParam = c.req.query("hours");
    const modelIds = modelIdsParam ? modelIdsParam.split(",").filter(Boolean) : undefined;
    const sinceHours = hoursParam ? parseInt(hoursParam, 10) : undefined;
    const runs = await getRecentRuns(c.env.DB, { modelIds, sinceHours });
    return c.json({ runs });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return c.json({ error: "Failed to fetch runs" }, 500);
  }
});

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

app.get("/api/runs/:id/problems", async (c) => {
  try {
    const id = c.req.param("id");
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

// Cost/stats endpoint - returns aggregated data without limits
app.get("/api/stats", async (c) => {
  try {
    // Get aggregated stats for different time periods
    const now = new Date();
    const periods = {
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      'mtd': new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      'ytd': new Date(now.getFullYear(), 0, 1).toISOString(),
    };

    const stats: Record<string, { totalCost: number; runCount: number; totalProblems: number }> = {};

    // Query for each period
    for (const [period, since] of Object.entries(periods)) {
      const result = await c.env.DB.prepare(`
        SELECT
          COUNT(*) as run_count,
          COALESCE(SUM(input_cost), 0) + COALESCE(SUM(output_cost), 0) as total_cost,
          COALESCE(SUM(total_count), 0) as total_problems
        FROM benchmark_runs
        WHERE status = 'completed' AND run_date >= ?
      `).bind(since).first<{ run_count: number; total_cost: number; total_problems: number }>();

      stats[period] = {
        totalCost: result?.total_cost ?? 0,
        runCount: result?.run_count ?? 0,
        totalProblems: result?.total_problems ?? 0,
      };
    }

    // Also get all-time stats
    const allTime = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as run_count,
        COALESCE(SUM(input_cost), 0) + COALESCE(SUM(output_cost), 0) as total_cost,
        COALESCE(SUM(total_count), 0) as total_problems
      FROM benchmark_runs
      WHERE status = 'completed'
    `).first<{ run_count: number; total_cost: number; total_problems: number }>();

    stats['all'] = {
      totalCost: allTime?.total_cost ?? 0,
      runCount: allTime?.run_count ?? 0,
      totalProblems: allTime?.total_problems ?? 0,
    };

    return c.json({ stats });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

app.get("/api/workflow-runs", async (c) => {
  try {
    const response = await fetch(
      "https://api.github.com/repos/emily-flambe/llm-benchmarks/actions/runs?per_page=30",
      {
        headers: {
          "Authorization": `Bearer ${c.env.GITHUB_TOKEN}`,
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
        status: string;
        conclusion: string | null;
        created_at: string;
        updated_at: string;
        html_url: string;
        run_number: number;
        event: string;
      }>;
    }>();

    const workflowToModel: Record<string, string> = {
      "Benchmark - Claude Opus 4.5": "claude-opus-4-5",
      "Benchmark - Claude Sonnet 4": "claude-sonnet-4",
      "Benchmark - GPT-4.1": "gpt-4-1",
      "Benchmark - o3": "o3",
    };

    const { results: executions } = await c.env.DB.prepare(`
      SELECT github_run_id, model_id, sample_size, trigger_source FROM workflow_executions
    `).all<{ github_run_id: string; model_id: string; sample_size: number; trigger_source: string | null }>();

    const metadataMap = new Map<string, { model_id: string; sample_size: number; trigger_source: string }>();
    executions?.forEach((r) => metadataMap.set(r.github_run_id, { ...r, trigger_source: r.trigger_source || 'manual' }));

    const runs = data.workflow_runs
      .filter((run) => run.name.startsWith("Benchmark"))
      .map((run) => {
        const metadata = metadataMap.get(String(run.id));
        return {
          id: run.id,
          run_number: run.run_number,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          created_at: run.created_at,
          updated_at: run.updated_at,
          html_url: run.html_url,
          event: run.event,
          model: metadata?.model_id || workflowToModel[run.name] || 'unknown',
          sample_size: metadata?.sample_size?.toString() || '—',
          trigger_source: metadata?.trigger_source || '—',
        };
      })
      .filter((run) => run.model !== 'unknown');

    return c.json({ runs });
  } catch (error) {
    console.error("Error fetching workflow runs:", error);
    return c.json({ error: "Failed to fetch workflow runs" }, 500);
  }
});

app.post("/api/workflow-executions", async (c) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader?.replace("Bearer ", "");

  if (apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json<{
      github_run_id: string;
      model_id: string;
      sample_size: number;
      trigger_source?: string;
    }>();

    if (!body.github_run_id || !body.model_id || body.sample_size === undefined) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const triggerSource = body.trigger_source || 'manual';

    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO workflow_executions (github_run_id, model_id, sample_size, trigger_source)
      VALUES (?, ?, ?, ?)
    `).bind(body.github_run_id, body.model_id, body.sample_size, triggerSource).run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Error registering workflow execution:", error);
    return c.json({ error: "Failed to register workflow execution" }, 500);
  }
});

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
// Schedule Management Endpoints
// ============================================================================

app.get("/api/schedules", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        s.id,
        s.model_id,
        s.cron_expression,
        s.sample_size,
        s.is_paused,
        s.created_at,
        s.updated_at,
        m.display_name as model_name,
        (
          SELECT MAX(run_date)
          FROM benchmark_runs r
          WHERE r.model_id = s.model_id
        ) as last_run
      FROM model_schedules s
      JOIN models m ON s.model_id = m.id
      ORDER BY m.display_name
    `).all<{
      id: string;
      model_id: string;
      cron_expression: string;
      sample_size: number;
      is_paused: number;
      created_at: string;
      updated_at: string;
      model_name: string;
      last_run: string | null;
    }>();

    const now = new Date();
    const schedules = (results || []).map((s) => ({
      ...s,
      is_paused: s.is_paused === 1,
      description: describeSchedule(s.cron_expression),
      next_run: s.is_paused ? null : getNextRunTime(s.cron_expression, now),
    }));

    return c.json({ schedules });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return c.json({ error: "Failed to fetch schedules" }, 500);
  }
});

app.post("/api/schedules", async (c) => {
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = getAccessJwt(c.req);
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json<{
      model_id: string;
      cron_expression: string;
      sample_size?: number;
    }>();

    if (!body.model_id || !body.cron_expression) {
      return c.json({ error: "Missing required fields (model_id, cron_expression)" }, 400);
    }

    const model = await getModelById(c.env.DB, body.model_id);
    if (!model) {
      return c.json({ error: `Unknown model_id: ${body.model_id}` }, 400);
    }

    const cronParts = body.cron_expression.trim().split(/\s+/);
    if (cronParts.length !== 5) {
      return c.json({ error: "Invalid cron expression (must be 5 fields)" }, 400);
    }

    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO model_schedules (id, model_id, cron_expression, sample_size, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, body.model_id, body.cron_expression, body.sample_size ?? null).run();

    return c.json({ success: true, model_id: body.model_id });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return c.json({ error: "Failed to create schedule" }, 500);
  }
});

app.delete("/api/schedules/:id", async (c) => {
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = getAccessJwt(c.req);
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const scheduleId = c.req.param("id");
    await c.env.DB.prepare(`DELETE FROM model_schedules WHERE id = ?`).bind(scheduleId).run();
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    return c.json({ error: "Failed to delete schedule" }, 500);
  }
});

app.patch("/api/schedules/:id/pause", async (c) => {
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = getAccessJwt(c.req);
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const scheduleId = c.req.param("id");
    const body = await c.req.json<{ is_paused: boolean }>();

    await c.env.DB.prepare(`
      UPDATE model_schedules
      SET is_paused = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(body.is_paused ? 1 : 0, scheduleId).run();

    return c.json({ success: true, is_paused: body.is_paused });
  } catch (error) {
    console.error("Error updating schedule:", error);
    return c.json({ error: "Failed to update schedule" }, 500);
  }
});

app.patch("/api/schedules/:id", async (c) => {
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = getAccessJwt(c.req);
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const scheduleId = c.req.param("id");
    const body = await c.req.json<{ cron_expression?: string; sample_size?: number }>();

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.cron_expression !== undefined) {
      updates.push("cron_expression = ?");
      values.push(body.cron_expression);
    }
    if (body.sample_size !== undefined) {
      updates.push("sample_size = ?");
      values.push(body.sample_size);
    }

    if (updates.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    updates.push("updated_at = datetime('now')");
    values.push(scheduleId);

    await c.env.DB.prepare(`
      UPDATE model_schedules
      SET ${updates.join(", ")}
      WHERE id = ?
    `).bind(...values).run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating schedule:", error);
    return c.json({ error: "Failed to update schedule" }, 500);
  }
});

// ============================================================================
// Manual Trigger Endpoint
// ============================================================================

/**
 * POST /api/trigger-run - Trigger a benchmark run via GitHub Actions
 * Body: { model_id: string, sample_size?: number }
 */
app.post("/api/trigger-run", async (c) => {
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = getAccessJwt(c.req);
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Rate limit: 5 triggers per hour
  const clientIP = c.req.header("CF-Connecting-IP") || "unknown";
  if (!checkRateLimit(`trigger:${clientIP}`, 5, 3600000)) {
    return c.json({ error: "Rate limit exceeded. Max 5 triggers per hour." }, 429);
  }

  try {
    const body = await c.req.json<{
      model_id: string;
      sample_size?: number;
    }>();

    if (!body.model_id) {
      return c.json({ error: "Missing required field: model_id" }, 400);
    }

    const model = await getModelById(c.env.DB, body.model_id);
    if (!model) {
      return c.json({ error: `Unknown model_id: ${body.model_id}` }, 400);
    }

    const sampleSize = body.sample_size || 100;

    const result = await triggerGitHubWorkflow(
      c.env.GITHUB_TOKEN,
      body.model_id,
      sampleSize,
      'manual'
    );

    if (!result.success) {
      return c.json({ error: result.error }, 500);
    }

    // Write metadata to D1 immediately if we got the run ID
    if (result.runId) {
      await c.env.DB.prepare(`
        INSERT OR REPLACE INTO workflow_executions (github_run_id, model_id, sample_size, trigger_source)
        VALUES (?, ?, ?, ?)
      `).bind(result.runId, body.model_id, sampleSize, 'manual').run();
    }

    return c.json({
      success: true,
      message: `Benchmark triggered for ${body.model_id} with sample size ${sampleSize}`,
      model_id: body.model_id,
      sample_size: sampleSize,
    });
  } catch (error) {
    console.error("Error triggering benchmark:", error);
    return c.json({ error: "Failed to trigger benchmark" }, 500);
  }
});

// ============================================================================
// Admin Endpoints (Protected)
// ============================================================================

/**
 * POST /api/results - Submit run results from GitHub Actions
 */
app.post("/api/results", async (c) => {
  const apiKeyValid = verifyAdminAuth(c.req.header("Authorization"), c.env.ADMIN_API_KEY);
  const accessJwt = getAccessJwt(c.req);
  const accessResult = await verifyAccessJwt(accessJwt, c.env.CF_ACCESS_TEAM_DOMAIN, c.env.CF_ACCESS_AUD);

  if (!apiKeyValid && !accessResult.valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const clientIP = c.req.header("CF-Connecting-IP") || "unknown";
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

    const requiredFields = [
      "model_id", "run_date", "sample_size", "score", "passed_count",
      "total_count", "input_tokens", "output_tokens", "input_cost",
      "output_cost", "duration_seconds",
    ];

    for (const field of requiredFields) {
      if (body[field as keyof typeof body] === undefined) {
        return c.json({ error: `Missing required field: ${field}` }, 400);
      }
    }

    const model = await getModelById(c.env.DB, body.model_id);
    if (!model) {
      return c.json({ error: `Unknown model_id: ${body.model_id}` }, 400);
    }

    if (isNaN(body.score) || body.score < 0 || body.score > 1) {
      return c.json({ error: "Score must be between 0 and 1" }, 400);
    }

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

    if (body.problems && body.problems.length > 0) {
      const problemInputs: CreateProblemResultInput[] = body.problems.map((p) => ({
        run_id: runId,
        problem_id: p.problem_id,
        passed: p.passed,
        error_type: p.error_type,
        latency_ms: p.latency_ms,
      }));
      await createProblemResults(c.env.DB, problemInputs);
    }

    return c.json({
      success: true,
      run_id: runId,
      message: `Created run with ${body.problems?.length || 0} problem results`,
    }, 201);
  } catch (error) {
    console.error("Error creating run:", error);
    if (error instanceof SyntaxError) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    return c.json({ error: "Failed to create run" }, 500);
  }
});

// ============================================================================
// Static Assets
// ============================================================================

app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// ============================================================================
// Cron Handler for Scheduled Benchmarks
// ============================================================================

async function runScheduledBenchmarks(env: Bindings, scheduledTime: Date): Promise<void> {
  console.log(`Checking schedules at ${scheduledTime.toISOString()}`);

  // Get all active schedules
  const { results: schedules } = await env.DB.prepare(`
    SELECT
      s.model_id,
      s.cron_expression,
      s.sample_size
    FROM model_schedules s
    WHERE s.is_paused = 0
  `).all<{
    model_id: string;
    cron_expression: string;
    sample_size: number;
  }>();

  if (!schedules || schedules.length === 0) {
    console.log('No active schedules found');
    return;
  }

  // Get scheduler DO for deduplication
  const schedulerDO = getSchedulerDO(env.BENCHMARK_SCHEDULER);
  const scheduledMinute = truncateToMinute(scheduledTime);

  for (const schedule of schedules) {
    // Check if cron matches
    if (!cronMatchesNow(schedule.cron_expression, scheduledTime)) {
      continue;
    }

    // Try to claim this execution (prevents duplicates)
    const claimResponse = await schedulerDO.fetch('http://do/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: schedule.model_id,
        scheduledMinute,
      }),
    });
    const { claimed } = await claimResponse.json<{ claimed: boolean }>();

    if (!claimed) {
      console.log(`Skipping ${schedule.model_id} - already claimed for ${scheduledMinute}`);
      continue;
    }

    console.log(`Triggering scheduled benchmark for ${schedule.model_id}`);

    const sampleSize = schedule.sample_size || 100;

    // Trigger GitHub Actions workflow
    const result = await triggerGitHubWorkflow(
      env.GITHUB_TOKEN,
      schedule.model_id,
      sampleSize,
      'scheduled'
    );

    if (result.success) {
      console.log(`Successfully triggered workflow for ${schedule.model_id}`);

      // Write metadata to D1 immediately if we got the run ID
      if (result.runId) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO workflow_executions (github_run_id, model_id, sample_size, trigger_source)
          VALUES (?, ?, ?, ?)
        `).bind(result.runId, schedule.model_id, sampleSize, 'scheduled').run();
      }
    } else {
      console.error(`Failed to trigger workflow for ${schedule.model_id}: ${result.error}`);
    }
  }

  // Cleanup old claims
  const oneHourAgo = new Date(scheduledTime.getTime() - 60 * 60 * 1000);
  await schedulerDO.fetch('http://do/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ olderThanMinute: truncateToMinute(oneHourAgo) }),
  });
}

// Export the worker
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledBenchmarks(env, new Date(event.scheduledTime)));
  },
};

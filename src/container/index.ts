/**
 * Benchmark Runner - Container entry point
 *
 * Runs as an HTTP server inside the Cloudflare Container.
 * Receives benchmark requests and reports progress/results back to the Worker.
 */

import { createServer } from 'http';
import { createLLMProvider, type ApiKeys } from './llm/index.js';
import { loadProblems, formatPrompt, type Problem } from './problems.js';
import { extractCodeFromResponse, runTestCases, type ErrorType } from './executor.js';

interface BenchmarkConfig {
  runId: string;
  modelId: string;
  modelName: string;
  provider: string;
  sampleSize: number;
  callbackUrl: string;
}

interface ProblemResult {
  problemId: string;
  passed: boolean;
  errorType: ErrorType;
  latencyMs: number;
}

interface BenchmarkResult {
  runId: string;
  modelId: string;
  score: number;
  passedCount: number;
  totalCount: number;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  durationSeconds: number;
  problems: ProblemResult[];
}

// Pricing per million tokens
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5-20251101': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'o3': { input: 2.0, output: 8.0 },
};

function calculateCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number } {
  const pricing = MODEL_PRICING[modelName] || { input: 5.0, output: 25.0 };
  return {
    inputCost: (inputTokens / 1_000_000) * pricing.input,
    outputCost: (outputTokens / 1_000_000) * pricing.output,
  };
}

async function reportProgress(
  callbackUrl: string,
  runId: string,
  current: number,
  total: number,
  latestResult?: ProblemResult
): Promise<void> {
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'progress',
        runId,
        current,
        total,
        latestResult,
      }),
    });
  } catch (err) {
    console.error('Failed to report progress:', err);
  }
}

async function reportCompletion(
  callbackUrl: string,
  result: BenchmarkResult
): Promise<void> {
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'complete',
        ...result,
      }),
    });
  } catch (err) {
    console.error('Failed to report completion:', err);
  }
}

async function reportError(
  callbackUrl: string,
  runId: string,
  error: string
): Promise<void> {
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'error',
        runId,
        error,
      }),
    });
  } catch (err) {
    console.error('Failed to report error:', err);
  }
}

async function runBenchmark(config: BenchmarkConfig, apiKeys: ApiKeys): Promise<void> {
  const startTime = Date.now();
  const results: ProblemResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    // Create LLM provider
    const llmProvider = createLLMProvider(
      {
        id: config.modelId,
        provider: config.provider,
        modelName: config.modelName,
      },
      apiKeys
    );

    // Load problems
    const problems = await loadProblems(config.sampleSize);
    console.log(`Running benchmark: ${config.modelId}, ${problems.length} problems`);

    // Report initial progress
    await reportProgress(config.callbackUrl, config.runId, 0, problems.length);

    // Evaluate each problem
    for (let i = 0; i < problems.length; i++) {
      const problem = problems[i];
      const problemStartTime = Date.now();

      let result: ProblemResult;

      try {
        // Generate code
        const prompt = formatPrompt(problem);
        const response = await llmProvider.complete({ prompt });

        totalInputTokens += response.inputTokens;
        totalOutputTokens += response.outputTokens;

        // Extract code from response
        const code = extractCodeFromResponse(response.content);

        // Combine test cases
        const testCases = [
          ...problem.public_test_cases,
          ...problem.private_test_cases,
        ];

        if (testCases.length === 0) {
          // No test cases - pass if code was generated
          result = {
            problemId: problem.question_id,
            passed: true,
            errorType: null,
            latencyMs: Date.now() - problemStartTime,
          };
        } else {
          // Run test cases
          const testResult = await runTestCases(code, testCases);
          result = {
            problemId: problem.question_id,
            passed: testResult.passed,
            errorType: testResult.errorType,
            latencyMs: Date.now() - problemStartTime,
          };
        }
      } catch (err) {
        result = {
          problemId: problem.question_id,
          passed: false,
          errorType: 'api_error',
          latencyMs: Date.now() - problemStartTime,
        };
        console.error(`Error evaluating ${problem.question_id}:`, err);
      }

      results.push(result);

      // Log progress
      const status = result.passed ? 'PASS' : `FAIL (${result.errorType})`;
      console.log(`[${i + 1}/${problems.length}] ${problem.question_id}: ${status} (${result.latencyMs}ms)`);

      // Report progress
      await reportProgress(config.callbackUrl, config.runId, i + 1, problems.length, result);
    }

    // Calculate final stats
    const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
    const passedCount = results.filter((r) => r.passed).length;
    const score = passedCount / results.length;
    const costs = calculateCost(config.modelName, totalInputTokens, totalOutputTokens);

    const benchmarkResult: BenchmarkResult = {
      runId: config.runId,
      modelId: config.modelId,
      score,
      passedCount,
      totalCount: results.length,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      inputCost: Math.round(costs.inputCost * 10000) / 10000,
      outputCost: Math.round(costs.outputCost * 10000) / 10000,
      durationSeconds,
      problems: results,
    };

    console.log(`\nBenchmark complete: ${(score * 100).toFixed(1)}% (${passedCount}/${results.length})`);

    // Report completion
    await reportCompletion(config.callbackUrl, benchmarkResult);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Benchmark failed:', errorMessage);
    await reportError(config.callbackUrl, config.runId, errorMessage);
  }
}

// HTTP Server
const PORT = parseInt(process.env.PORT || '8080', 10);

const server = createServer(async (req, res) => {
  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Start benchmark
  if (req.url === '/run' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body) as BenchmarkConfig & { apiKeys?: ApiKeys };

        // API keys come from the request (passed by Worker)
        // Fall back to environment variables if not provided
        const apiKeys: ApiKeys = payload.apiKeys || {
          anthropic: process.env.ANTHROPIC_API_KEY,
          openai: process.env.OPENAI_API_KEY,
          google: process.env.GOOGLE_API_KEY,
        };

        // Extract config without apiKeys
        const config: BenchmarkConfig = {
          runId: payload.runId,
          modelId: payload.modelId,
          modelName: payload.modelName,
          provider: payload.provider,
          sampleSize: payload.sampleSize,
          callbackUrl: payload.callbackUrl,
        };

        // Respond immediately, run benchmark async
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', runId: config.runId }));

        // Run benchmark in background
        runBenchmark(config, apiKeys).catch((err) => {
          console.error('Benchmark error:', err);
        });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Benchmark runner v2 listening on port ${PORT}`);
});

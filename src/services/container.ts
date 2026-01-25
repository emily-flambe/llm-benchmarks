/**
 * Container orchestration for benchmark runs
 */

import { Container } from '@cloudflare/containers';

export class BenchmarkContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '30m'; // Sleep after 30 minutes of inactivity
  envVars = {
    NODE_ENV: 'production',
  };

  onStart() {
    console.log('Benchmark container started');
  }

  onStop() {
    console.log('Benchmark container stopped');
  }
}

export interface StartBenchmarkParams {
  runId: string;
  modelId: string;
  modelName: string;
  provider: string;
  sampleSize: number;
  callbackUrl: string;
}

/**
 * Start a benchmark run in a container
 */
// Use a single shared container for all benchmarks
// This ensures warmup keeps the same container hot that runs benchmarks
const SHARED_CONTAINER_ID = 'benchmark-runner';

/**
 * Warm up the shared container by calling its health endpoint
 * This keeps the container running and prevents cold start timeouts
 */
export async function warmupContainer(
  containerNamespace: DurableObjectNamespace<BenchmarkContainer>,
  _modelId: string // Unused, kept for API compatibility
): Promise<{ success: boolean; error?: string }> {
  try {
    const container = containerNamespace.get(
      containerNamespace.idFromName(SHARED_CONTAINER_ID)
    );

    const response = await container.fetch('http://container/health', {
      method: 'GET',
    });

    if (!response.ok) {
      return { success: false, error: `Health check failed: ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

export async function startBenchmarkInContainer(
  containerNamespace: DurableObjectNamespace<BenchmarkContainer>,
  params: StartBenchmarkParams,
  apiKeys: { anthropic?: string; openai?: string; google?: string }
): Promise<{ containerId: string }> {
  // Use shared container - same one that warmup keeps hot
  const container = containerNamespace.get(
    containerNamespace.idFromName(SHARED_CONTAINER_ID)
  );

  // Set environment variables for the container
  // Note: In production, these would be set via the Container class configuration
  // For now, we pass them in the request body

  // Send run request to container
  const response = await container.fetch('http://container/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      apiKeys, // Container will use these for LLM calls
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start benchmark: ${error}`);
  }

  return { containerId: SHARED_CONTAINER_ID };
}

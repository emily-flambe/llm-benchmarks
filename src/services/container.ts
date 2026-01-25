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
export async function startBenchmarkInContainer(
  containerNamespace: DurableObjectNamespace<BenchmarkContainer>,
  params: StartBenchmarkParams,
  apiKeys: { anthropic?: string; openai?: string; google?: string }
): Promise<{ containerId: string }> {
  // Use model ID as container name for easy identification
  const containerId = `benchmark-${params.modelId}-${params.runId}`;
  const container = containerNamespace.get(
    containerNamespace.idFromName(containerId)
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

  return { containerId };
}

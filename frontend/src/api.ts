import type {
  RunsResponse,
  RunDetailResponse,
  ProblemsResponse,
  TrendsResponse,
  ModelsResponse,
  WorkflowRunsResponse,
} from './types';

const API_BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    credentials: 'include', // Include cookies for Cloudflare Access auth
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function getRuns(modelIds?: string[]): Promise<RunsResponse> {
  const params = modelIds?.length ? `?model_ids=${modelIds.join(',')}` : '';
  return fetchJson<RunsResponse>(`/runs${params}`);
}

export async function getRun(id: string): Promise<RunDetailResponse> {
  return fetchJson<RunDetailResponse>(`/runs/${id}`);
}

export async function getRunProblems(runId: string): Promise<ProblemsResponse> {
  return fetchJson<ProblemsResponse>(`/runs/${runId}/problems`);
}

export async function getTrends(modelIds?: string[]): Promise<TrendsResponse> {
  const params = modelIds?.length ? `?model_ids=${modelIds.join(',')}` : '';
  return fetchJson<TrendsResponse>(`/trends${params}`);
}

export async function getModels(): Promise<ModelsResponse> {
  return fetchJson<ModelsResponse>('/models');
}

export async function getWorkflowRuns(): Promise<WorkflowRunsResponse> {
  return fetchJson<WorkflowRunsResponse>('/workflow-runs');
}

export interface AuthStatus {
  authenticated: boolean;
  email: string | null;
  method: 'cloudflare_access' | null;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return fetchJson<AuthStatus>('/auth/status');
}

export interface TriggerBenchmarkParams {
  model?: string;
  sample_size?: string;
}

export interface TriggerBenchmarkResponse {
  success: boolean;
  message: string;
  model: string;
  sample_size: string;
}

export async function triggerBenchmark(
  apiKey: string | null,
  params: TriggerBenchmarkParams = {}
): Promise<TriggerBenchmarkResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add Authorization header if API key is provided
  // (Cloudflare Access JWT is automatically included by the browser)
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${API_BASE}/admin/trigger-benchmark`, {
    method: 'POST',
    headers,
    credentials: 'include', // Include cookies for Cloudflare Access auth
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

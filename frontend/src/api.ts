import type {
  RunsResponse,
  TrendsResponse,
  ModelsResponse,
  SchedulesResponse,
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

export async function getTrends(modelIds?: string[]): Promise<TrendsResponse> {
  const params = modelIds?.length ? `?model_ids=${modelIds.join(',')}` : '';
  return fetchJson<TrendsResponse>(`/trends${params}`);
}

export async function getModels(): Promise<ModelsResponse> {
  return fetchJson<ModelsResponse>('/models');
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

// Schedule management
export async function getSchedules(): Promise<SchedulesResponse> {
  return fetchJson<SchedulesResponse>('/schedules');
}

export interface CreateScheduleParams {
  model_id: string;
  cron_expression: string;
  sample_size: number;
}

export async function createSchedule(params: CreateScheduleParams): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export async function deleteSchedule(modelId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/schedules/${modelId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export async function toggleSchedulePause(modelId: string, isPaused: boolean): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/schedules/${modelId}/pause`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ is_paused: isPaused }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

// Container runs
export interface StartContainerRunParams {
  model_id: string;
  sample_size: number;
}

export async function startContainerRun(params: StartContainerRunParams): Promise<{ success: boolean; run_id: string }> {
  const response = await fetch(`${API_BASE}/container-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

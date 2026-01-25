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

export async function getRuns(modelIds?: string[], limit?: number): Promise<RunsResponse> {
  const searchParams = new URLSearchParams();
  if (modelIds?.length) {
    searchParams.set('model_ids', modelIds.join(','));
  }
  if (limit) {
    searchParams.set('limit', String(limit));
  }
  const queryString = searchParams.toString();
  return fetchJson<RunsResponse>(`/runs${queryString ? `?${queryString}` : ''}`);
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

// Schedule management
export async function getSchedules(): Promise<SchedulesResponse> {
  return fetchJson<SchedulesResponse>('/schedules');
}

export interface CreateScheduleParams {
  model_id: string;
  cron_expression: string;
  sample_size?: number;
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

export async function deleteSchedule(scheduleId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/schedules/${scheduleId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export async function toggleSchedulePause(scheduleId: string, isPaused: boolean): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/schedules/${scheduleId}/pause`, {
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

export interface UpdateScheduleParams {
  cron_expression?: string;
  sample_size?: number;
}

export async function updateSchedule(scheduleId: string, params: UpdateScheduleParams): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/schedules/${scheduleId}`, {
    method: 'PATCH',
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

// Trigger benchmark run via GitHub Actions
export interface TriggerRunParams {
  model_id: string;
  sample_size?: number;
}

export async function triggerRun(params: TriggerRunParams): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/trigger-run`, {
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

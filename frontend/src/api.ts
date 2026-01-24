import type {
  RunsResponse,
  RunDetailResponse,
  ProblemsResponse,
  TrendsResponse,
  ModelsResponse,
} from './types';

const API_BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function getRuns(): Promise<RunsResponse> {
  return fetchJson<RunsResponse>('/runs');
}

export async function getRun(id: string): Promise<RunDetailResponse> {
  return fetchJson<RunDetailResponse>(`/runs/${id}`);
}

export async function getRunProblems(runId: string): Promise<ProblemsResponse> {
  return fetchJson<ProblemsResponse>(`/runs/${runId}/problems`);
}

export async function getTrends(): Promise<TrendsResponse> {
  return fetchJson<TrendsResponse>('/trends');
}

export async function getModels(): Promise<ModelsResponse> {
  return fetchJson<ModelsResponse>('/models');
}

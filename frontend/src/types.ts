export interface Model {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  active: boolean;
}

export interface BenchmarkRun {
  id: string;
  model_id: string;
  model_display_name?: string;
  model_provider?: string;
  run_date: string;
  sample_size: number | null;
  score: number | null;
  passed_count: number | null;
  total_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  input_cost: number | null;
  output_cost: number | null;
  duration_seconds: number | null;
  github_run_id: string | null;
  status: string;
  created_at: string;
}

export interface TrendDataPoint {
  date: string;
  model_id: string;
  model_display_name: string;
  score: number;
  sample_size: number;
}

export interface RunsResponse {
  runs: BenchmarkRun[];
}

export interface TrendsResponse {
  trends: TrendDataPoint[];
}

export interface ModelsResponse {
  models: Model[];
}

export interface CostSummaryData {
  total_month: number;
  average_per_run: number;
  run_count: number;
}

// Container-based benchmark schedules
export interface ModelSchedule {
  id: string;
  model_id: string;
  model_name: string;
  cron_expression: string;
  sample_size: number | null;
  is_paused: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface SchedulesResponse {
  schedules: ModelSchedule[];
}

// Container run (benchmark execution)
export interface ContainerRun {
  id: string;
  model_id: string;
  model_name: string;
  sample_size: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  trigger_type: 'manual' | 'scheduled';
  progress_current: number;
  progress_total: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ContainerRunsResponse {
  runs: ContainerRun[];
}

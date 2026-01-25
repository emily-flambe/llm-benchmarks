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

export interface ProblemResult {
  id: string;
  run_id: string;
  problem_id: string;
  passed: boolean;
  error_type: 'syntax' | 'runtime' | 'wrong_answer' | 'timeout' | null;
  latency_ms: number | null;
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

export interface RunDetailResponse {
  run: BenchmarkRun;
}

export interface ProblemsResponse {
  problems: ProblemResult[];
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

export interface WorkflowRun {
  id: number;
  run_number: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  event: string;
  model: string;
  sample_size: string;
}

export interface WorkflowRunsResponse {
  runs: WorkflowRun[];
}

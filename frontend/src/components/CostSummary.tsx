import type { BenchmarkRun } from '../types';

interface CostSummaryProps {
  runs: BenchmarkRun[];
  loading?: boolean;
  modelNames?: string;
}

function calculateCostSummary(runs: BenchmarkRun[]): {
  totalMonth: number;
  averagePerRun: number;
  runCount: number;
} {
  // Filter to runs from current month
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthRuns = runs.filter((run) => {
    const runDate = new Date(run.run_date);
    return runDate.getMonth() === currentMonth && runDate.getFullYear() === currentYear;
  });

  const totalMonth = monthRuns.reduce((sum, run) => {
    return sum + (run.input_cost ?? 0) + (run.output_cost ?? 0);
  }, 0);

  const averagePerRun = monthRuns.length > 0 ? totalMonth / monthRuns.length : 0;

  return {
    totalMonth,
    averagePerRun,
    runCount: monthRuns.length,
  };
}

export default function CostSummary({ runs, loading, modelNames }: CostSummaryProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">Cost Summary</span>
        </div>
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  const summary = calculateCostSummary(runs);
  const subtitle = modelNames ? ` - ${modelNames}` : '';

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Cost Summary (This Month){subtitle}</span>
      </div>
      <div className="cost-grid">
        <div className="cost-item">
          <div className="cost-value">${summary.totalMonth.toFixed(2)}</div>
          <div className="cost-label">Total Spent</div>
        </div>
        <div className="cost-item">
          <div className="cost-value">${summary.averagePerRun.toFixed(2)}</div>
          <div className="cost-label">Avg per Run</div>
        </div>
        <div className="cost-item">
          <div className="cost-value">{summary.runCount}</div>
          <div className="cost-label">Runs</div>
        </div>
        <div className="cost-item">
          <div className="cost-value">
            {runs.reduce((sum, r) => sum + (r.total_count ?? 0), 0)}
          </div>
          <div className="cost-label">Problems Tested</div>
        </div>
      </div>
    </div>
  );
}

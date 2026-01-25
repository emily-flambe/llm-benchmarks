import { useState } from 'react';
import type { BenchmarkRun } from '../types';

type DateRange = 'all' | 'ytd' | 'mtd' | '30d' | '7d' | '24h';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'mtd', label: 'Month to Date' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'all', label: 'All Time' },
];

interface CostSummaryProps {
  runs: BenchmarkRun[];
  loading?: boolean;
}

function filterRunsByDateRange(runs: BenchmarkRun[], range: DateRange): BenchmarkRun[] {
  const now = new Date();

  switch (range) {
    case 'all':
      return runs;

    case 'ytd': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return runs.filter((run) => new Date(run.run_date) >= startOfYear);
    }

    case 'mtd': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return runs.filter((run) => new Date(run.run_date) >= startOfMonth);
    }

    case '30d': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return runs.filter((run) => new Date(run.run_date) >= thirtyDaysAgo);
    }

    case '7d': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return runs.filter((run) => new Date(run.run_date) >= sevenDaysAgo);
    }

    case '24h': {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return runs.filter((run) => new Date(run.run_date) >= oneDayAgo);
    }

    default:
      return runs;
  }
}

function calculateCostSummary(runs: BenchmarkRun[]): {
  totalCost: number;
  averagePerRun: number;
  runCount: number;
  totalProblems: number;
} {
  const totalCost = runs.reduce((sum, run) => {
    return sum + (run.input_cost ?? 0) + (run.output_cost ?? 0);
  }, 0);

  const averagePerRun = runs.length > 0 ? totalCost / runs.length : 0;
  const totalProblems = runs.reduce((sum, r) => sum + (r.total_count ?? 0), 0);

  return {
    totalCost,
    averagePerRun,
    runCount: runs.length,
    totalProblems,
  };
}

export default function CostSummary({ runs, loading }: CostSummaryProps) {
  const [dateRange, setDateRange] = useState<DateRange>('24h');

  if (loading) {
    return (
      <section className="cost-section">
        <div className="cost-header">
          <h2 className="section-title">Cost Summary</h2>
        </div>
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      </section>
    );
  }

  const filteredRuns = filterRunsByDateRange(runs, dateRange);
  const summary = calculateCostSummary(filteredRuns);

  return (
    <section className="cost-section">
      <div className="cost-header">
        <h2 className="section-title">Cost Summary</h2>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          style={{
            padding: '0.375rem 0.75rem',
            fontSize: '0.8125rem',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '0.375rem',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="cost-grid">
        <div className="cost-item">
          <div className="cost-value">${summary.totalCost.toFixed(2)}</div>
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
          <div className="cost-value">{summary.totalProblems}</div>
          <div className="cost-label">Problems Tested</div>
        </div>
      </div>
    </section>
  );
}

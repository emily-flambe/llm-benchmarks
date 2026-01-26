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

interface ScoreCardProps {
  runs: BenchmarkRun[];
  modelIds: string[];
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

function aggregateRunsByModel(runs: BenchmarkRun[], modelIds: string[]): BenchmarkRun[] {
  return modelIds.map((modelId) => {
    const modelRuns = runs.filter((r) => r.model_id === modelId);
    if (modelRuns.length === 0) return null;

    const totalSamples = modelRuns.reduce((sum, r) => sum + (r.sample_size ?? 0), 0);
    const weightedScore = totalSamples > 0
      ? modelRuns.reduce((sum, r) => sum + (r.score ?? 0) * (r.sample_size ?? 0), 0) / totalSamples
      : 0;
    const totalPassed = modelRuns.reduce((sum, r) => sum + (r.passed_count ?? 0), 0);
    const totalCount = modelRuns.reduce((sum, r) => sum + (r.total_count ?? 0), 0);
    const totalDuration = modelRuns.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);

    const baseRun = modelRuns[0];
    return {
      ...baseRun,
      score: weightedScore,
      sample_size: totalSamples,
      passed_count: totalPassed,
      total_count: totalCount,
      duration_seconds: totalDuration,
    };
  }).filter((r): r is BenchmarkRun => r !== null);
}

function ModelScoreCard({ run }: { run: BenchmarkRun }) {
  const score = run.score !== null ? (run.score * 100).toFixed(1) : '--';
  const modelName = run.model_display_name || run.model_id;

  return (
    <div className="model-score-card">
      <div className="model-score-name">{modelName}</div>
      <div className="model-score-value">{score}%</div>
      <div className="model-score-detail">
        {run.passed_count ?? 0} / {run.total_count ?? 0} passed
      </div>
      <div className="model-score-meta">
        <span>{run.sample_size ?? 'Full'} samples</span>
        <span>{run.duration_seconds ? `${Math.round(run.duration_seconds / 60)}m` : '--'}</span>
      </div>
    </div>
  );
}

export default function ScoreCard({ runs, modelIds, loading }: ScoreCardProps) {
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const rangeLabel = DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label || '';

  if (loading) {
    return (
      <section className="scores-section">
        <div className="scores-header">
          <h2 className="section-title">Aggregated Pass@1 Scores</h2>
        </div>
        <div className="scores-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="model-score-card loading-card">
              <div className="loading-spinner" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const filteredRuns = filterRunsByDateRange(runs, dateRange);
  const aggregatedRuns = aggregateRunsByModel(filteredRuns, modelIds);

  return (
    <section className="scores-section">
      <div className="scores-header">
        <h2 className="section-title">Aggregated Pass@1 Scores</h2>
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
      {aggregatedRuns.length === 0 ? (
        <div className="empty-state">No benchmark runs for {rangeLabel.toLowerCase()}</div>
      ) : (
        <div className="scores-grid">
          {aggregatedRuns.map((run) => (
            <ModelScoreCard key={run.model_id} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}

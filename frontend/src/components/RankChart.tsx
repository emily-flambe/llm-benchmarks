import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
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

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-5': '#22c55e',
  'claude-sonnet-4': '#3b82f6',
  'gpt-4-1': '#f59e0b',
  'gpt-5-1': '#a855f7',
  'gpt-5-2': '#ec4899',
  'o3': '#06b6d4',
};

const DEFAULT_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

function getModelColor(modelId: string, index: number): string {
  return MODEL_COLORS[modelId] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

interface RankChartProps {
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

interface AggregatedModel {
  modelId: string;
  displayName: string;
  score: number;
  sampleSize: number;
}

function aggregateRunsByModel(runs: BenchmarkRun[], modelIds: string[]): AggregatedModel[] {
  return modelIds.map((modelId) => {
    const modelRuns = runs.filter((r) => r.model_id === modelId);
    if (modelRuns.length === 0) return null;

    const totalSamples = modelRuns.reduce((sum, r) => sum + (r.sample_size ?? 0), 0);
    const weightedScore = totalSamples > 0
      ? modelRuns.reduce((sum, r) => sum + (r.score ?? 0) * (r.sample_size ?? 0), 0) / totalSamples
      : 0;

    return {
      modelId,
      displayName: modelRuns[0].model_display_name || modelId,
      score: weightedScore * 100,
      sampleSize: totalSamples,
    };
  }).filter((r): r is AggregatedModel => r !== null)
    .sort((a, b) => b.score - a.score);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: AggregatedModel }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{data.displayName}</div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        Score: <span style={{ color: getModelColor(data.modelId, 0), fontWeight: 500 }}>{data.score.toFixed(1)}%</span>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {data.sampleSize} samples
      </div>
    </div>
  );
}

export default function RankChart({ runs, modelIds, loading }: RankChartProps) {
  const [dateRange, setDateRange] = useState<DateRange>('all');

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">Model Rankings</span>
        </div>
        <div className="chart-container">
          <div className="loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  const filteredRuns = filterRunsByDateRange(runs, dateRange);
  const chartData = aggregateRunsByModel(filteredRuns, modelIds);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Model Rankings</span>
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
      {chartData.length === 0 ? (
        <div className="chart-container">
          <div className="empty-state">No data for selected range</div>
        </div>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="displayName"
                stroke="var(--text-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis
                domain={[0, (dataMax: number) => Math.ceil((dataMax + 5) / 5) * 5]}
                tickFormatter={(value) => `${value}%`}
                stroke="var(--text-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)' }} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={entry.modelId} fill={getModelColor(entry.modelId, index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

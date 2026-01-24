import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TrendDataPoint } from '../types';

interface TrendChartProps {
  data: TrendDataPoint[];
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TooltipPayload {
  value: number;
  payload: TrendDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;
  const score = (data.score * 100).toFixed(1);

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{formatDate(data.date)}</div>
      <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{score}%</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Sample: {data.sample_size}
      </div>
    </div>
  );
}

export default function TrendChart({ data, loading }: TrendChartProps) {
  if (loading) {
    return (
      <div className="card full-width">
        <div className="card-header">
          <span className="card-title">Score Trend (30 Days)</span>
        </div>
        <div className="chart-container">
          <div className="loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card full-width">
        <div className="card-header">
          <span className="card-title">Score Trend (30 Days)</span>
        </div>
        <div className="chart-container">
          <div className="empty-state">No trend data available</div>
        </div>
      </div>
    );
  }

  // Convert score to percentage for display
  const chartData = data.map((d) => ({
    ...d,
    scorePercent: d.score * 100,
  }));

  return (
    <div className="card full-width">
      <div className="card-header">
        <span className="card-title">Score Trend (30 Days)</span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="var(--text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              stroke="var(--text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="scorePercent"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ fill: 'var(--accent)', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: 'var(--accent)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

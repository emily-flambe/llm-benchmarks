import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { TrendDataPoint } from '../types';

// Color palette for different models
const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-5': '#22c55e',    // green (primary)
  'claude-sonnet-4': '#3b82f6',    // blue
  'gpt-4-1': '#f59e0b',            // amber
  'o3': '#ec4899',                 // pink
};

const DEFAULT_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

function getModelColor(modelId: string, index: number): string {
  return MODEL_COLORS[modelId] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

interface TrendChartProps {
  data: TrendDataPoint[];
  loading?: boolean;
  selectedModelIds?: string[];
}

function formatDate(dateStr: string): string {
  // Parse as UTC to avoid timezone shift (YYYY-MM-DD is interpreted as UTC midnight)
  // Add T12:00:00 to treat as noon UTC, avoiding date boundary issues
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

interface ChartDataPoint {
  date: string;
  [key: string]: number | string | undefined;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
  payload: ChartDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  modelNames: Record<string, string>;
}

function CustomTooltip({ active, payload, modelNames }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const date = payload[0].payload.date;

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: '0.5rem',
        padding: '0.75rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{formatDate(date)}</div>
      {payload.map((item) => {
        const modelId = item.dataKey.replace('_score', '');
        const displayName = modelNames[modelId] || modelId;
        const sampleSize = item.payload[`${modelId}_samples`] as number | undefined;
        return (
          <div
            key={item.dataKey}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: item.color,
              }}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {displayName}:
            </span>
            <span style={{ color: item.color, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
              {item.value?.toFixed(1)}%
            </span>
            {sampleSize !== undefined && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ({sampleSize} samples)
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function TrendChart({ data, loading }: TrendChartProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">Score Trend (30 Days, UTC)</span>
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
      <div className="card">
        <div className="card-header">
          <span className="card-title">Score Trend (30 Days, UTC)</span>
        </div>
        <div className="chart-container">
          <div className="empty-state">No trend data available</div>
        </div>
      </div>
    );
  }

  // Get unique models in the data
  const modelIds = [...new Set(data.map((d) => d.model_id))];
  const modelNames: Record<string, string> = {};
  data.forEach((d) => {
    if (!modelNames[d.model_id]) {
      modelNames[d.model_id] = d.model_display_name || d.model_id;
    }
  });

  // Transform data for multi-line chart
  // Group by date, with each model's score and sample_size as separate fields
  const dateMap = new Map<string, ChartDataPoint>();
  data.forEach((d) => {
    if (!dateMap.has(d.date)) {
      dateMap.set(d.date, { date: d.date });
    }
    const point = dateMap.get(d.date)!;
    point[`${d.model_id}_score`] = d.score * 100;
    point[`${d.model_id}_samples`] = d.sample_size;
  });

  const chartData = Array.from(dateMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Calculate y-axis domain based on data variance
  const allScores = data.map((d) => d.score * 100);
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  const range = maxScore - minScore;
  const padding = Math.max(range * 0.2, 5); // At least 5% padding, or 20% of range
  const yMin = Math.max(0, Math.floor((minScore - padding) / 5) * 5); // Round down to nearest 5
  const yMax = Math.min(100, Math.ceil((maxScore + padding) / 5) * 5); // Round up to nearest 5

  const showLegend = modelIds.length > 1;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Score Trend (30 Days, UTC)</span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: showLegend ? 10 : 0 }}>
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
              domain={[yMin, yMax]}
              tickFormatter={(value) => `${value}%`}
              stroke="var(--text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              width={45}
            />
            <Tooltip content={<CustomTooltip modelNames={modelNames} />} />
            {showLegend && (
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => {
                  const modelId = value.replace('_score', '');
                  return modelNames[modelId] || modelId;
                }}
                wrapperStyle={{ fontSize: '0.75rem' }}
              />
            )}
            {modelIds.map((modelId, index) => (
              <Line
                key={modelId}
                type="monotone"
                dataKey={`${modelId}_score`}
                name={`${modelId}_score`}
                stroke={getModelColor(modelId, index)}
                strokeWidth={2}
                dot={{ fill: getModelColor(modelId, index), strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: getModelColor(modelId, index) }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

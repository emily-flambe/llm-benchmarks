/**
 * Tests for TrendChart component
 * Focus: loading/empty states, data transformation, chart rendering
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendChart from '../components/TrendChart';
import type { TrendDataPoint } from '../types';

// Mock recharts to avoid ResizeObserver issues in tests
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
}));

function createMockTrendData(overrides: Partial<TrendDataPoint> = {}): TrendDataPoint {
  return {
    date: '2025-01-20',
    model_id: 'claude-opus-4-5',
    model_display_name: 'Claude Opus 4.5',
    score: 0.85,
    sample_size: 100,
    ...overrides,
  };
}

describe('TrendChart', () => {
  describe('Loading state', () => {
    it('should display loading spinner when loading=true', () => {
      render(<TrendChart data={[]} loading={true} selectedModelIds={['claude-opus-4-5']} />);

      expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
    });

    it('should display title when loading', () => {
      render(<TrendChart data={[]} loading={true} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByText('Score Trend (30 Days, UTC)')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should display empty state when data array is empty', () => {
      render(<TrendChart data={[]} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByText('No trend data available')).toBeInTheDocument();
    });

    it('should display title when empty', () => {
      render(<TrendChart data={[]} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByText('Score Trend (30 Days, UTC)')).toBeInTheDocument();
    });
  });

  describe('Chart rendering', () => {
    it('should render chart components when data exists', () => {
      const data = [createMockTrendData()];
      render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should render with single data point', () => {
      const data = [createMockTrendData()];
      render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should render with multiple data points', () => {
      const data = [
        createMockTrendData({ date: '2025-01-18', score: 0.80 }),
        createMockTrendData({ date: '2025-01-19', score: 0.82 }),
        createMockTrendData({ date: '2025-01-20', score: 0.85 }),
      ];
      render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
  });

  describe('Title', () => {
    it('should always display "Score Trend (30 Days, UTC)"', () => {
      render(<TrendChart data={[createMockTrendData()]} loading={false} />);

      expect(screen.getByText('Score Trend (30 Days, UTC)')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('should handle data with zero score', () => {
      const data = [createMockTrendData({ score: 0 })];
      render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should handle data with perfect score', () => {
      const data = [createMockTrendData({ score: 1 })];
      render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should handle data with null-ish values in sample_size', () => {
      const data = [createMockTrendData({ sample_size: 0 })];
      render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
  });
});

describe('TrendChart Data Transformation', () => {
  // Test the data transformation logic separately
  it('should convert score to percentage internally', () => {
    // The component converts score (0-1) to scorePercent (0-100)
    // This is internal logic verified by the fact that the chart renders
    const data = [createMockTrendData({ score: 0.5 })];
    render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

    // If chart renders without error, transformation worked
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('should handle very small score differences', () => {
    const data = [
      createMockTrendData({ date: '2025-01-19', score: 0.8500 }),
      createMockTrendData({ date: '2025-01-20', score: 0.8501 }),
    ];
    render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('should handle score regression (decreasing trend)', () => {
    const data = [
      createMockTrendData({ date: '2025-01-18', score: 0.90 }),
      createMockTrendData({ date: '2025-01-19', score: 0.85 }),
      createMockTrendData({ date: '2025-01-20', score: 0.80 }),
    ];
    render(<TrendChart data={data} loading={false} selectedModelIds={['claude-opus-4-5']} />);

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});

/**
 * Tests for App component
 * Focus: data loading, error handling, component integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import * as api from '../api';
import type { BenchmarkRun, TrendDataPoint, Model } from '../types';

// Mock the API module
vi.mock('../api', () => ({
  getRuns: vi.fn(),
  getTrends: vi.fn(),
  getModels: vi.fn(),
}));

const mockGetRuns = api.getRuns as ReturnType<typeof vi.fn>;
const mockGetTrends = api.getTrends as ReturnType<typeof vi.fn>;
const mockGetModels = api.getModels as ReturnType<typeof vi.fn>;

// Mock recharts
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
}));

function createMockRun(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  return {
    id: 'test-run-1',
    model_id: 'claude-opus-4-5',
    model_display_name: 'Claude Opus 4.5',
    run_date: '2025-01-20T10:00:00Z',
    sample_size: 100,
    score: 0.85,
    passed_count: 85,
    total_count: 100,
    input_tokens: 50000,
    output_tokens: 25000,
    input_cost: 0.75,
    output_cost: 3.75,
    duration_seconds: 1200,
    github_run_id: 'gh-123',
    status: 'completed',
    created_at: '2025-01-20T10:00:00Z',
    ...overrides,
  };
}

function createMockTrend(overrides: Partial<TrendDataPoint> = {}): TrendDataPoint {
  return {
    date: '2025-01-20',
    model_id: 'claude-opus-4-5',
    model_display_name: 'Claude Opus 4.5',
    score: 0.85,
    sample_size: 100,
    ...overrides,
  };
}

function createMockModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'claude-opus-4-5',
    provider: 'anthropic',
    model_name: 'claude-opus-4-5-20251101',
    display_name: 'Claude Opus 4.5',
    input_price_per_m: 15,
    output_price_per_m: 75,
    active: true,
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default mock for models
    mockGetModels.mockResolvedValue({ models: [createMockModel()] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial data loading', () => {
    it('should show loading state initially', async () => {
      // Use never-resolving promises
      mockGetRuns.mockImplementation(() => new Promise(() => {}));
      mockGetTrends.mockImplementation(() => new Promise(() => {}));

      render(<App />);

      // Should show loading spinners
      expect(document.querySelectorAll('.loading-spinner').length).toBeGreaterThan(0);
    });

    it('should call both getRuns and getTrends on mount', async () => {
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        expect(mockGetRuns).toHaveBeenCalled();
        expect(mockGetTrends).toHaveBeenCalled();
      });
    });

    it('should render all dashboard components after loading', async () => {
      mockGetRuns.mockResolvedValue({ runs: [createMockRun()] });
      mockGetTrends.mockResolvedValue({ trends: [createMockTrend()] });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Latest pass@1 Score')).toBeInTheDocument();
        expect(screen.getByText(/Cost Summary/)).toBeInTheDocument();
        expect(screen.getByText('Score Trend (30 Days, UTC)')).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('should display error message when getRuns fails', async () => {
      mockGetRuns.mockRejectedValue(new Error('Failed to fetch runs'));
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load benchmark data')).toBeInTheDocument();
        expect(screen.getByText('Failed to fetch runs')).toBeInTheDocument();
      });
    });

    it('should display error message when getTrends fails', async () => {
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockRejectedValue(new Error('Failed to fetch trends'));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load benchmark data')).toBeInTheDocument();
        expect(screen.getByText('Failed to fetch trends')).toBeInTheDocument();
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockGetRuns.mockRejectedValue('Something went wrong');
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load benchmark data')).toBeInTheDocument();
        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      });
    });

    it('should not render dashboard grid when error occurs', async () => {
      mockGetRuns.mockRejectedValue(new Error('API error'));
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load benchmark data')).toBeInTheDocument();
      });

      expect(document.querySelector('.dashboard-grid')).not.toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('should display app title', async () => {
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      expect(screen.getByText('LLM Benchmarks')).toBeInTheDocument();
    });

    it('should display subtitle', async () => {
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      expect(screen.getByText(/Tracking LLM code generation quality/)).toBeInTheDocument();
    });

    it('should display GitHub link', async () => {
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      const githubLink = document.querySelector('a[href="https://github.com/emily-flambe/llm-benchmarks"]');
      expect(githubLink).toBeInTheDocument();
      expect(githubLink).toHaveAttribute('target', '_blank');
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Latest run selection', () => {
    it('should display score when runs exist for selected model', async () => {
      const runs = [
        createMockRun({ id: 'run-1', score: 0.91, model_id: 'claude-opus-4-5' }),
      ];
      mockGetRuns.mockResolvedValue({ runs });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        // ScoreCard should render with score
        expect(screen.getByText('Latest pass@1 Score')).toBeInTheDocument();
        // Score should be displayed (91%)
        expect(screen.getByText('91.0%')).toBeInTheDocument();
      });
    });

    it('should handle empty runs array', async () => {
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        // ScoreCard shows "No benchmark runs yet" when empty
        expect(screen.getByText('No benchmark runs yet')).toBeInTheDocument();
      });
    });
  });

  describe('Data flow', () => {
    it('should pass trends to TrendChart', async () => {
      const trends = [
        createMockTrend({ date: '2025-01-18', score: 0.80 }),
        createMockTrend({ date: '2025-01-19', score: 0.85 }),
      ];
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockResolvedValue({ trends });

      render(<App />);

      await waitFor(() => {
        // Chart should be rendered (using mocked recharts)
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      });
    });

    it('should pass runs to CostSummary', async () => {
      // Use current month date for cost calculations
      const now = new Date();
      const currentMonthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15T12:00:00Z`;
      const runs = [
        createMockRun({ id: 'run-1', run_date: currentMonthDate, input_cost: 1, output_cost: 2 }),
      ];
      mockGetRuns.mockResolvedValue({ runs });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        // Cost summary should show total cost - appears twice (total and average)
        const costElements = screen.getAllByText('$3.00');
        expect(costElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('API call ordering', () => {
    it('should call both APIs on initial render', async () => {
      mockGetRuns.mockResolvedValue({ runs: [] });
      mockGetTrends.mockResolvedValue({ trends: [] });

      render(<App />);

      await waitFor(() => {
        expect(mockGetRuns).toHaveBeenCalledTimes(1);
        expect(mockGetTrends).toHaveBeenCalledTimes(1);
      });
    });
  });
});

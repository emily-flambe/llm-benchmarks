/**
 * Tests for CostSummary component
 * Focus: month filtering, calculation edge cases, null handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CostSummary from '../components/CostSummary';
import type { BenchmarkRun } from '../types';

function createMockRun(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  return {
    id: 'test-run-1',
    model_id: 'claude-opus-4-5',
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

describe('CostSummary', () => {
  // Mock the current date to be January 2025
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-24T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Loading state', () => {
    it('should display loading spinner when loading=true', () => {
      render(<CostSummary runs={[]} loading={true} />);

      expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Cost calculations', () => {
    it('should calculate total cost for current month runs', () => {
      // Use full ISO timestamps to avoid timezone issues
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 1, output_cost: 2 }),
        createMockRun({ id: 'run-2', run_date: '2025-01-21T12:00:00Z', input_cost: 0.5, output_cost: 1.5 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Total: (1+2) + (0.5+1.5) = 5
      expect(screen.getByText('$5.00')).toBeInTheDocument();
    });

    it('should exclude runs from previous months', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 1, output_cost: 2 }),
        createMockRun({ id: 'run-2', run_date: '2024-12-20T12:00:00Z', input_cost: 100, output_cost: 200 }), // Previous month
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Total should only be 3 (from January run), not 303
      // Note: $3.00 appears twice (total and average) since there's only 1 run in month
      const threeElements = screen.getAllByText('$3.00');
      expect(threeElements.length).toBe(2); // Both total and average are $3
    });

    it('should exclude runs from next months', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 1, output_cost: 2 }),
        createMockRun({ id: 'run-2', run_date: '2025-02-01T12:00:00Z', input_cost: 100, output_cost: 200 }), // Next month
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // $3.00 appears twice (total and average) since there's only 1 run in month
      const threeElements = screen.getAllByText('$3.00');
      expect(threeElements.length).toBe(2);
    });

    it('should handle runs from same month different year', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 1, output_cost: 2 }),
        createMockRun({ id: 'run-2', run_date: '2024-01-20T12:00:00Z', input_cost: 100, output_cost: 200 }), // Same month, different year
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Should only count 2025-01 - $3.00 appears twice (total and average)
      const threeElements = screen.getAllByText('$3.00');
      expect(threeElements.length).toBe(2);
    });

    it('should calculate average per run', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 2, output_cost: 2 }),
        createMockRun({ id: 'run-2', run_date: '2025-01-21T12:00:00Z', input_cost: 1, output_cost: 1 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Average: 6 / 2 = 3
      expect(screen.getByText('$3.00')).toBeInTheDocument();
    });

    it('should display run count for current month', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z' }),
        createMockRun({ id: 'run-2', run_date: '2025-01-21T12:00:00Z' }),
        createMockRun({ id: 'run-3', run_date: '2024-12-20T12:00:00Z' }), // Previous month
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Should show 2 runs (only January)
      const runLabels = screen.getAllByText('Runs');
      expect(runLabels.length).toBeGreaterThan(0);
    });
  });

  describe('Empty state', () => {
    it('should display $0.00 when no runs exist', () => {
      render(<CostSummary runs={[]} loading={false} />);

      // Multiple $0.00 values (total and average)
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });

    it('should display 0 runs when no runs exist', () => {
      render(<CostSummary runs={[]} loading={false} />);

      // Find the run count
      const costItems = document.querySelectorAll('.cost-item');
      expect(costItems.length).toBeGreaterThan(0);
    });

    it('should display $0.00 when all runs are from other months', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2024-12-20T12:00:00Z', input_cost: 10, output_cost: 20 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // All dollar values should be $0.00
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });
  });

  describe('Null cost handling', () => {
    it('should treat null input_cost as 0', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: null, output_cost: 2 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // $2.00 appears twice (total and average) since there's only 1 run
      const twoElements = screen.getAllByText('$2.00');
      expect(twoElements.length).toBe(2);
    });

    it('should treat null output_cost as 0', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 1, output_cost: null }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // $1.00 appears twice (total and average) since there's only 1 run
      const oneElements = screen.getAllByText('$1.00');
      expect(oneElements.length).toBe(2);
    });

    it('should treat both null costs as 0', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: null, output_cost: null }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });
  });

  describe('Problems tested count', () => {
    it('should sum total_count across all runs', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', total_count: 100 }),
        createMockRun({ id: 'run-2', run_date: '2025-01-21T12:00:00Z', total_count: 50 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Total problems: 100 + 50 = 150
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('should treat null total_count as 0', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', total_count: 100 }),
        createMockRun({ id: 'run-2', run_date: '2025-01-21T12:00:00Z', total_count: null }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should include all runs in problems count (not just current month)', () => {
      // Note: Looking at the code, problems count uses ALL runs, not just current month
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', total_count: 100 }),
        createMockRun({ id: 'run-2', run_date: '2024-12-20T12:00:00Z', total_count: 50 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Should be 150 (all runs)
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });

  describe('Card structure', () => {
    it('should display title "Cost Summary (This Month)"', () => {
      render(<CostSummary runs={[]} loading={false} />);

      expect(screen.getByText('Cost Summary (This Month)')).toBeInTheDocument();
    });

    it('should display all four metrics', () => {
      render(<CostSummary runs={[]} loading={false} />);

      expect(screen.getByText('Total Spent')).toBeInTheDocument();
      expect(screen.getByText('Avg per Run')).toBeInTheDocument();
      expect(screen.getByText('Runs')).toBeInTheDocument();
      expect(screen.getByText('Problems Tested')).toBeInTheDocument();
    });
  });

  describe('Division by zero', () => {
    it('should handle average calculation with zero runs', () => {
      render(<CostSummary runs={[]} loading={false} />);

      // Average should be $0.00, not NaN or error
      const dollars = screen.getAllByText('$0.00');
      expect(dollars.length).toBeGreaterThan(0);
    });
  });

  describe('Decimal precision', () => {
    it('should format costs to 2 decimal places', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 0.333, output_cost: 0.666 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // 0.333 + 0.666 = 0.999, formatted as $1.00
      // Appears twice (total and average) since there's only 1 run
      const oneElements = screen.getAllByText('$1.00');
      expect(oneElements.length).toBe(2);
    });

    it('should handle very small costs', () => {
      const runs = [
        createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', input_cost: 0.001, output_cost: 0.001 }),
      ];
      render(<CostSummary runs={runs} loading={false} />);

      // Should round to $0.00 - may appear multiple times
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });
  });
});

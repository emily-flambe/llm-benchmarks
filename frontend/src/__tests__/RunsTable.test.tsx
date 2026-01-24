/**
 * Tests for RunsTable component
 * Focus: sorting behavior, edge cases, click handling
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RunsTable from '../components/RunsTable';
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

describe('RunsTable', () => {
  describe('Loading state', () => {
    it('should display loading spinner when loading=true', () => {
      render(<RunsTable runs={[]} loading={true} />);

      expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
    });

    it('should not display table when loading', () => {
      const mockRuns = [createMockRun()];
      render(<RunsTable runs={mockRuns} loading={true} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should display empty state when runs array is empty', () => {
      render(<RunsTable runs={[]} loading={false} />);

      expect(screen.getByText('No benchmark runs yet')).toBeInTheDocument();
    });
  });

  describe('Table rendering', () => {
    it('should display table headers', () => {
      const mockRuns = [createMockRun()];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText(/Date/)).toBeInTheDocument();
      expect(screen.getByText(/Score/)).toBeInTheDocument();
      expect(screen.getByText(/Sample/)).toBeInTheDocument();
      expect(screen.getByText(/Cost/)).toBeInTheDocument();
      expect(screen.getByText(/Status/)).toBeInTheDocument();
    });

    it('should display run data in rows', () => {
      const mockRuns = [createMockRun({ score: 0.85, sample_size: 100 })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('85.0%')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should display multiple runs', () => {
      const mockRuns = [
        createMockRun({ id: 'run-1', score: 0.85 }),
        createMockRun({ id: 'run-2', score: 0.75 }),
        createMockRun({ id: 'run-3', score: 0.95 }),
      ];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('85.0%')).toBeInTheDocument();
      expect(screen.getByText('75.0%')).toBeInTheDocument();
      expect(screen.getByText('95.0%')).toBeInTheDocument();
    });
  });

  describe('Score display', () => {
    it('should display score as percentage', () => {
      const mockRuns = [createMockRun({ score: 0.85 })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('85.0%')).toBeInTheDocument();
    });

    it('should display -- for null score', () => {
      const mockRuns = [createMockRun({ score: null })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('--')).toBeInTheDocument();
    });

    it('should display 0.0% for zero score', () => {
      const mockRuns = [createMockRun({ score: 0 })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });
  });

  describe('Sample size display', () => {
    it('should display numeric sample size', () => {
      const mockRuns = [createMockRun({ sample_size: 50 })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('should display "Full" for null sample size', () => {
      const mockRuns = [createMockRun({ sample_size: null })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('Full')).toBeInTheDocument();
    });
  });

  describe('Cost display', () => {
    it('should display total cost', () => {
      const mockRuns = [createMockRun({ input_cost: 0.75, output_cost: 3.75 })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('$4.50')).toBeInTheDocument();
    });

    it('should display -- for zero cost', () => {
      const mockRuns = [createMockRun({ input_cost: 0, output_cost: 0 })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('--')).toBeInTheDocument();
    });

    it('should handle null costs', () => {
      const mockRuns = [createMockRun({ input_cost: null, output_cost: null })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('--')).toBeInTheDocument();
    });

    it('should handle mixed null/number costs', () => {
      const mockRuns = [createMockRun({ input_cost: null, output_cost: 3.75 })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      expect(screen.getByText('$3.75')).toBeInTheDocument();
    });
  });

  describe('Status display', () => {
    it('should display completed status with success badge', () => {
      const mockRuns = [createMockRun({ status: 'completed' })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      const badge = screen.getByText('completed');
      expect(badge).toHaveClass('badge-success');
    });

    it('should display failed status with error badge', () => {
      const mockRuns = [createMockRun({ status: 'failed' })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      const badge = screen.getByText('failed');
      expect(badge).toHaveClass('badge-error');
    });

    it('should display any non-completed status with error badge', () => {
      const mockRuns = [createMockRun({ status: 'running' })];
      render(<RunsTable runs={mockRuns} loading={false} />);

      const badge = screen.getByText('running');
      expect(badge).toHaveClass('badge-error');
    });
  });

  describe('Sorting', () => {
    // Use full ISO timestamps to avoid timezone issues
    const sortableRuns = [
      createMockRun({ id: 'run-1', run_date: '2025-01-20T12:00:00Z', score: 0.85, sample_size: 100, input_cost: 1, output_cost: 2 }),
      createMockRun({ id: 'run-2', run_date: '2025-01-22T12:00:00Z', score: 0.75, sample_size: 50, input_cost: 0.5, output_cost: 1 }),
      createMockRun({ id: 'run-3', run_date: '2025-01-21T12:00:00Z', score: 0.95, sample_size: 200, input_cost: 2, output_cost: 4 }),
    ];

    it('should sort by date descending by default', () => {
      render(<RunsTable runs={sortableRuns} loading={false} />);

      const rows = screen.getAllByRole('row');
      // First row is header, data starts at index 1
      // Default sort: date descending -> run-2 (Jan 22) should be first
      expect(rows[1]).toHaveTextContent('Jan 22, 2025');
    });

    it('should toggle sort direction when clicking same column', () => {
      render(<RunsTable runs={sortableRuns} loading={false} />);

      const dateHeader = screen.getByText(/^Date/);

      // First click toggles from descending to ascending
      fireEvent.click(dateHeader);

      const rows = screen.getAllByRole('row');
      // Ascending: run-1 (Jan 20) should be first
      expect(rows[1]).toHaveTextContent('Jan 20, 2025');
    });

    it('should sort by score when clicking Score header', () => {
      render(<RunsTable runs={sortableRuns} loading={false} />);

      const scoreHeader = screen.getByText(/Score/);
      fireEvent.click(scoreHeader);

      const rows = screen.getAllByRole('row');
      // Descending by score: 0.95 (run-3) should be first
      expect(rows[1]).toHaveTextContent('95.0%');
    });

    it('should sort by sample size when clicking Sample header', () => {
      render(<RunsTable runs={sortableRuns} loading={false} />);

      const sampleHeader = screen.getByText(/Sample/);
      fireEvent.click(sampleHeader);

      const rows = screen.getAllByRole('row');
      // Descending by sample: 200 (run-3) should be first
      expect(rows[1]).toHaveTextContent('200');
    });

    it('should sort by cost when clicking Cost header', () => {
      render(<RunsTable runs={sortableRuns} loading={false} />);

      const costHeader = screen.getByText(/Cost/);
      fireEvent.click(costHeader);

      const rows = screen.getAllByRole('row');
      // Descending by cost: $6.00 (run-3: 2+4) should be first
      expect(rows[1]).toHaveTextContent('$6.00');
    });

    it('should handle sorting with null values', () => {
      const runsWithNulls = [
        createMockRun({ id: 'run-1', score: 0.85 }),
        createMockRun({ id: 'run-2', score: null }),
        createMockRun({ id: 'run-3', score: 0.95 }),
      ];
      render(<RunsTable runs={runsWithNulls} loading={false} />);

      const scoreHeader = screen.getByText(/Score/);
      fireEvent.click(scoreHeader);

      // Should not crash, null treated as 0
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBe(4); // header + 3 data rows
    });

    it('should show sort indicator', () => {
      render(<RunsTable runs={sortableRuns} loading={false} />);

      const dateHeader = screen.getByText(/Date/);
      // Default is date descending, should show 'v'
      expect(dateHeader).toHaveTextContent('v');
    });
  });

  describe('Row click handling', () => {
    it('should call onRowClick when clicking a row', () => {
      const onRowClick = vi.fn();
      const mockRun = createMockRun({ id: 'run-1' });
      render(<RunsTable runs={[mockRun]} loading={false} onRowClick={onRowClick} />);

      const row = screen.getByRole('row', { name: /Jan 20/ });
      fireEvent.click(row);

      expect(onRowClick).toHaveBeenCalledWith(mockRun);
    });

    it('should not throw if onRowClick is not provided', () => {
      const mockRun = createMockRun({ id: 'run-1' });
      render(<RunsTable runs={[mockRun]} loading={false} />);

      const row = screen.getByRole('row', { name: /Jan 20/ });

      expect(() => fireEvent.click(row)).not.toThrow();
    });

    it('should add clickable class when onRowClick is provided', () => {
      const onRowClick = vi.fn();
      const mockRun = createMockRun({ id: 'run-1' });
      render(<RunsTable runs={[mockRun]} loading={false} onRowClick={onRowClick} />);

      const rows = document.querySelectorAll('tbody tr');
      expect(rows[0]).toHaveClass('clickable');
    });

    it('should not add clickable class when onRowClick is not provided', () => {
      const mockRun = createMockRun({ id: 'run-1' });
      render(<RunsTable runs={[mockRun]} loading={false} />);

      const rows = document.querySelectorAll('tbody tr');
      expect(rows[0]).not.toHaveClass('clickable');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string dates gracefully', () => {
      const mockRun = createMockRun({ run_date: '' });
      render(<RunsTable runs={[mockRun]} loading={false} />);

      // Should not crash, may show "Invalid Date" or similar
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should handle very large numbers', () => {
      const mockRun = createMockRun({
        input_cost: 999999.99,
        output_cost: 999999.99,
        sample_size: Number.MAX_SAFE_INTEGER
      });
      render(<RunsTable runs={[mockRun]} loading={false} />);

      expect(screen.getByText('$1999999.98')).toBeInTheDocument();
    });

    it('should handle negative costs', () => {
      // Shouldn't happen in real data, but test defensive coding
      const mockRun = createMockRun({ input_cost: -1, output_cost: -2 });
      render(<RunsTable runs={[mockRun]} loading={false} />);

      // -1 + -2 = -3, which is < 0, should show --
      // Actually looking at the code: total === 0 returns '--', negative doesn't
      expect(screen.getByText('$-3.00')).toBeInTheDocument();
    });
  });
});

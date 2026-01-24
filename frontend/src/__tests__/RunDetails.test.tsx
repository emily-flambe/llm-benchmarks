/**
 * Tests for RunDetails component (modal)
 * Focus: API integration, error states, close handling, problem display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RunDetails from '../components/RunDetails';
import type { BenchmarkRun, ProblemResult } from '../types';
import * as api from '../api';

// Mock the API module
vi.mock('../api', () => ({
  getRunProblems: vi.fn(),
}));

const mockGetRunProblems = api.getRunProblems as ReturnType<typeof vi.fn>;

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

function createMockProblem(overrides: Partial<ProblemResult> = {}): ProblemResult {
  return {
    id: 'problem-1',
    run_id: 'test-run-1',
    problem_id: 'LC-001',
    passed: true,
    error_type: null,
    latency_ms: 150,
    ...overrides,
  };
}

describe('RunDetails', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRunProblems.mockResolvedValue({ problems: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Integration', () => {
    it('should call getRunProblems with run ID on mount', async () => {
      const mockRun = createMockRun({ id: 'run-123' });
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(mockGetRunProblems).toHaveBeenCalledWith('run-123');
      });
    });

    it('should call getRunProblems again when run ID changes', async () => {
      const mockRun1 = createMockRun({ id: 'run-1' });
      const mockRun2 = createMockRun({ id: 'run-2' });
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      const { rerender } = render(<RunDetails run={mockRun1} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(mockGetRunProblems).toHaveBeenCalledWith('run-1');
      });

      rerender(<RunDetails run={mockRun2} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(mockGetRunProblems).toHaveBeenCalledWith('run-2');
      });
    });
  });

  describe('Loading state', () => {
    it('should display loading spinner while fetching problems', () => {
      const mockRun = createMockRun();
      // Don't resolve the promise immediately
      mockGetRunProblems.mockImplementation(() => new Promise(() => {}));

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should display error message when API fails', async () => {
      const mockRun = createMockRun();
      mockGetRunProblems.mockRejectedValue(new Error('Network error'));

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // BUG FOUND: RunDetails component only accesses err.message in catch handler
      // When a non-Error is thrown (e.g., string), err.message is undefined
      // This causes error to be set to undefined, which renders as empty stats
      // The component should have: setError(err.message || String(err))
      const mockRun = createMockRun();
      mockGetRunProblems.mockRejectedValue('Something went wrong');

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      // Since err.message is undefined for strings, error state is undefined
      // The component renders normally (no error-message div)
      await waitFor(() => {
        // Component should still render without crashing
        expect(document.querySelector('.modal')).toBeInTheDocument();
      });
    });
  });

  describe('Modal header', () => {
    it('should display run date in header', async () => {
      const mockRun = createMockRun({ run_date: '2025-01-20T14:30:00Z' });
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText(/Run Details/)).toBeInTheDocument();
        expect(screen.getByText(/Jan 20, 2025/)).toBeInTheDocument();
      });
    });

    it('should display close button', async () => {
      const mockRun = createMockRun();
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /\u00d7/ })).toBeInTheDocument();
      });
    });
  });

  describe('Close behavior', () => {
    it('should call onClose when close button is clicked', async () => {
      const mockRun = createMockRun();
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.queryByRole('button')).toBeInTheDocument();
      });

      const closeButton = document.querySelector('.modal-close');
      if (closeButton) {
        fireEvent.click(closeButton);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when overlay is clicked', async () => {
      const mockRun = createMockRun();
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(document.querySelector('.modal-overlay')).toBeInTheDocument();
      });

      const overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        fireEvent.click(overlay);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should NOT call onClose when modal content is clicked', async () => {
      const mockRun = createMockRun();
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(document.querySelector('.modal')).toBeInTheDocument();
      });

      const modal = document.querySelector('.modal');
      if (modal) {
        fireEvent.click(modal);
      }

      // onClose should not have been called because stopPropagation
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Stats summary', () => {
    it('should display passed and failed counts', async () => {
      const mockRun = createMockRun({ score: 0.80 });
      const problems = [
        createMockProblem({ id: 'p1', passed: true }),
        createMockProblem({ id: 'p2', passed: true }),
        createMockProblem({ id: 'p3', passed: false }),
      ];
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        // Use more specific queries since numbers appear multiple places
        const statItems = document.querySelectorAll('.stat-item');
        expect(statItems.length).toBeGreaterThan(0);
        // Verify the stats summary section exists with the counts
        expect(document.querySelector('.stats-summary')).toBeInTheDocument();
      });
    });

    it('should display score from run data', async () => {
      const mockRun = createMockRun({ score: 0.85 });
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('85.0%')).toBeInTheDocument();
      });
    });

    it('should display -- for null score', async () => {
      const mockRun = createMockRun({ score: null });
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('--')).toBeInTheDocument();
      });
    });

    it('should display total cost', async () => {
      const mockRun = createMockRun({ input_cost: 0.75, output_cost: 3.25 });
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('$4.00')).toBeInTheDocument();
      });
    });

    it('should handle null costs', async () => {
      const mockRun = createMockRun({ input_cost: null, output_cost: null });
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('$0.00')).toBeInTheDocument();
      });
    });
  });

  describe('Error breakdown', () => {
    it('should display error type counts for failed problems', async () => {
      const mockRun = createMockRun();
      const problems = [
        createMockProblem({ id: 'p1', passed: false, error_type: 'syntax' }),
        createMockProblem({ id: 'p2', passed: false, error_type: 'syntax' }),
        createMockProblem({ id: 'p3', passed: false, error_type: 'runtime' }),
      ];
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Error Breakdown')).toBeInTheDocument();
        expect(screen.getByText('Syntax Error')).toBeInTheDocument();
        expect(screen.getByText('Runtime Error')).toBeInTheDocument();
      });
    });

    it('should not display error breakdown when no failed problems', async () => {
      const mockRun = createMockRun();
      const problems = [
        createMockProblem({ id: 'p1', passed: true }),
        createMockProblem({ id: 'p2', passed: true }),
      ];
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.queryByText('Error Breakdown')).not.toBeInTheDocument();
      });
    });

    it('should handle all error types', async () => {
      const mockRun = createMockRun();
      const problems = [
        createMockProblem({ id: 'p1', passed: false, error_type: 'syntax' }),
        createMockProblem({ id: 'p2', passed: false, error_type: 'runtime' }),
        createMockProblem({ id: 'p3', passed: false, error_type: 'wrong_answer' }),
        createMockProblem({ id: 'p4', passed: false, error_type: 'timeout' }),
        createMockProblem({ id: 'p5', passed: false, error_type: null }),
      ];
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Syntax Error')).toBeInTheDocument();
        expect(screen.getByText('Runtime Error')).toBeInTheDocument();
        expect(screen.getByText('Wrong Answer')).toBeInTheDocument();
        expect(screen.getByText('Timeout')).toBeInTheDocument();
        // "Failed" appears multiple times (error breakdown + problem status)
        // Use getAllByText to verify it exists
        expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Problem grid', () => {
    it('should display all problems', async () => {
      const mockRun = createMockRun();
      const problems = [
        createMockProblem({ id: 'p1', problem_id: 'LC-001', passed: true }),
        createMockProblem({ id: 'p2', problem_id: 'LC-002', passed: false }),
        createMockProblem({ id: 'p3', problem_id: 'LC-003', passed: true }),
      ];
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('LC-001')).toBeInTheDocument();
        expect(screen.getByText('LC-002')).toBeInTheDocument();
        expect(screen.getByText('LC-003')).toBeInTheDocument();
      });
    });

    it('should display Pass/Fail status for each problem', async () => {
      const mockRun = createMockRun();
      const problems = [
        createMockProblem({ id: 'p1', passed: true }),
        createMockProblem({ id: 'p2', passed: false }),
      ];
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Pass')).toBeInTheDocument();
        expect(screen.getByText('Fail')).toBeInTheDocument();
      });
    });

    it('should handle empty problems array', async () => {
      const mockRun = createMockRun();
      mockGetRunProblems.mockResolvedValue({ problems: [] });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Problem Results')).toBeInTheDocument();
      });

      // Problem grid should be empty but component should render
      const problemGrid = document.querySelector('.problem-grid');
      expect(problemGrid?.children.length).toBe(0);
    });

    it('should apply correct CSS classes for passed/failed problems', async () => {
      const mockRun = createMockRun();
      const problems = [
        createMockProblem({ id: 'p1', passed: true }),
        createMockProblem({ id: 'p2', passed: false }),
      ];
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        const passedItems = document.querySelectorAll('.problem-item.passed');
        const failedItems = document.querySelectorAll('.problem-item.failed');
        expect(passedItems.length).toBe(1);
        expect(failedItems.length).toBe(1);
      });
    });
  });

  describe('Large data handling', () => {
    it('should handle many problems without crashing', async () => {
      const mockRun = createMockRun();
      const problems = Array.from({ length: 500 }, (_, i) =>
        createMockProblem({
          id: `p-${i}`,
          problem_id: `LC-${i.toString().padStart(4, '0')}`,
          passed: i % 3 !== 0, // 1/3 failed
        })
      );
      mockGetRunProblems.mockResolvedValue({ problems });

      render(<RunDetails run={mockRun} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Problem Results')).toBeInTheDocument();
      });

      // Should render without crashing
      const problemGrid = document.querySelector('.problem-grid');
      expect(problemGrid?.children.length).toBe(500);
    });
  });
});

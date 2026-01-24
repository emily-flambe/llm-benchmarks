/**
 * Tests for the API client module
 * Focus: fetch call correctness, error handling, edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRuns, getRun, getRunProblems, getTrends, getModels } from '../api';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getRuns', () => {
    it('should make GET request to /api/runs', async () => {
      const mockResponse = { runs: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getRuns();

      expect(mockFetch).toHaveBeenCalledWith('/api/runs');
      expect(result).toEqual(mockResponse);
    });

    it('should handle successful response with runs data', async () => {
      const mockRuns = {
        runs: [
          {
            id: 'run-1',
            model_id: 'claude-opus',
            run_date: '2025-01-20',
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
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRuns),
      });

      const result = await getRuns();

      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].id).toBe('run-1');
    });

    it('should throw error on HTTP 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
      });

      await expect(getRuns()).rejects.toThrow('Internal Server Error');
    });

    it('should throw error on HTTP 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      await expect(getRuns()).rejects.toThrow('Not found');
    });

    it('should handle malformed JSON error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(getRuns()).rejects.toThrow('Request failed');
    });

    it('should handle network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getRuns()).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      await expect(getRuns()).rejects.toThrow('Request timeout');
    });
  });

  describe('getRun', () => {
    it('should make GET request to /api/runs/:id', async () => {
      const mockResponse = { run: { id: 'run-123' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getRun('run-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/runs/run-123');
    });

    it('should handle special characters in ID', async () => {
      const mockResponse = { run: { id: 'run-with-special' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Note: This tests raw ID passing - real impl may need URL encoding
      await getRun('run/with/slashes');

      expect(mockFetch).toHaveBeenCalledWith('/api/runs/run/with/slashes');
    });

    it('should throw on non-existent run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Run not found' }),
      });

      await expect(getRun('nonexistent')).rejects.toThrow('Run not found');
    });
  });

  describe('getRunProblems', () => {
    it('should make GET request to /api/runs/:id/problems', async () => {
      const mockResponse = { problems: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getRunProblems('run-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/runs/run-123/problems');
    });

    it('should return problems array', async () => {
      const mockProblems = {
        problems: [
          { id: 'p1', run_id: 'run-123', problem_id: 'LC-001', passed: true, error_type: null, latency_ms: 150 },
          { id: 'p2', run_id: 'run-123', problem_id: 'LC-002', passed: false, error_type: 'wrong_answer', latency_ms: 200 },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProblems),
      });

      const result = await getRunProblems('run-123');

      expect(result.problems).toHaveLength(2);
      expect(result.problems[0].passed).toBe(true);
      expect(result.problems[1].error_type).toBe('wrong_answer');
    });
  });

  describe('getTrends', () => {
    it('should make GET request to /api/trends', async () => {
      const mockResponse = { trends: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getTrends();

      expect(mockFetch).toHaveBeenCalledWith('/api/trends');
    });

    it('should return trend data points', async () => {
      const mockTrends = {
        trends: [
          { date: '2025-01-20', score: 0.85, sample_size: 100 },
          { date: '2025-01-21', score: 0.87, sample_size: 100 },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTrends),
      });

      const result = await getTrends();

      expect(result.trends).toHaveLength(2);
      expect(result.trends[1].score).toBe(0.87);
    });
  });

  describe('getModels', () => {
    it('should make GET request to /api/models', async () => {
      const mockResponse = { models: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await getModels();

      expect(mockFetch).toHaveBeenCalledWith('/api/models');
    });
  });

  describe('Error edge cases', () => {
    it('should handle empty error message from server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(getRuns()).rejects.toThrow('HTTP 500');
    });

    it('should handle null error from server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: null }),
      });

      await expect(getRuns()).rejects.toThrow('HTTP 400');
    });

    it('should handle response with ok: false but no status text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: '' }),
      });

      await expect(getRuns()).rejects.toThrow('HTTP 503');
    });
  });
});

import { useState, useEffect } from 'react';
import { getRunProblems } from '../api';
import type { BenchmarkRun, ProblemResult } from '../types';

interface RunDetailsProps {
  run: BenchmarkRun;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getErrorTypeLabel(errorType: string | null): string {
  switch (errorType) {
    case 'syntax':
      return 'Syntax Error';
    case 'runtime':
      return 'Runtime Error';
    case 'wrong_answer':
      return 'Wrong Answer';
    case 'timeout':
      return 'Timeout';
    default:
      return 'Failed';
  }
}

export default function RunDetails({ run, onClose }: RunDetailsProps) {
  const [problems, setProblems] = useState<ProblemResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getRunProblems(run.id)
      .then((data) => {
        setProblems(data.problems);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [run.id]);

  const passedCount = problems.filter((p) => p.passed).length;
  const failedCount = problems.filter((p) => !p.passed).length;

  // Group failed problems by error type
  const errorCounts: Record<string, number> = {};
  problems
    .filter((p) => !p.passed)
    .forEach((p) => {
      const type = p.error_type ?? 'unknown';
      errorCounts[type] = (errorCounts[type] ?? 0) + 1;
    });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Run Details - {formatDate(run.run_date)}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner" />
            </div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : (
            <>
              <div className="stats-summary">
                <div className="stat-item">
                  <div className="stat-value success">{passedCount}</div>
                  <div className="stat-label">Passed</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value error">{failedCount}</div>
                  <div className="stat-label">Failed</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {run.score !== null ? `${(run.score * 100).toFixed(1)}%` : '--'}
                  </div>
                  <div className="stat-label">Score</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    ${((run.input_cost ?? 0) + (run.output_cost ?? 0)).toFixed(2)}
                  </div>
                  <div className="stat-label">Cost</div>
                </div>
              </div>

              {Object.keys(errorCounts).length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Error Breakdown
                  </h3>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {Object.entries(errorCounts).map(([type, count]) => (
                      <div
                        key={type}
                        style={{
                          padding: '0.5rem 0.75rem',
                          backgroundColor: 'var(--bg-tertiary)',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        <span style={{ color: 'var(--error)', fontWeight: 500 }}>{count}</span>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>
                          {getErrorTypeLabel(type)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h3
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: '0.75rem',
                }}
              >
                Problem Results
              </h3>
              <div className="problem-grid">
                {problems.map((problem) => (
                  <div
                    key={problem.id}
                    className={`problem-item ${problem.passed ? 'passed' : 'failed'}`}
                    title={
                      problem.passed
                        ? `Passed${problem.latency_ms ? ` (${problem.latency_ms}ms)` : ''}`
                        : getErrorTypeLabel(problem.error_type)
                    }
                  >
                    <span className="problem-id">{problem.problem_id}</span>
                    <span className={`problem-status ${problem.passed ? 'passed' : 'failed'}`}>
                      {problem.passed ? 'Pass' : 'Fail'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

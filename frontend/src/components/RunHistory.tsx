import { useState, useEffect, useCallback } from 'react';
import { getContainerRuns } from '../api';
import type { ContainerRun } from '../types';

// Parse database timestamp as UTC (timestamps are stored without timezone)
function parseUtcTimestamp(timestamp: string): Date {
  // If it doesn't end with Z, append it to ensure UTC parsing
  const utcStr = timestamp.endsWith('Z') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
  return new Date(utcStr);
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '--';
  const start = parseUtcTimestamp(startedAt);
  const end = completedAt ? parseUtcTimestamp(completedAt) : new Date();
  const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);

  if (seconds < 0) return '--'; // Guard against future start times
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTime(dateString: string | null): string {
  if (!dateString) return '--';
  const date = parseUtcTimestamp(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function StatusBadge({ status }: { status: ContainerRun['status'] }) {
  const colors: Record<ContainerRun['status'], { bg: string; text: string }> = {
    pending: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
    running: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
    completed: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
    failed: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  };

  const { bg, text } = colors[status];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.625rem',
        borderRadius: '9999px',
        backgroundColor: bg,
        color: text,
        fontSize: '0.75rem',
        fontWeight: 500,
        textTransform: 'capitalize',
      }}
    >
      {status === 'running' && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: text,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {status}
    </span>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div
        style={{
          flex: 1,
          height: '6px',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: 'var(--accent)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '3rem' }}>
        {current}/{total}
      </span>
    </div>
  );
}

function RunRow({ run, isExpanded, onToggle }: { run: ContainerRun; isExpanded: boolean; onToggle: () => void }) {
  const hasDetails = run.error_message || run.status === 'failed';

  return (
    <>
      <tr
        onClick={hasDetails ? onToggle : undefined}
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
      >
        <td style={{ fontWeight: 500 }}>
          {hasDetails && (
            <span style={{ marginRight: '0.5rem', color: 'var(--text-muted)' }}>
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          {run.model_name}
        </td>
        <td>
          <StatusBadge status={run.status} />
        </td>
        <td style={{ minWidth: '120px' }}>
          {run.status === 'running' || run.status === 'completed' ? (
            <ProgressBar current={run.progress_current} total={run.progress_total} />
          ) : run.status === 'failed' ? (
            <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
              Click to view error
            </span>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>--</span>
          )}
        </td>
        <td>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              textTransform: 'capitalize',
            }}
          >
            {run.trigger_type}
          </span>
        </td>
        <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {formatTime(run.started_at || run.created_at)}
        </td>
        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
          {formatDuration(run.started_at, run.completed_at)}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td
            colSpan={6}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              padding: '1rem',
            }}
          >
            <div style={{ fontSize: '0.8125rem' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Error Details:</strong>
              <pre
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#ef4444',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  margin: '0.5rem 0 0 0',
                }}
              >
                {run.error_message || 'Unknown error'}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function RunHistory() {
  const [runs, setRuns] = useState<ContainerRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const loadRuns = useCallback(async () => {
    try {
      const data = await getContainerRuns(50);
      setRuns(data.runs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();

    // Poll for updates every 5 seconds if there are running jobs
    const interval = setInterval(() => {
      loadRuns();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadRuns]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="card">
        <h2 style={{ margin: '0 0 1rem 0' }}>Run History</h2>
        <div className="loading-state">Loading runs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2 style={{ margin: '0 0 1rem 0' }}>Run History</h2>
        <div className="error-message">
          <p>Failed to load runs</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Run History</h2>
        <button
          className="btn btn-secondary btn-small"
          onClick={loadRuns}
          style={{ fontSize: '0.75rem' }}
        >
          Refresh
        </button>
      </div>

      {runs.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No benchmark runs yet. Use the Schedules tab to start a run.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Trigger</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  isExpanded={expandedRows.has(run.id)}
                  onToggle={() => toggleRow(run.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

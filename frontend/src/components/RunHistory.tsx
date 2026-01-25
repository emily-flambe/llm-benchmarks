import { useState, useEffect, useCallback } from 'react';

interface WorkflowRun {
  id: number;
  run_number: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  event: string;
  model: string;
  sample_size: string;
  trigger_source: string;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDuration(createdAt: string, updatedAt: string): string {
  const start = new Date(createdAt);
  const end = new Date(updatedAt);
  const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);

  if (seconds < 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function StatusBadge({ status, conclusion }: { status: string; conclusion: string | null }) {
  let bg: string;
  let text: string;
  let label: string;

  if (status === 'completed') {
    if (conclusion === 'success') {
      bg = 'rgba(34, 197, 94, 0.15)';
      text = '#22c55e';
      label = 'Success';
    } else if (conclusion === 'failure') {
      bg = 'rgba(239, 68, 68, 0.15)';
      text = '#ef4444';
      label = 'Failed';
    } else {
      bg = 'rgba(107, 114, 128, 0.15)';
      text = '#6b7280';
      label = conclusion || 'Unknown';
    }
  } else if (status === 'in_progress') {
    bg = 'rgba(59, 130, 246, 0.15)';
    text = '#3b82f6';
    label = 'Running';
  } else {
    bg = 'rgba(234, 179, 8, 0.15)';
    text = '#eab308';
    label = 'Queued';
  }

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
      }}
    >
      {status === 'in_progress' && (
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
      {label}
    </span>
  );
}

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-opus-4-5': 'Claude Opus 4.5',
  'claude-sonnet-4': 'Claude Sonnet 4',
  'gpt-4-1': 'GPT-4.1',
  'o3': 'o3',
};

export default function RunHistory() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch('/api/workflow-runs', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setRuns(data.runs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();

    // Poll for updates every 10 seconds
    const interval = setInterval(loadRuns, 10000);
    return () => clearInterval(interval);
  }, [loadRuns]);

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
                <th>Sample Size</th>
                <th>Trigger</th>
                <th>Started</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td style={{ fontWeight: 500 }}>
                    {MODEL_DISPLAY_NAMES[run.model] || run.model}
                  </td>
                  <td>
                    <StatusBadge status={run.status} conclusion={run.conclusion} />
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {run.sample_size}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {run.trigger_source}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {formatTime(run.created_at)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {formatDuration(run.created_at, run.updated_at)}
                  </td>
                  <td>
                    <a
                      href={run.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--accent)',
                        textDecoration: 'none',
                      }}
                    >
                      View
                    </a>
                  </td>
                </tr>
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

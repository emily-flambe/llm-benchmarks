import { useState, useEffect } from 'react';
import { getWorkflowRuns } from '../api';
import type { WorkflowRun } from '../types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatModel(model: string, workflowName?: string): string {
  // If model is unknown, try to extract from workflow name
  if (model === 'unknown' && workflowName) {
    const nameMatch = workflowName.match(/Benchmark - (.+)/);
    if (nameMatch) return nameMatch[1];
  }

  // Map full model names to short display names
  const modelMap: Record<string, string> = {
    'claude-opus-4-5-20251101': 'Opus 4.5',
    'claude-sonnet-4-20250514': 'Sonnet 4',
    'claude-sonnet-4': 'Sonnet 4',
    'gpt-4.1': 'GPT-4.1',
    'o3': 'o3',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
  };
  return modelMap[model] || model;
}

function getStatusDisplay(run: WorkflowRun): { label: string; className: string } {
  if (run.status === 'completed') {
    switch (run.conclusion) {
      case 'success':
        return { label: 'Success', className: 'badge-success' };
      case 'failure':
        return { label: 'Failed', className: 'badge-error' };
      case 'cancelled':
        return { label: 'Cancelled', className: 'badge-warning' };
      case 'skipped':
        return { label: 'Skipped', className: 'badge-muted' };
      case 'timed_out':
        return { label: 'Timed Out', className: 'badge-error' };
      default:
        return { label: 'Completed', className: 'badge-muted' };
    }
  }

  switch (run.status) {
    case 'queued':
      return { label: 'Queued', className: 'badge-pending' };
    case 'in_progress':
      return { label: 'Running', className: 'badge-running' };
    case 'waiting':
      return { label: 'Waiting', className: 'badge-pending' };
    default:
      return { label: run.status, className: 'badge-muted' };
  }
}

function getDuration(run: WorkflowRun): string {
  if (run.status !== 'completed') {
    const start = new Date(run.created_at);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return '<1m';
    return `${diffMins}m`;
  }

  const start = new Date(run.created_at);
  const end = new Date(run.updated_at);
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return '<1m';
  return `${diffMins}m`;
}

const PAGE_SIZE = 10;

export default function WorkflowRuns() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function fetchRuns() {
      try {
        const data = await getWorkflowRuns();
        setRuns(data.runs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch workflow runs');
      } finally {
        setLoading(false);
      }
    }

    fetchRuns();

    // Refresh every 30 seconds
    const interval = setInterval(fetchRuns, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="card full-width">
        <div className="card-header">
          <span className="card-title">Workflow Runs</span>
        </div>
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card full-width">
        <div className="card-header">
          <span className="card-title">Workflow Runs</span>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="card full-width">
        <div className="card-header">
          <span className="card-title">Workflow Runs</span>
        </div>
        <div className="empty-state">No workflow runs found</div>
      </div>
    );
  }

  const totalPages = Math.ceil(runs.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedRuns = runs.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="card full-width">
      <div className="card-header">
        <span className="card-title">Workflow Runs</span>
        <span className="workflow-refresh-hint">Auto-refreshes every 30s</span>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Model</th>
              <th>Sample</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRuns.map((run) => {
              const status = getStatusDisplay(run);
              return (
                <tr key={run.id}>
                  <td>
                    <a
                      href={run.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="workflow-run-link"
                    >
                      #{run.run_number}
                    </a>
                  </td>
                  <td className="workflow-model">{formatModel(run.model, run.name)}</td>
                  <td className="workflow-sample">{run.sample_size}</td>
                  <td>{formatDate(run.created_at)}</td>
                  <td className="workflow-duration">{getDuration(run)}</td>
                  <td>
                    <span className={`badge ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

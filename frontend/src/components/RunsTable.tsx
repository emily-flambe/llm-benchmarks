import { useState, useMemo } from 'react';
import type { BenchmarkRun } from '../types';

interface RunsTableProps {
  runs: BenchmarkRun[];
  loading?: boolean;
  onRowClick?: (run: BenchmarkRun) => void;
  showModelColumn?: boolean;
}

type SortField = 'run_date' | 'score' | 'sample_size' | 'cost';
type SortDirection = 'asc' | 'desc';

function formatDate(dateStr: string): string {
  // Parse as UTC to avoid timezone shift
  const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatCost(run: BenchmarkRun): string {
  const total = (run.input_cost ?? 0) + (run.output_cost ?? 0);
  if (total === 0) return '--';
  return `$${total.toFixed(2)}`;
}

export default function RunsTable({ runs, loading, onRowClick, showModelColumn = false }: RunsTableProps) {
  const [sortField, setSortField] = useState<SortField>('run_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedRuns = useMemo(() => {
    const sorted = [...runs].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortField) {
        case 'run_date':
          aVal = new Date(a.run_date).getTime();
          bVal = new Date(b.run_date).getTime();
          break;
        case 'score':
          aVal = a.score ?? 0;
          bVal = b.score ?? 0;
          break;
        case 'sample_size':
          aVal = a.sample_size ?? 0;
          bVal = b.sample_size ?? 0;
          break;
        case 'cost':
          aVal = (a.input_cost ?? 0) + (a.output_cost ?? 0);
          bVal = (b.input_cost ?? 0) + (b.output_cost ?? 0);
          break;
        default:
          return 0;
      }

      const diff = aVal - bVal;
      return sortDirection === 'asc' ? diff : -diff;
    });

    return sorted;
  }, [runs, sortField, sortDirection]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  function getSortIndicator(field: SortField): string {
    if (sortField !== field) return '';
    return sortDirection === 'asc' ? ' ^' : ' v';
  }

  if (loading) {
    return (
      <div className="card full-width">
        <div className="card-header">
          <span className="card-title">Recent Runs</span>
        </div>
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="card full-width">
        <div className="card-header">
          <span className="card-title">Recent Runs</span>
        </div>
        <div className="empty-state">No benchmark runs yet</div>
      </div>
    );
  }

  return (
    <div className="card full-width">
      <div className="card-header">
        <span className="card-title">Recent Runs</span>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              {showModelColumn && <th>Model</th>}
              <th
                onClick={() => handleSort('run_date')}
                className={sortField === 'run_date' ? 'sorted' : ''}
              >
                Date{getSortIndicator('run_date')}
              </th>
              <th
                onClick={() => handleSort('score')}
                className={sortField === 'score' ? 'sorted' : ''}
              >
                Score{getSortIndicator('score')}
              </th>
              <th
                onClick={() => handleSort('sample_size')}
                className={sortField === 'sample_size' ? 'sorted' : ''}
              >
                Sample{getSortIndicator('sample_size')}
              </th>
              <th
                onClick={() => handleSort('cost')}
                className={sortField === 'cost' ? 'sorted' : ''}
              >
                Cost{getSortIndicator('cost')}
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedRuns.map((run) => (
              <tr
                key={run.id}
                onClick={() => onRowClick?.(run)}
                className={onRowClick ? 'clickable' : ''}
              >
                {showModelColumn && (
                  <td className="table-model">{run.model_display_name || run.model_id}</td>
                )}
                <td>{formatDate(run.run_date)}</td>
                <td className="table-score">
                  {run.score !== null ? `${(run.score * 100).toFixed(1)}%` : '--'}
                </td>
                <td>{run.sample_size ?? 'Full'}</td>
                <td className="table-cost">{formatCost(run)}</td>
                <td>
                  <span
                    className={`badge ${run.status === 'completed' ? 'badge-success' : 'badge-error'}`}
                  >
                    {run.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

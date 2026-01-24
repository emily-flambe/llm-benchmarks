import type { BenchmarkRun } from '../types';

interface ScoreCardProps {
  run: BenchmarkRun | null;
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ScoreCard({ run, loading }: ScoreCardProps) {
  if (loading) {
    return (
      <div className="card score-card">
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="card score-card">
        <div className="empty-state">No benchmark runs yet</div>
      </div>
    );
  }

  const score = run.score !== null ? (run.score * 100).toFixed(1) : '--';

  return (
    <div className="card score-card">
      <div className="card-title">Latest pass@1 Score</div>
      <div className="score-value">{score}%</div>
      <div className="score-label">
        {run.passed_count ?? 0} / {run.total_count ?? 0} problems passed
      </div>
      <div className="score-meta">
        <div className="score-meta-item">
          <div className="score-meta-value">{formatDate(run.run_date)}</div>
          <div className="score-meta-label">Run Date</div>
        </div>
        <div className="score-meta-item">
          <div className="score-meta-value">{run.sample_size ?? 'Full'}</div>
          <div className="score-meta-label">Sample Size</div>
        </div>
        <div className="score-meta-item">
          <div className="score-meta-value">
            {run.duration_seconds ? `${Math.round(run.duration_seconds / 60)}m` : '--'}
          </div>
          <div className="score-meta-label">Duration</div>
        </div>
      </div>
    </div>
  );
}

import type { BenchmarkRun } from '../types';

interface ScoreCardProps {
  runs: BenchmarkRun[];
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

function SingleScoreCard({ run }: { run: BenchmarkRun }) {
  const score = run.score !== null ? (run.score * 100).toFixed(1) : '--';
  const modelName = run.model_display_name || run.model_id;

  return (
    <div className="score-card-single">
      <div className="score-card-model">{modelName}</div>
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

export default function ScoreCard({ runs, loading }: ScoreCardProps) {
  if (loading) {
    return (
      <div className="card score-card">
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="card score-card">
        <div className="empty-state">No benchmark runs yet</div>
      </div>
    );
  }

  // Single model view
  if (runs.length === 1) {
    const run = runs[0];
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

  // Multi-model view
  return (
    <div className="card score-card-multi">
      <div className="card-title">Latest pass@1 Scores</div>
      <div className="score-cards-row">
        {runs.map((run) => (
          <SingleScoreCard key={run.model_id} run={run} />
        ))}
      </div>
    </div>
  );
}

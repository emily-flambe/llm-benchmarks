import type { BenchmarkRun } from '../types';

interface ScoreCardProps {
  runs: BenchmarkRun[];
  loading?: boolean;
}

function ModelScoreCard({ run }: { run: BenchmarkRun }) {
  const score = run.score !== null ? (run.score * 100).toFixed(1) : '--';
  const modelName = run.model_display_name || run.model_id;

  return (
    <div className="model-score-card">
      <div className="model-score-name">{modelName}</div>
      <div className="model-score-value">{score}%</div>
      <div className="model-score-detail">
        {run.passed_count ?? 0} / {run.total_count ?? 0} passed
      </div>
      <div className="model-score-meta">
        <span>{run.sample_size ?? 'Full'} samples</span>
        <span>{run.duration_seconds ? `${Math.round(run.duration_seconds / 60)}m` : '--'}</span>
      </div>
    </div>
  );
}

export default function ScoreCard({ runs, loading }: ScoreCardProps) {
  if (loading) {
    return (
      <section className="scores-section">
        <h2 className="section-title">Latest Pass@1 Scores (Past 24 Hours)</h2>
        <div className="scores-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="model-score-card loading-card">
              <div className="loading-spinner" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (runs.length === 0) {
    return (
      <section className="scores-section">
        <h2 className="section-title">Latest Pass@1 Scores (Past 24 Hours)</h2>
        <div className="empty-state">No benchmark runs in the past 24 hours</div>
      </section>
    );
  }

  return (
    <section className="scores-section">
      <h2 className="section-title">Latest Pass@1 Scores (Past 24 Hours)</h2>
      <div className="scores-grid">
        {runs.map((run) => (
          <ModelScoreCard key={run.model_id} run={run} />
        ))}
      </div>
    </section>
  );
}

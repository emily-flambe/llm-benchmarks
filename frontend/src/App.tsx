import { useState, useEffect, useCallback } from 'react';
import { getRuns, getTrends, getModels } from './api';
import type { BenchmarkRun, TrendDataPoint, Model } from './types';
import ScoreCard from './components/ScoreCard';
import TrendChart from './components/TrendChart';
import RunsTable from './components/RunsTable';
import CostSummary from './components/CostSummary';
import RunDetails from './components/RunDetails';
import AdminPanel from './components/AdminPanel';
import ModelSelector from './components/ModelSelector';
import WorkflowRuns from './components/WorkflowRuns';

type TabType = 'dashboard' | 'workflows';

const DEFAULT_MODEL_ID = 'claude-opus-4-5';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([DEFAULT_MODEL_ID]);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);

  // Fetch models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        const data = await getModels();
        setModels(data.models);
        // If default model isn't in the list, select the first available model
        if (data.models.length > 0 && !data.models.some((m) => m.id === DEFAULT_MODEL_ID)) {
          setSelectedModelIds([data.models[0].id]);
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      } finally {
        setModelsLoading(false);
      }
    }
    loadModels();
  }, []);

  // Fetch runs and trends when model selection changes
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const modelIds = selectedModelIds.length > 0 ? selectedModelIds : undefined;
      const [runsData, trendsData] = await Promise.all([
        getRuns(modelIds),
        getTrends(modelIds),
      ]);

      setRuns(runsData.runs);
      setTrends(trendsData.trends);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedModelIds]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get aggregated data for the latest date for each selected model
  // This matches the chart's aggregation logic (weighted average by sample size)
  const latestRunsByModel = selectedModelIds.map((modelId) => {
    const modelRuns = runs.filter((r) => r.model_id === modelId);
    if (modelRuns.length === 0) return null;

    // Find the latest date for this model
    const latestDate = modelRuns[0]?.run_date.split('T')[0];
    if (!latestDate) return null;

    // Get all runs from the latest date
    const runsOnLatestDate = modelRuns.filter(
      (r) => r.run_date.split('T')[0] === latestDate
    );

    // Aggregate: weighted average score, sum sample size
    const totalSamples = runsOnLatestDate.reduce((sum, r) => sum + (r.sample_size ?? 0), 0);
    const weightedScore = runsOnLatestDate.reduce(
      (sum, r) => sum + (r.score ?? 0) * (r.sample_size ?? 0),
      0
    ) / totalSamples;
    const totalPassed = runsOnLatestDate.reduce((sum, r) => sum + (r.passed_count ?? 0), 0);
    const totalCount = runsOnLatestDate.reduce((sum, r) => sum + (r.total_count ?? 0), 0);
    const totalDuration = runsOnLatestDate.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);

    // Return aggregated run (use first run as base for other fields)
    const baseRun = runsOnLatestDate[0];
    return {
      ...baseRun,
      score: weightedScore,
      sample_size: totalSamples,
      passed_count: totalPassed,
      total_count: totalCount,
      duration_seconds: totalDuration,
    };
  }).filter((r): r is BenchmarkRun => r !== null);

  // Get selected model names for display
  const selectedModelNames = selectedModelIds
    .map((id) => models.find((m) => m.id === id)?.display_name || id)
    .join(', ');

  return (
    <>
      <header className="header">
        <div className="container">
          <div className="header-content">
            <div>
              <h1>LLM Benchmarks</h1>
              <p className="header-subtitle">
                Tracking LLM code generation quality with LiveCodeBench
              </p>
              <ModelSelector
                models={models}
                selectedIds={selectedModelIds}
                onSelectionChange={setSelectedModelIds}
                loading={modelsLoading}
              />
            </div>
            <a
              href="https://github.com/emily-flambe/llm-benchmarks"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text-muted)' }}
              aria-label="View on GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <nav className="tab-nav container">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === 'workflows' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          Workflow Runs
        </button>
      </nav>

      <main className="container" style={{ paddingBottom: '3rem' }}>
        {activeTab === 'dashboard' ? (
          error ? (
            <div className="error-message">
              <p>Failed to load benchmark data</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
            </div>
          ) : (
            <div className="dashboard-grid">
              <ScoreCard runs={latestRunsByModel} loading={loading} />
              <CostSummary runs={runs} loading={loading} modelNames={selectedModelNames} />
              <TrendChart data={trends} loading={loading} selectedModelIds={selectedModelIds} />
              <RunsTable runs={runs} loading={loading} onRowClick={setSelectedRun} showModelColumn={selectedModelIds.length > 1} />
            </div>
          )
        ) : (
          <WorkflowRuns />
        )}
      </main>

      {selectedRun && <RunDetails run={selectedRun} onClose={() => setSelectedRun(null)} />}
      <AdminPanel />
    </>
  );
}

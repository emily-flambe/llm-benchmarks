import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { getRuns, getTrends, getModels, getAuthStatus, type AuthStatus } from './api';
import type { BenchmarkRun, TrendDataPoint, Model } from './types';
import ScoreCard from './components/ScoreCard';
import TrendChart from './components/TrendChart';
import CostSummary from './components/CostSummary';
import AdminPanel from './components/AdminPanel';
import Schedules from './components/Schedules';
import RunHistory from './components/RunHistory';

export default function App() {
  const navigate = useNavigate();
  const [models, setModels] = useState<Model[]>([]);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  // Fetch all data on mount
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [modelsData, runsData, trendsData] = await Promise.all([
        getModels(),
        getRuns(),
        getTrends(),
      ]);

      setModels(modelsData.models);
      setRuns(runsData.runs);
      setTrends(trendsData.trends);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Fetch auth status
    getAuthStatus().then(setAuthStatus).catch(() => setAuthStatus(null));
  }, [loadData]);

  // Get all active model IDs
  const activeModelIds = models.filter((m) => m.active).map((m) => m.id);

  // Get aggregated data for runs in the past 24 hours for each model
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last24HoursRunsByModel = activeModelIds.map((modelId) => {
    const modelRuns = runs.filter(
      (r) => r.model_id === modelId && new Date(r.run_date) >= oneDayAgo
    );
    if (modelRuns.length === 0) return null;

    // Aggregate: weighted average score, sum sample size
    const totalSamples = modelRuns.reduce((sum, r) => sum + (r.sample_size ?? 0), 0);
    const weightedScore = totalSamples > 0
      ? modelRuns.reduce((sum, r) => sum + (r.score ?? 0) * (r.sample_size ?? 0), 0) / totalSamples
      : 0;
    const totalPassed = modelRuns.reduce((sum, r) => sum + (r.passed_count ?? 0), 0);
    const totalCount = modelRuns.reduce((sum, r) => sum + (r.total_count ?? 0), 0);
    const totalDuration = modelRuns.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);

    // Return aggregated run (use first run as base for other fields)
    const baseRun = modelRuns[0];
    return {
      ...baseRun,
      score: weightedScore,
      sample_size: totalSamples,
      passed_count: totalPassed,
      total_count: totalCount,
      duration_seconds: totalDuration,
    };
  }).filter((r): r is BenchmarkRun => r !== null);

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
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Auth Status Indicator */}
              {authStatus !== null && (
                authStatus.authenticated ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#22c55e',
                    }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{authStatus.email}</span>
                    <a
                      href="/api/auth/logout"
                      style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}
                    >
                      Sign out
                    </a>
                  </div>
                ) : (
                  <a
                    href="/api/auth/login"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}
                  >
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                    }} />
                    Sign in
                  </a>
                )
              )}
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
        </div>
      </header>

      <nav className="tab-nav container">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/runs"
          className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
        >
          Run History
        </NavLink>
        <NavLink
          to="/schedules"
          className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
        >
          Schedules
        </NavLink>
      </nav>

      <main className="container" style={{ paddingBottom: '3rem' }}>
        <Routes>
          <Route
            path="/"
            element={
              error ? (
                <div className="error-message">
                  <p>Failed to load benchmark data</p>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
                </div>
              ) : (
                <div className="dashboard-grid">
                  <ScoreCard runs={last24HoursRunsByModel} loading={loading} />
                  <TrendChart data={trends} loading={loading} selectedModelIds={activeModelIds} />
                  <CostSummary runs={runs} loading={loading} />
                </div>
              )
            }
          />
          <Route path="/runs" element={<RunHistory />} />
          <Route path="/schedules" element={<Schedules onRunStarted={() => navigate('/runs')} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <AdminPanel />
    </>
  );
}

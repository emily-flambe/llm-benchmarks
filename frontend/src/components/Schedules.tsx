import { useState, useEffect, useCallback } from 'react';
import {
  getSchedules,
  getContainerRuns,
  getModels,
  createSchedule,
  deleteSchedule,
  toggleSchedulePause,
  startContainerRun,
} from '../api';
import type { ModelSchedule, ContainerRun, Model } from '../types';

const CRON_PRESETS = [
  { label: 'Daily at 6am UTC', value: '0 6 * * *' },
  { label: 'Daily at midnight UTC', value: '0 0 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Weekly (Sunday 6am UTC)', value: '0 6 * * 0' },
];

function describeCron(cron: string): string {
  const presetMatch = CRON_PRESETS.find((p) => p.value === cron);
  if (presetMatch) return presetMatch.label;
  return cron;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function formatProgress(run: ContainerRun): string {
  if (run.status === 'pending') return 'Pending...';
  if (run.status === 'failed') return 'Failed';
  if (run.status === 'completed') return 'Completed';
  if (run.progress_total && run.progress_total > 0) {
    const pct = Math.round(((run.progress_current || 0) / run.progress_total) * 100);
    return `${run.progress_current}/${run.progress_total} (${pct}%)`;
  }
  return 'Running...';
}

function getStatusColor(status: ContainerRun['status']): string {
  switch (status) {
    case 'completed':
      return 'var(--accent)';
    case 'failed':
      return '#ef4444';
    case 'running':
      return '#3b82f6';
    default:
      return 'var(--text-muted)';
  }
}

export default function Schedules() {
  const [schedules, setSchedules] = useState<ModelSchedule[]>([]);
  const [containerRuns, setContainerRuns] = useState<ContainerRun[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state for creating new schedule
  const [showForm, setShowForm] = useState(false);
  const [formModelId, setFormModelId] = useState('');
  const [formCron, setFormCron] = useState('0 6 * * *');
  const [formSampleSize, setFormSampleSize] = useState(100);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Ad-hoc run modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [runModelId, setRunModelId] = useState('');
  const [runSampleSize, setRunSampleSize] = useState(100);
  const [runSubmitting, setRunSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [schedulesData, runsData, modelsData] = await Promise.all([
        getSchedules(),
        getContainerRuns(),
        getModels(),
      ]);
      setSchedules(schedulesData.schedules);
      setContainerRuns(runsData.runs);
      setModels(modelsData.models);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Get models that don't have schedules yet
  const availableModels = models.filter(
    (m) => m.active && !schedules.some((s) => s.model_id === m.id)
  );

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formModelId) return;

    setFormSubmitting(true);
    try {
      await createSchedule({
        model_id: formModelId,
        cron_expression: formCron,
        sample_size: formSampleSize,
      });
      setShowForm(false);
      setFormModelId('');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (modelId: string, modelName: string) => {
    if (!confirm(`Delete schedule for ${modelName}?`)) return;
    try {
      await deleteSchedule(modelId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  const handleTogglePause = async (modelId: string, currentlyPaused: boolean) => {
    try {
      await toggleSchedulePause(modelId, !currentlyPaused);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update schedule');
    }
  };

  const handleStartRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runModelId) return;

    setRunSubmitting(true);
    try {
      await startContainerRun({
        model_id: runModelId,
        sample_size: runSampleSize,
      });
      setShowRunModal(false);
      setRunModelId('');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setRunSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading-state">Loading schedules...</div>;
  }

  if (error) {
    return (
      <div className="error-message">
        <p>Failed to load schedules</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Schedules Section */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Model Schedules</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowRunModal(true)}
            >
              Run Now
            </button>
            {availableModels.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => setShowForm(true)}
              >
                Add Schedule
              </button>
            )}
          </div>
        </div>

        {schedules.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No schedules configured yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Schedule</th>
                <th>Sample Size</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.model_display_name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {describeCron(schedule.cron_expression)}
                  </td>
                  <td>{schedule.sample_size}</td>
                  <td>
                    <span
                      style={{
                        color: schedule.is_paused ? 'var(--text-muted)' : 'var(--accent)',
                        fontWeight: 500,
                      }}
                    >
                      {schedule.is_paused ? 'Paused' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => handleTogglePause(schedule.model_id, schedule.is_paused)}
                      >
                        {schedule.is_paused ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleDeleteSchedule(schedule.model_id, schedule.model_display_name)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Container Runs Section */}
      <section className="card">
        <h2 style={{ margin: '0 0 1rem 0' }}>Recent Container Runs</h2>
        {containerRuns.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No container runs yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Sample Size</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Trigger</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {containerRuns.map((run) => (
                <tr key={run.id}>
                  <td>{run.model_display_name}</td>
                  <td>{run.sample_size}</td>
                  <td>
                    <span style={{ color: getStatusColor(run.status), fontWeight: 500 }}>
                      {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {formatProgress(run)}
                    {run.error_message && (
                      <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {run.error_message}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '0.125rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: run.trigger_type === 'manual' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                        fontSize: '0.75rem',
                      }}
                    >
                      {run.trigger_type}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {formatDate(run.started_at || run.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Create Schedule Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Schedule</h2>
            <form onSubmit={handleCreateSchedule}>
              <div className="form-group">
                <label>Model</label>
                <select
                  value={formModelId}
                  onChange={(e) => setFormModelId(e.target.value)}
                  required
                >
                  <option value="">Select a model...</option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Schedule</label>
                <select
                  value={formCron}
                  onChange={(e) => setFormCron(e.target.value)}
                >
                  {CRON_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Sample Size</label>
                <input
                  type="number"
                  value={formSampleSize}
                  onChange={(e) => setFormSampleSize(parseInt(e.target.value) || 100)}
                  min={1}
                  max={500}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formSubmitting || !formModelId}
                >
                  {formSubmitting ? 'Creating...' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Run Now Modal */}
      {showRunModal && (
        <div className="modal-overlay" onClick={() => setShowRunModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Run Benchmark</h2>
            <form onSubmit={handleStartRun}>
              <div className="form-group">
                <label>Model</label>
                <select
                  value={runModelId}
                  onChange={(e) => setRunModelId(e.target.value)}
                  required
                >
                  <option value="">Select a model...</option>
                  {models.filter((m) => m.active).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Sample Size</label>
                <input
                  type="number"
                  value={runSampleSize}
                  onChange={(e) => setRunSampleSize(parseInt(e.target.value) || 100)}
                  min={1}
                  max={500}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRunModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={runSubmitting || !runModelId}
                >
                  {runSubmitting ? 'Starting...' : 'Start Run'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

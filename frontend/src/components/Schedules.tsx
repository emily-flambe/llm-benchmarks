import { useState, useEffect, useCallback } from 'react';
import {
  getSchedules,
  getModels,
  createSchedule,
  deleteSchedule,
  toggleSchedulePause,
  startContainerRun,
} from '../api';
import type { ModelSchedule, Model } from '../types';


interface SchedulesProps {
  onRunStarted?: () => void;
}

export default function Schedules({ onRunStarted }: SchedulesProps) {
  const [schedules, setSchedules] = useState<ModelSchedule[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state for creating new schedule
  const [showForm, setShowForm] = useState(false);
  const [formModelId, setFormModelId] = useState('');
  const [formCron, setFormCron] = useState('');
  const [formSampleSize, setFormSampleSize] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Ad-hoc run modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [runModelId, setRunModelId] = useState('');
  const [runSampleSize, setRunSampleSize] = useState('');
  const [runSubmitting, setRunSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [schedulesData, modelsData] = await Promise.all([
        getSchedules(),
        getModels(),
      ]);
      setSchedules(schedulesData.schedules);
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
  }, [loadData]);

  // Get models that don't have schedules yet
  const availableModels = models.filter(
    (m) => m.active && !schedules.some((s) => s.model_id === m.id)
  );

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formModelId || !formCron) return;

    setFormSubmitting(true);
    try {
      await createSchedule({
        model_id: formModelId,
        cron_expression: formCron,
        sample_size: formSampleSize ? parseInt(formSampleSize) : undefined,
      });
      setShowForm(false);
      setFormModelId('');
      setFormCron('');
      setFormSampleSize('');
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
        sample_size: runSampleSize ? parseInt(runSampleSize) : undefined,
      });
      setShowRunModal(false);
      setRunModelId('');
      setRunSampleSize('');
      // Notify parent to switch to Run History tab
      if (onRunStarted) {
        onRunStarted();
      }
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
    <div>
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Benchmark Schedules</h2>
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
          <p style={{ color: 'var(--text-muted)' }}>No schedules configured. Add a schedule to run benchmarks automatically.</p>
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
                  <td>{schedule.model_name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {schedule.cron_expression}
                  </td>
                  <td>{schedule.sample_size ?? 'Full'}</td>
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
                        onClick={() => handleDeleteSchedule(schedule.model_id, schedule.model_name)}
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
                <label>Cron Expression</label>
                <input
                  type="text"
                  value={formCron}
                  onChange={(e) => setFormCron(e.target.value)}
                  placeholder="0 6 * * *"
                  required
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  e.g., "0 6 * * *" for daily at 6am UTC
                </small>
              </div>

              <div className="form-group">
                <label>Sample Size (optional)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formSampleSize}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setFormSampleSize(value);
                  }}
                  placeholder="Leave blank for full benchmark"
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
                  disabled={formSubmitting || !formModelId || !formCron}
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
                <label>Sample Size (optional)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={runSampleSize}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setRunSampleSize(value);
                  }}
                  placeholder="Leave blank for full benchmark"
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

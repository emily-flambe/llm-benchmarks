import { useState, useEffect } from 'react';
import { triggerBenchmark, getAuthStatus, type TriggerBenchmarkParams, type AuthStatus } from '../api';

const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'gpt-4.1', name: 'GPT-4.1' },
  { id: 'o3', name: 'O3' },
];

const SAMPLE_SIZES = [
  { value: '5', label: '5 (Quick test)' },
  { value: '20', label: '20 (Dev)' },
  { value: '100', label: '100 (Standard)' },
  { value: '0', label: 'Full dataset' },
];

export default function AdminPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-opus-4-5-20251101');
  const [sampleSize, setSampleSize] = useState('100');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check auth status when panel opens
  useEffect(() => {
    if (isOpen && authStatus === null) {
      getAuthStatus()
        .then(setAuthStatus)
        .catch(() => setAuthStatus({ authenticated: false, email: null, method: null }));
    }
  }, [isOpen, authStatus]);

  const isAuthenticated = authStatus?.authenticated ?? false;
  const authCheckFailed = authStatus !== null && !isAuthenticated;
  const canTrigger = isAuthenticated || apiKey.trim().length > 0;

  const handleSignIn = () => {
    // Navigate to the login endpoint which triggers Access login
    // After login, it redirects back to the home page
    window.location.href = '/api/auth/login';
  };

  const handleTrigger = async () => {
    if (!canTrigger) {
      setMessage({ type: 'error', text: 'Admin API key is required' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const params: TriggerBenchmarkParams = {
        model,
        sample_size: sampleSize,
      };

      // Pass null for API key if authenticated via Access
      const result = await triggerBenchmark(isAuthenticated ? null : apiKey, params);
      setMessage({ type: 'success', text: result.message });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to trigger benchmark',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="admin-toggle"
        aria-label="Open admin panel"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>Admin Panel</h3>
        <button onClick={() => setIsOpen(false)} className="admin-close" aria-label="Close">
          &times;
        </button>
      </div>

      <div className="admin-panel-content">
        {isAuthenticated ? (
          <div className="admin-auth-status">
            Signed in as <strong>{authStatus?.email}</strong>
          </div>
        ) : (
          <>
            <button onClick={handleSignIn} className="admin-signin-btn">
              Sign in with Google
            </button>
            <div className="admin-divider">
              <span>or use API key</span>
            </div>
            <div className="admin-field">
              <label htmlFor="admin-api-key">Admin API Key</label>
              <input
                id="admin-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your admin API key"
                autoComplete="off"
              />
            </div>
          </>
        )}

        <div className="admin-field">
          <label htmlFor="admin-model">Model</label>
          <select
            id="admin-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-field">
          <label htmlFor="admin-sample">Sample Size</label>
          <select
            id="admin-sample"
            value={sampleSize}
            onChange={(e) => setSampleSize(e.target.value)}
          >
            {SAMPLE_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div className={`admin-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <button
          onClick={handleTrigger}
          disabled={loading || !canTrigger}
          className="admin-trigger-btn"
        >
          {loading ? 'Triggering...' : 'Trigger Benchmark'}
        </button>

        <p className="admin-hint">
          {isAuthenticated
            ? 'Authenticated via Cloudflare Access.'
            : 'Triggers a GitHub Actions workflow. Results appear after the run completes.'}
        </p>
      </div>
    </div>
  );
}

import { deleteRun, listRuns, type RunRow } from '@visionds/auth';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { langById } from '../languages';
import { useAuth } from './AuthProvider';

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A saved-runs list. Each row re-opens on the paste page, prefilled. */
export function HistoryPage() {
  const { configured, loading, user, client } = useAuth();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !user) return;
    listRuns(client)
      .then(setRuns)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, user]);

  if (!configured) {
    return (
      <div className="history-page">
        <p className="history-empty">Accounts aren’t configured on this build.</p>
        <Link to="/app" className="history-back">← Back</Link>
      </div>
    );
  }

  if (!loading && !user) {
    return (
      <div className="history-page">
        <p className="history-empty">
          <Link to="/login">Sign in</Link> to see your saved runs.
        </p>
        <Link to="/app" className="history-back">← Back</Link>
      </div>
    );
  }

  const openRun = (run: RunRow) => {
    navigate('/app', {
      state: {
        loadRun: {
          language: run.language,
          code: run.code,
          cases: run.testcases,
          problem: run.problem ?? undefined,
        },
      },
    });
  };

  const remove = async (id: string) => {
    if (!client) return;
    await deleteRun(client, id);
    setRuns((rs) => rs?.filter((r) => r.id !== id) ?? null);
  };

  return (
    <div className="history-page">
      <header className="history-head">
        <Link to="/" className="history-back">← VisionDS</Link>
        <h1>Run history</h1>
      </header>

      {error && <div className="error-note">{error}</div>}

      {runs && runs.length === 0 && (
        <p className="history-empty">
          No saved runs yet — run some code and it’ll show up here.
        </p>
      )}

      <ul className="history-list">
        {runs?.map((run) => {
          const lang = langById(run.language);
          const pass = run.verdict === 'pass';
          return (
            <li key={run.id} className="history-item">
              <button className="history-open" onClick={() => openRun(run)}>
                <span className="history-title">
                  {run.problem?.title || 'Untitled run'}
                </span>
                <span className="history-meta">
                  <span className="history-lang">{lang.label}</span>
                  {run.verdict && (
                    <span className={`history-verdict ${pass ? 'pass' : 'fail'}`}>
                      {run.verdict}
                    </span>
                  )}
                  <span className="history-time">{when(run.created_at)}</span>
                </span>
              </button>
              <button
                className="history-delete"
                onClick={() => remove(run.id)}
                aria-label="delete run"
                title="Delete"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

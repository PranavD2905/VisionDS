import { GeminiExplainer } from '@visionds/explainer';
import { useState } from 'react';
import { useActiveTrace, useVis } from '../store';

const KEY_STORAGE = 'visionds.geminiKey';

export function ExplainPanel() {
  const trace = useActiveTrace();
  const explanation = useVis((s) => s.explanation);
  const setExplanation = useVis((s) => s.setExplanation);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) ?? '');
  const [editingKey, setEditingKey] = useState(!apiKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trace || trace.steps.length === 0) return null;

  const saveKey = (value: string) => {
    setApiKey(value);
    localStorage.setItem(KEY_STORAGE, value);
  };

  const onExplain = async () => {
    setBusy(true);
    setError(null);
    try {
      const explainer = new GeminiExplainer({ apiKey });
      setExplanation(await explainer.explain(trace));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="explain-panel">
      {editingKey ? (
        <div className="explain-key-row">
          <input
            type="password"
            placeholder="Gemini API key (stays in your browser)"
            value={apiKey}
            onChange={(e) => saveKey(e.target.value)}
          />
          <button disabled={!apiKey} onClick={() => setEditingKey(false)}>
            Save
          </button>
          <span className="hint">
            Free key at aistudio.google.com — stored only in this browser's
            localStorage, sent only to Google.
          </span>
        </div>
      ) : explanation ? (
        <div className="explain-summary">
          <span className="explain-label">AI</span>
          <p>{explanation.summary}</p>
          <button className="explain-clear" onClick={() => setExplanation(null)}>
            clear
          </button>
        </div>
      ) : (
        <div className="explain-key-row">
          <button className="explain-btn" onClick={onExplain} disabled={busy}>
            {busy ? 'Asking Gemini…' : '✨ Explain this run'}
          </button>
          <button className="explain-clear" onClick={() => setEditingKey(true)}>
            change key
          </button>
          {error && <span className="error-note">{error}</span>}
        </div>
      )}
    </div>
  );
}

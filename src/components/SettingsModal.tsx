import React, { useEffect, useRef, useState } from 'react';
import { useModal } from '../lib/useModal';
import { X, Server, Check, RotateCw, AlertCircle, Wifi } from 'lucide-react';
import { ApiError, DEFAULT_API_BASE, getApiBase, getHealth, normalizeApiBase, setApiBase } from '../lib/api';
import type { HealthResponse } from '../types';

type ConnectionState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; health: HealthResponse; latencyMs: number }
  | { status: 'error'; message: string };

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [apiEndpoint, setApiEndpoint] = useState(getApiBase);
  const [connection, setConnection] = useState<ConnectionState>({ status: 'idle' });
  const [baseError, setBaseError] = useState<string | null>(null);
  const checkId = useRef(0);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const testConnection = async (base: string) => {
    const normalized = normalizeApiBase(base);
    if (!normalized) {
      setBaseError('Enter a path like /api or a full http(s) URL such as https://host/api.');
      setConnection({ status: 'idle' });
      return;
    }
    setBaseError(null);
    const id = ++checkId.current;
    setConnection({ status: 'checking' });
    const started = performance.now();
    try {
      const health = await getHealth({ baseUrl: normalized });
      if (id === checkId.current) {
        setConnection({ status: 'ok', health, latencyMs: Math.round(performance.now() - started) });
      }
    } catch (err) {
      if (id === checkId.current) {
        setConnection({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Connection check failed.',
        });
      }
    }
  };

  // Re-check the saved endpoint each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    const saved = getApiBase();
    setApiEndpoint(saved);
    void testConnection(saved);
    return () => {
      checkId.current++;
    };
  }, [isOpen]);

  const panelRef = useModal<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeApiBase(apiEndpoint);
    if (!normalized) {
      setBaseError('Enter a path like /api or a full http(s) URL such as https://host/api.');
      return;
    }
    setBaseError(null);
    setApiBase(normalized);
    setApiEndpoint(normalized);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col outline-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 id="settings-title" className="font-bold text-slate-900 text-sm">System & Backend Configuration</h3>
              <p className="text-[11px] text-slate-500">API connection and processing preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          
          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-blue-900 leading-relaxed text-[11px]">
            <span className="font-bold">Backend:</span> The Express API in <code className="font-mono">server/</code> serves <code className="font-mono">/api</code>. In development Vite proxies it automatically; change the URL below only to point at a separately hosted API.
          </div>

          <div>
            <label htmlFor="api-base-url" className="font-bold text-slate-700 block mb-1">
              Backend API Base URL
            </label>
            <input
              id="api-base-url"
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs"
              placeholder={DEFAULT_API_BASE}
              aria-invalid={baseError ? true : undefined}
            />
            {baseError && <p className="text-[10px] text-red-600 mt-1">{baseError}</p>}
            <p className="text-[10px] text-slate-400 mt-1">Routes: /health, /extract, /summarize, /translate, /questions, /export</p>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div
                id="api-connection-status"
                role="status"
                aria-live="polite"
                className="flex items-center gap-1.5 text-[11px] min-w-0"
              >
                {connection.status === 'checking' && (
                  <>
                    <RotateCw className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
                    <span className="text-slate-500">Checking connection...</span>
                  </>
                )}
                {connection.status === 'ok' && (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-emerald-700 truncate">
                      Connected &middot; v{connection.health.version} &middot; {connection.health.environment} &middot; {connection.latencyMs} ms
                      {connection.health.ai && ` \u00B7 ${connection.health.ai.provider}: ${connection.health.ai.model}`}
                    </span>
                  </>
                )}
                {connection.status === 'error' && (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span className="text-red-700 truncate" title={connection.message}>{connection.message}</span>
                  </>
                )}
              </div>
              <button
                type="button"
                id="api-test-connection-btn"
                onClick={() => void testConnection(apiEndpoint)}
                disabled={connection.status === 'checking'}
                className="shrink-0 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg font-semibold text-slate-700 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Test connection</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="font-bold text-slate-800">How summaries are made</h4>
            <dl className="text-[11px] text-slate-600 space-y-1.5">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-400">Summaries</dt>
                <dd>
                  {connection.status === 'ok' && connection.health.ai ? (
                    <span className="font-mono">{connection.health.ai.model}</span>
                  ) : (
                    'An open-weights language model'
                  )}{' '}
                  through Groq. The text of your document is sent to Groq to write the summary.
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-400">Scanned PDFs</dt>
                <dd>
                  {connection.status === 'ok' && connection.health.ai ? (
                    <span className="font-mono">{connection.health.ai.ocrModel}</span>
                  ) : (
                    'A vision model'
                  )}{' '}
                  reads pages that have no text layer. Check its output for recognition errors.
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-400">Extractive mode</dt>
                <dd>Picks the most important sentences with TextRank and quotes them from your document. The model only labels them.</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-400">Languages</dt>
                <dd>Summaries and translations in English and Kiswahili. Choose the language when you create a summary.</dd>
              </div>
            </dl>
            <p className="text-[10px] text-slate-400">The model is chosen by the administrator (server settings), not per user.</p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1E2333] hover:bg-[#2A3147] text-white font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Saved</span>
                </>
              ) : (
                <span>Save</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

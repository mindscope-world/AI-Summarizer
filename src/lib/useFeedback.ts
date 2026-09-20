import {useCallback, useEffect, useState} from 'react';
import type {FeedbackEntry, FeedbackInput} from '../types';
import type {FeedbackRepository} from './feedback';

export interface FeedbackState {
  entries: FeedbackEntry[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** The rating given for one summary, if any. */
  forDocument: (documentId: string) => FeedbackEntry | null;
  /** Saves (or replaces) a rating and keeps the local list in step. */
  submit: (input: FeedbackInput) => Promise<FeedbackEntry>;
  reload: () => Promise<void>;
}

/** The signed-in student's own ratings. Loaded once per account; a rating is written when they submit it. */
export function useFeedback(repo: FeedbackRepository | null): FeedbackState {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [status, setStatus] = useState<FeedbackState['status']>('idle');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!repo) return;
    setStatus('loading');
    setError(null);
    try {
      setEntries(await repo.mine());
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your ratings.');
      setStatus('error');
    }
  }, [repo]);

  useEffect(() => {
    if (!repo) {
      setEntries([]);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    repo.mine().then(
      (list) => {
        if (cancelled) return;
        setEntries(list);
        setStatus('ready');
      },
      (err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your ratings.');
        setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const submit = useCallback(
    async (input: FeedbackInput) => {
      if (!repo) throw new Error('Sign in to rate a summary.');
      const saved = await repo.submit(input);
      setEntries((prev) => [saved, ...prev.filter((e) => e.id !== saved.id && e.documentId !== saved.documentId)]);
      return saved;
    },
    [repo],
  );

  const forDocument = useCallback((documentId: string) => entries.find((e) => e.documentId === documentId) ?? null, [entries]);

  return {entries, status, error, forDocument, submit, reload};
}

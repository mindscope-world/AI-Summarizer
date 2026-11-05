import {useCallback, useEffect, useRef, useState} from 'react';
import type {DocumentSummary} from '../types';
import type {DocumentRepository} from './repository';

export type DocumentsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Edits are saved this long after the last keystroke (notes are typed, so not every key hits the database). */
export const SAVE_DEBOUNCE_MS = 800;

export interface UseDocuments {
  status: DocumentsStatus;
  /** Why loading failed (when status is "error"). */
  loadError: string | null;
  documents: DocumentSummary[];
  /** The last problem saving; cleared by the next successful save or `dismissSaveError`. */
  saveError: string | null;
  dismissSaveError(): void;
  reload(): Promise<void>;
  /** Stores a new summary. It stays visible even if saving fails, and is retried with the next edit or `retrySave`. */
  add(doc: DocumentSummary, options?: {originalFile?: File | null}): Promise<{warnings: string[]}>;
  /** Applies an edit immediately and saves it shortly after. */
  update(doc: DocumentSummary): void;
  remove(id: string): Promise<boolean>;
  /** Fetches the (large) source text of a document the first time it is opened. */
  loadSource(id: string): Promise<void>;
  /** Saves everything that is waiting or previously failed, now. */
  retrySave(): Promise<void>;
}

const describe = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong while saving.');

/**
 * A signed-in user's documents. Pass the repository for the current user (or null when signed
 * out: the list is then empty). Changes show up instantly and are written in the background.
 */
export function useDocuments(repo: DocumentRepository | null): UseDocuments {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [status, setStatus] = useState<DocumentsStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const docsRef = useRef<DocumentSummary[]>([]);
  const repoRef = useRef<DocumentRepository | null>(repo);
  /** Ids waiting for their debounced save. */
  const dirty = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Ids the database does not have yet (creation failed), so the next save creates rather than updates. */
  const unsaved = useRef(new Set<string>());
  /** One save at a time per document, in order. */
  const chains = useRef(new Map<string, Promise<void>>());
  const sourceRequested = useRef(new Set<string>());

  const commit = useCallback((next: DocumentSummary[]) => {
    docsRef.current = next;
    setDocuments(next);
  }, []);

  const flush = useCallback(async (id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    const run = async () => {
      const r = repoRef.current;
      const doc = docsRef.current.find((d) => d.id === id);
      if (!r || !doc) return dirty.current.delete(id);
      dirty.current.delete(id);
      try {
        if (unsaved.current.has(id)) {
          await r.create(doc);
          unsaved.current.delete(id);
        } else {
          await r.save(doc);
        }
        if (!dirty.current.size && !unsaved.current.size) setSaveError(null);
      } catch (err) {
        dirty.current.add(id); // keep it, so retry knows
        setSaveError(describe(err));
      }
    };
    const chained = (chains.current.get(id) ?? Promise.resolve()).then(run);
    chains.current.set(id, chained);
    return chained;
  }, []);

  const flushAll = useCallback(async () => {
    const ids = new Set([...dirty.current, ...unsaved.current]);
    await Promise.all([...ids].map((id) => flush(id)));
  }, [flush]);

  // Load (and reload) whenever the signed-in user changes.
  const load = useCallback(async () => {
    const r = repoRef.current;
    if (!r) return;
    setStatus('loading');
    setLoadError(null);
    try {
      const list = await r.list();
      if (repoRef.current !== r) return; // signed out or switched user meanwhile
      // Keep summaries that exist only in this session (their save failed) so they are not lost.
      const pending = docsRef.current.filter((d) => unsaved.current.has(d.id) && !list.some((x) => x.id === d.id));
      commit([...pending, ...list]);
      setStatus('ready');
    } catch (err) {
      if (repoRef.current !== r) return;
      setLoadError(describe(err));
      setStatus('error');
    }
  }, [commit]);

  useEffect(() => {
    repoRef.current = repo;
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    dirty.current.clear();
    unsaved.current.clear();
    chains.current.clear();
    sourceRequested.current.clear();
    commit([]);
    setSaveError(null);
    if (!repo) {
      setStatus('idle');
      setLoadError(null);
      return;
    }
    void load();
  }, [repo, load, commit]);

  // Don't lose the last edits when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushAll();
    };
    const onPageHide = () => void flushAll();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void flushAll();
    };
  }, [flushAll]);

  const update = useCallback(
    (doc: DocumentSummary) => {
      commit(docsRef.current.map((d) => (d.id === doc.id ? doc : d)));
      dirty.current.add(doc.id);
      const existing = timers.current.get(doc.id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        doc.id,
        setTimeout(() => void flush(doc.id), SAVE_DEBOUNCE_MS),
      );
    },
    [commit, flush],
  );

  const add = useCallback<UseDocuments['add']>(
    async (doc, options) => {
      const r = repoRef.current;
      commit([doc, ...docsRef.current.filter((d) => d.id !== doc.id)]);
      if (!r) return {warnings: []};
      try {
        const result = await r.create(doc, options);
        return result;
      } catch (err) {
        unsaved.current.add(doc.id);
        setSaveError(`${describe(err)} Your summary is still open, and will be saved again with your next change or when you retry.`);
        return {warnings: []};
      }
    },
    [commit],
  );

  const remove = useCallback<UseDocuments['remove']>(
    async (id) => {
      const r = repoRef.current;
      const before = docsRef.current;
      const removed = before.find((d) => d.id === id);
      if (!removed) return false;
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      dirty.current.delete(id);
      commit(before.filter((d) => d.id !== id));
      if (!r || unsaved.current.delete(id)) return true; // never reached the database
      try {
        await r.remove(id);
        return true;
      } catch (err) {
        commit(before); // it is still in the database, so put it back
        setSaveError(describe(err));
        return false;
      }
    },
    [commit],
  );

  const loadSource = useCallback<UseDocuments['loadSource']>(
    async (id) => {
      const r = repoRef.current;
      const doc = docsRef.current.find((d) => d.id === id);
      if (!r || !doc || doc.sourceText !== undefined || sourceRequested.current.has(id) || unsaved.current.has(id)) return;
      sourceRequested.current.add(id);
      try {
        const text = await r.loadSourceText(id);
        // Not an edit: put it in place without scheduling a save.
        commit(docsRef.current.map((d) => (d.id === id ? {...d, sourceText: text ?? ''} : d)));
      } catch {
        sourceRequested.current.delete(id); // try again next time it is opened
      }
    },
    [commit],
  );

  return {
    status,
    loadError,
    documents,
    saveError,
    dismissSaveError: useCallback(() => setSaveError(null), []),
    reload: load,
    add,
    update,
    remove,
    loadSource,
    retrySave: flushAll,
  };
}

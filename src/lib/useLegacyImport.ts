import {useCallback, useEffect, useState} from 'react';
import {LEGACY_DEMO_IDS} from '../data/legacyDemoIds';
import type {DocumentSummary} from '../types';
import {LEGACY_STORAGE_KEY, readLegacyDocuments, upgradeLegacy, type DocumentRepository} from './repository';

const DEMO_IDS: ReadonlySet<string> = new Set(LEGACY_DEMO_IDS);
const dismissedKey = (userId: string) => `leaderforge_legacy_import_dismissed:${userId}`;

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback; // storage unavailable (private mode, blocked)
  }
};

export interface LegacyImport {
  /** How many summaries saved in this browser (before accounts existed) can be added to the account. */
  count: number;
  importing: boolean;
  error: string | null;
  /** Adds them to the signed-in account. Resolves with how many were imported. */
  run(): Promise<number>;
  /** Stops offering for this account (the local copies stay untouched). */
  dismiss(): void;
}

/**
 * Old versions kept summaries only in this browser. The first time someone signs in here, offer
 * to add them to their account. It is an offer, not automatic: on a shared computer the previous
 * person's summaries must not end up in the next person's account. The demo documents that old
 * versions shipped with are never offered.
 */
export function useLegacyImport(repo: DocumentRepository | null, userId: string | null, onImported: () => void): LegacyImport {
  const [candidates, setCandidates] = useState<DocumentSummary[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyed on "is there a repository", not its identity, so a new-but-equivalent object cannot re-trigger it.
  const signedIn = repo !== null;
  useEffect(() => {
    if (!signedIn || !userId || safe(() => localStorage.getItem(dismissedKey(userId)), 'x')) {
      setCandidates([]);
      return;
    }
    setCandidates(safe(() => readLegacyDocuments(DEMO_IDS), []));
  }, [signedIn, userId]);

  const run = useCallback(async () => {
    if (!repo) return 0;
    setImporting(true);
    setError(null);
    let done = 0;
    const failed: DocumentSummary[] = [];
    for (const legacy of candidates) {
      try {
        await repo.create(upgradeLegacy(legacy));
        done++;
      } catch {
        failed.push(legacy);
      }
    }
    setImporting(false);
    if (failed.length === 0) {
      // Everything is in the account now; remove the local copies so nobody else is offered them.
      safe(() => localStorage.removeItem(LEGACY_STORAGE_KEY), undefined);
      setCandidates([]);
    } else {
      setCandidates(failed);
      setError(`${failed.length} of ${candidates.length} summaries could not be imported. You can try again.`);
    }
    if (done) onImported();
    return done;
  }, [repo, candidates, onImported]);

  const dismiss = useCallback(() => {
    if (userId) safe(() => localStorage.setItem(dismissedKey(userId), '1'), undefined);
    setCandidates([]);
  }, [userId]);

  return {count: candidates.length, importing, error, run, dismiss};
}

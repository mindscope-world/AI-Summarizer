// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {LEGACY_DEMO_IDS} from '../data/legacyDemoIds';
import type {DocumentSummary} from '../types';
import {LEGACY_STORAGE_KEY, type DocumentRepository} from './repository';
import {useLegacyImport} from './useLegacyImport';

const base: DocumentSummary = {
  id: 'base',
  title: 'Base',
  dateBadge: 'Today',
  timeAgoGroup: 'Last 7 days',
  category: 'Computer Science',
  categoryColor: 'blue',
  tags: [],
  excerpt: '',
  createdDate: 'March 05, 2026 09:30 AM',
  emotionalTone: 'Reflective',
  contentParagraphs: ['A paragraph.'],
  bulletPoints: [{title: 'Point.', text: 'Detail.'}],
  discussionQuestions: [{id: 'q1', question: 'Why?', context: ''}],
  currentDiscussionIndex: 0,
  userNotes: '',
  comments: [],
};

const demoDocs = LEGACY_DEMO_IDS.map((id) => ({...base, id, title: `Demo ${id}`}));

const mine = (id: string): DocumentSummary => ({
  ...base,
  id,
  title: `My summary ${id}`,
  createdDate: 'March 05, 2026 09:30 AM',
});

const repoWith = (create = vi.fn(async (_doc: DocumentSummary) => ({warnings: [] as string[]}))) =>
  ({create, list: vi.fn(), save: vi.fn(), remove: vi.fn(), loadSourceText: vi.fn()}) as unknown as DocumentRepository & {create: typeof create};

const stash = (docs: DocumentSummary[]) => localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(docs));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('useLegacyImport', () => {
  it('offers only the summaries the person made, never the demo documents old versions shipped with', () => {
    stash([...demoDocs, mine('doc-1712345678901')]);
    const repo = repoWith();
    const {result} = renderHook(() => useLegacyImport(repo, 'u1', vi.fn()));
    expect(result.current.count).toBe(1);
  });

  it('offers nothing when signed out, or when there is nothing saved', () => {
    stash([mine('doc-1712345678001')]);
    expect(renderHook(() => useLegacyImport(null, null, vi.fn())).result.current.count).toBe(0);
    localStorage.clear();
    expect(renderHook(() => useLegacyImport(repoWith(), 'u1', vi.fn())).result.current.count).toBe(0);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, '{not json');
    expect(renderHook(() => useLegacyImport(repoWith(), 'u1', vi.fn())).result.current.count).toBe(0);
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({not: 'a list'}));
    expect(renderHook(() => useLegacyImport(repoWith(), 'u1', vi.fn())).result.current.count).toBe(0);
  });

  it('imports into the account with proper ids, removes the local copies, and refreshes the list', async () => {
    stash([mine('doc-1712345678001'), mine('doc-1712345678002')]);
    const repo = repoWith();
    const onImported = vi.fn();
    const {result} = renderHook(() => useLegacyImport(repo, 'u1', onImported));

    let n = 0;
    await act(async () => void (n = await result.current.run()));
    expect(n).toBe(2);
    const ids = repo.create.mock.calls.map(([d]) => (d as DocumentSummary).id);
    expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(result.current.count).toBe(0);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('keeps the local copies and offers again if some could not be imported', async () => {
    stash([mine('doc-1712345678001'), mine('doc-1712345678002')]);
    const create = vi.fn().mockResolvedValueOnce({warnings: []}).mockRejectedValueOnce(new Error('offline'));
    const {result} = renderHook(() => useLegacyImport(repoWith(create), 'u1', vi.fn()));
    await act(async () => void (await result.current.run()));
    expect(result.current.count).toBe(1);
    expect(result.current.error).toMatch(/1 of 2/);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it('remembers "not now" for that account only, and leaves the local copies alone', async () => {
    stash([mine('doc-1712345678001')]);
    const {result} = renderHook(() => useLegacyImport(repoWith(), 'u1', vi.fn()));
    act(() => result.current.dismiss());
    expect(result.current.count).toBe(0);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();

    expect(renderHook(() => useLegacyImport(repoWith(), 'u1', vi.fn())).result.current.count).toBe(0);
    // A different person signing in on this computer is still asked (they can decline too).
    expect(renderHook(() => useLegacyImport(repoWith(), 'u2', vi.fn())).result.current.count).toBe(1);
  });
});

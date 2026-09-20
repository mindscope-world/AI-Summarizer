// @vitest-environment jsdom
import {act, cleanup, renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {DocumentSummary} from '../types';
import type {DocumentRepository} from './repository';
import {SAVE_DEBOUNCE_MS, useDocuments} from './useDocuments';

const doc = (id: string, over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id,
  title: `Doc ${id}`,
  dateBadge: 'Today',
  timeAgoGroup: 'Last 7 days',
  category: 'CS',
  categoryColor: 'blue',
  tags: [],
  excerpt: '',
  createdDate: '',
  emotionalTone: '',
  contentParagraphs: ['p'],
  bulletPoints: [],
  discussionQuestions: [],
  currentDiscussionIndex: 0,
  userNotes: '',
  comments: [],
  ...over,
});

function fakeRepo(initial: DocumentSummary[] = []) {
  const repo = {
    list: vi.fn(async () => initial),
    create: vi.fn(async (_doc: DocumentSummary, _options?: {originalFile?: File | null}) => ({warnings: [] as string[]})),
    save: vi.fn(async (_doc: DocumentSummary) => undefined),
    remove: vi.fn(async (_id: string) => undefined),
    loadSourceText: vi.fn(async (_id: string): Promise<string | null> => 'the full source'),
  };
  return repo satisfies DocumentRepository;
}

beforeEach(() => vi.useFakeTimers({shouldAdvanceTime: true}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ready = (r: {current: ReturnType<typeof useDocuments>}) => waitFor(() => expect(r.current.status).toBe('ready'));
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('loading', () => {
  it('is empty and idle while signed out', () => {
    const {result} = renderHook(() => useDocuments(null));
    expect(result.current).toMatchObject({status: 'idle', documents: []});
  });

  it('loads the signed-in user’s documents', async () => {
    const repo = fakeRepo([doc('a'), doc('b')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    expect(result.current.documents.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('reports a load failure and can try again', async () => {
    const repo = fakeRepo([doc('a')]);
    repo.list.mockRejectedValueOnce(new Error('Could not load your summaries: offline'));
    const {result} = renderHook(() => useDocuments(repo));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.loadError).toMatch(/offline/);
    await act(() => result.current.reload());
    expect(result.current.status).toBe('ready');
    expect(result.current.documents).toHaveLength(1);
  });

  it('clears everything when the user signs out, and loads the next user’s own list', async () => {
    const alice = fakeRepo([doc('alice-doc')]);
    const bob = fakeRepo([doc('bob-doc')]);
    const {result, rerender} = renderHook(({repo}) => useDocuments(repo), {initialProps: {repo: alice as DocumentRepository | null}});
    await ready(result);
    rerender({repo: null});
    await waitFor(() => expect(result.current.documents).toEqual([]));
    expect(result.current.status).toBe('idle');
    rerender({repo: bob});
    await waitFor(() => expect(result.current.documents.map((d) => d.id)).toEqual(['bob-doc']));
  });

  it('does not show the previous user’s documents if their load finishes late', async () => {
    let release!: (docs: DocumentSummary[]) => void;
    const slow = fakeRepo();
    slow.list.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const {result, rerender} = renderHook(({repo}) => useDocuments(repo), {initialProps: {repo: slow as DocumentRepository | null}});
    rerender({repo: null});
    await act(async () => release([doc('alice-doc')]));
    expect(result.current.documents).toEqual([]);
  });
});

describe('editing', () => {
  it('shows an edit at once but saves it only after typing pauses, once', async () => {
    const repo = fakeRepo([doc('a')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);

    for (const notes of ['h', 'he', 'hello']) {
      act(() => result.current.update({...result.current.documents[0], userNotes: notes}));
      await advance(SAVE_DEBOUNCE_MS / 4);
    }
    expect(result.current.documents[0].userNotes).toBe('hello');
    expect(repo.save).not.toHaveBeenCalled();

    await advance(SAVE_DEBOUNCE_MS);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({id: 'a', userNotes: 'hello'}));
  });

  it('saves different documents independently', async () => {
    const repo = fakeRepo([doc('a'), doc('b')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    act(() => result.current.update({...result.current.documents[0], userNotes: 'x'}));
    act(() => result.current.update({...result.current.documents[1], userNotes: 'y'}));
    await advance(SAVE_DEBOUNCE_MS + 50);
    expect(repo.save.mock.calls.map(([d]) => d.id).sort()).toEqual(['a', 'b']);
  });

  it('shows a failed save, keeps the edit on screen, and retries it', async () => {
    const repo = fakeRepo([doc('a')]);
    repo.save.mockRejectedValueOnce(new Error('Could not save your changes: offline'));
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    act(() => result.current.update({...result.current.documents[0], userNotes: 'keep me'}));
    await advance(SAVE_DEBOUNCE_MS + 50);
    expect(result.current.saveError).toMatch(/offline/);
    expect(result.current.documents[0].userNotes).toBe('keep me');

    await act(() => result.current.retrySave());
    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(result.current.saveError).toBeNull();
  });

  it('flushes pending edits when the tab is hidden', async () => {
    const repo = fakeRepo([doc('a')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    act(() => result.current.update({...result.current.documents[0], userNotes: 'unsaved'}));
    Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true});
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(repo.save).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true});
  });
});

describe('adding', () => {
  it('shows a new summary first in the list and stores it (with the original file)', async () => {
    const repo = fakeRepo([doc('old')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    const file = new File(['x'], 'a.pdf');
    await act(() => result.current.add(doc('new'), {originalFile: file}));
    expect(result.current.documents.map((d) => d.id)).toEqual(['new', 'old']);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({id: 'new'}), {originalFile: file});
  });

  it('passes on warnings from the repository', async () => {
    const repo = fakeRepo();
    repo.create.mockResolvedValueOnce({warnings: ['The original file could not be kept.']});
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    let out!: {warnings: string[]};
    await act(async () => void (out = await result.current.add(doc('n'))));
    expect(out.warnings).toEqual(['The original file could not be kept.']);
  });

  it('does not lose a summary whose save failed: it stays open and is created again on retry', async () => {
    const repo = fakeRepo();
    repo.create.mockRejectedValueOnce(new Error('Could not save the summary: offline'));
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    await act(() => result.current.add(doc('n', {sourceText: 'src'})));
    expect(result.current.documents.map((d) => d.id)).toEqual(['n']);
    expect(result.current.saveError).toMatch(/offline.*still open/s);

    await act(() => result.current.retrySave());
    expect(repo.create).toHaveBeenCalledTimes(2);
    expect(repo.save).not.toHaveBeenCalled(); // created, not updated
    expect(result.current.saveError).toBeNull();
  });

  it('keeps an unsaved summary across a reload', async () => {
    const repo = fakeRepo([doc('old')]);
    repo.create.mockRejectedValueOnce(new Error('offline'));
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    await act(() => result.current.add(doc('n')));
    await act(() => result.current.reload());
    expect(result.current.documents.map((d) => d.id)).toEqual(['n', 'old']);
  });
});

describe('deleting', () => {
  it('removes at once and deletes from the database', async () => {
    const repo = fakeRepo([doc('a'), doc('b')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    let ok!: boolean;
    await act(async () => void (ok = await result.current.remove('a')));
    expect(ok).toBe(true);
    expect(result.current.documents.map((d) => d.id)).toEqual(['b']);
    expect(repo.remove).toHaveBeenCalledWith('a');
  });

  it('lets the last document be deleted', async () => {
    const repo = fakeRepo([doc('a')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    await act(() => result.current.remove('a'));
    expect(result.current.documents).toEqual([]);
  });

  it('puts the document back and says so if the delete fails', async () => {
    const repo = fakeRepo([doc('a')]);
    repo.remove.mockRejectedValueOnce(new Error('Could not delete the summary: offline'));
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    let ok!: boolean;
    await act(async () => void (ok = await result.current.remove('a')));
    expect(ok).toBe(false);
    expect(result.current.documents.map((d) => d.id)).toEqual(['a']);
    expect(result.current.saveError).toMatch(/offline/);
  });

  it('cancels a pending edit of a document that is being deleted', async () => {
    const repo = fakeRepo([doc('a')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    act(() => result.current.update({...result.current.documents[0], userNotes: 'x'}));
    await act(() => result.current.remove('a'));
    await advance(SAVE_DEBOUNCE_MS * 2);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not call the database for a summary that never reached it', async () => {
    const repo = fakeRepo();
    repo.create.mockRejectedValueOnce(new Error('offline'));
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    await act(() => result.current.add(doc('n')));
    await act(() => result.current.remove('n'));
    expect(repo.remove).not.toHaveBeenCalled();
    expect(result.current.documents).toEqual([]);
  });
});

describe('source text', () => {
  it('is fetched once, on demand, and is not treated as an edit', async () => {
    const repo = fakeRepo([doc('a')]);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    expect(result.current.documents[0].sourceText).toBeUndefined();

    await act(() => result.current.loadSource('a'));
    await act(() => result.current.loadSource('a'));
    expect(repo.loadSourceText).toHaveBeenCalledTimes(1);
    expect(result.current.documents[0].sourceText).toBe('the full source');
    await advance(SAVE_DEBOUNCE_MS * 2);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('marks a missing source as empty rather than asking again and again', async () => {
    const repo = fakeRepo([doc('a')]);
    repo.loadSourceText.mockResolvedValueOnce(null);
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    await act(() => result.current.loadSource('a'));
    expect(result.current.documents[0].sourceText).toBe('');
  });

  it('tries again next time if fetching failed', async () => {
    const repo = fakeRepo([doc('a')]);
    repo.loadSourceText.mockRejectedValueOnce(new Error('offline'));
    const {result} = renderHook(() => useDocuments(repo));
    await ready(result);
    await act(() => result.current.loadSource('a'));
    expect(result.current.documents[0].sourceText).toBeUndefined();
    await act(() => result.current.loadSource('a'));
    expect(result.current.documents[0].sourceText).toBe('the full source');
  });
});

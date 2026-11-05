// @vitest-environment jsdom
import {useState} from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {DocumentSummary, TranslateResponse} from '../types';
import * as api from '../lib/api';
import {MainEditorView} from './MainEditorView';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {...actual, translateSummary: vi.fn()};
});
vi.mock('../lib/useAuthUser', () => ({useAuthUser: () => null}));
const translateSummary = vi.mocked(api.translateSummary);

const doc = (id: string, over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id,
  title: `Doc ${id}`,
  dateBadge: 'Today',
  timeAgoGroup: 'Last 7 days',
  category: 'Computer Science',
  categoryColor: 'blue',
  tags: [],
  excerpt: '',
  createdDate: 'September 20, 2026 05:41 PM',
  emotionalTone: 'Analytical & Rigorous',
  promptQuestion: 'How do quorums help?',
  contentParagraphs: ['Nodes agree on one value.'],
  bulletPoints: [{title: 'Quorums', text: 'A majority vote keeps replicas consistent.'}],
  discussionQuestions: [{id: 'q1', question: 'Why a majority?', context: 'Partitions.'}],
  currentDiscussionIndex: 0,
  userNotes: '',
  comments: [],
  sourceText: 'source',
  sourceMetadata: {language: 'English', modelUsed: 'gpt'},
  ...over,
});

const SWAHILI: TranslateResponse = {
  language: 'Swahili',
  model: 'gpt-sw',
  warnings: [],
  contentParagraphs: ['Nodi zinakubaliana kuhusu thamani moja.'],
  bulletPoints: [{title: 'Akidi', text: 'Kura ya walio wengi huweka nakala sawa.'}],
  discussionQuestions: [{question: 'Kwa nini wingi?', context: 'Migawanyiko.'}],
  promptQuestion: 'Akidi husaidiaje?',
};

/** Holds the document like the app does, so an update re-renders the editor. */
function Harness({initial, onExport = vi.fn(), onSave = vi.fn()}: {initial: DocumentSummary[]; onExport?: (f: string, l: string) => void; onSave?: (d: DocumentSummary) => void}) {
  const [docs, setDocs] = useState(initial);
  const [id, setId] = useState(initial[0].id);
  const current = docs.find((d) => d.id === id)!;
  return (
    <>
      {docs.map((d) => (
        <button key={d.id} onClick={() => setId(d.id)}>
          open {d.id}
        </button>
      ))}
      <MainEditorView
        document={current}
        onUpdateDocument={(u) => {
          onSave(u);
          setDocs((all) => all.map((d) => (d.id === u.id ? u : d)));
        }}
        onToggleComments={() => undefined}
        isCommentsOpen={false}
        onExport={onExport as never}
      />
    </>
  );
}

beforeEach(() => {
  translateSummary.mockReset();
  window.HTMLElement.prototype.scrollTo = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const text = () => document.body.textContent ?? '';

describe('translating a summary in the editor', () => {
  it('translates, saves the translation with the document, and shows it', async () => {
    translateSummary.mockResolvedValue(SWAHILI);
    const onSave = vi.fn();
    render(<Harness initial={[doc('a')]} onSave={onSave} />);
    expect(text()).toContain('Nodes agree on one value.');

    await userEvent.click(screen.getByRole('button', {name: 'Translate to Swahili'}));
    expect(translateSummary.mock.calls[0][0]).toMatchObject({
      targetLanguage: 'Swahili',
      sourceLanguage: 'English',
      contentParagraphs: ['Nodes agree on one value.'],
      promptQuestion: 'How do quorums help?',
    });

    await waitFor(() => expect(text()).toContain('Nodi zinakubaliana kuhusu thamani moja.'));
    expect(text()).not.toContain('Nodes agree on one value.');
    expect(text()).toContain('Akidi');
    expect(text()).toContain('Akidi husaidiaje?');
    expect(text()).toContain('Translated by gpt-sw');

    const saved = onSave.mock.calls.at(-1)![0] as DocumentSummary;
    expect(saved.translations?.Swahili).toMatchObject({contentParagraphs: SWAHILI.contentParagraphs, model: 'gpt-sw'});
    expect(saved.contentParagraphs).toEqual(['Nodes agree on one value.']); // the original is untouched

    // Back to the original, and to the translation again, with no second request.
    await userEvent.click(screen.getByRole('button', {name: /^English/}));
    expect(text()).toContain('Nodes agree on one value.');
    await userEvent.click(screen.getByRole('button', {name: 'Swahili'}));
    expect(text()).toContain('Nodi zinakubaliana');
    expect(translateSummary).toHaveBeenCalledTimes(1);
  });

  it('exports the language that is showing', async () => {
    translateSummary.mockResolvedValue(SWAHILI);
    const onExport = vi.fn();
    render(<Harness initial={[doc('a')]} onExport={onExport} />);

    await userEvent.click(document.getElementById('editor-more-options-btn')!);
    await userEvent.click(screen.getByText('Download as PDF'));
    expect(onExport).toHaveBeenLastCalledWith('pdf', 'English');

    await userEvent.click(screen.getByRole('button', {name: 'Translate to Swahili'}));
    await waitFor(() => expect(text()).toContain('Nodi zinakubaliana'));
    await userEvent.click(document.getElementById('editor-more-options-btn')!);
    await userEvent.click(screen.getByText('Markdown (.md)'));
    expect(onExport).toHaveBeenLastCalledWith('md', 'Swahili');
  });

  it('shows the error and offers to try again when translating fails', async () => {
    translateSummary.mockRejectedValueOnce(new api.ApiError('Translation failed: the AI service is busy.', 502, 'upstream_error'));
    render(<Harness initial={[doc('a')]} />);
    await userEvent.click(screen.getByRole('button', {name: 'Translate to Swahili'}));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Translation failed: the AI service is busy.'));
    expect(text()).toContain('Nodes agree on one value.');

    translateSummary.mockResolvedValueOnce(SWAHILI);
    await userEvent.click(screen.getByRole('button', {name: 'Translate to Swahili'}));
    await waitFor(() => expect(text()).toContain('Nodi zinakubaliana'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can be cancelled, and then nothing is saved', async () => {
    let signal: AbortSignal | undefined;
    translateSummary.mockImplementation((_input, opts) => {
      signal = opts?.signal;
      return new Promise(() => undefined); // never answers
    });
    const onSave = vi.fn();
    render(<Harness initial={[doc('a')]} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', {name: 'Translate to Swahili'}));
    expect(screen.getByRole('status').textContent).toContain('Translating to Swahili');

    await userEvent.click(screen.getByRole('button', {name: /Cancel/}));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'Translate to Swahili'})).toBeTruthy();
  });

  it('abandons a translation when another document is opened, and starts that one in its own language', async () => {
    let signal: AbortSignal | undefined;
    translateSummary.mockImplementation((_i, opts) => {
      signal = opts?.signal;
      return new Promise(() => undefined);
    });
    render(<Harness initial={[doc('a'), doc('b', {contentParagraphs: ['Second doc text.']})]} />);
    await userEvent.click(screen.getByRole('button', {name: 'Translate to Swahili'}));
    await userEvent.click(screen.getByRole('button', {name: 'open b'}));
    expect(signal?.aborted).toBe(true);
    expect(text()).toContain('Second doc text.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps review ticks when switching language', async () => {
    const reviewed = doc('a', {bulletPoints: [{title: 'Quorums', text: 'A majority vote keeps replicas consistent.', reviewed: true}], translations: {Swahili: {...SWAHILI}}});
    render(<Harness initial={[reviewed]} />);
    await userEvent.click(screen.getByRole('button', {name: 'Swahili'}));
    expect(screen.getAllByTitle('Mark point as unreviewed')).toHaveLength(1);
  });

  it('offers English for a summary that was written in Swahili', () => {
    render(<Harness initial={[doc('a', {sourceMetadata: {language: 'Swahili'}})]} />);
    expect(screen.getByRole('button', {name: 'Translate to English'})).toBeTruthy();
    expect(screen.queryByRole('button', {name: 'Translate to Swahili'})).toBeNull();
  });
});

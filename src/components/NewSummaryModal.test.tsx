// @vitest-environment jsdom
import { StrictMode, type ComponentProps } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary, ExtractionResult, SummaryResult } from '../types';
import { NewSummaryModal } from './NewSummaryModal';
import * as api from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, extractDocument: vi.fn(), summarizeDocument: vi.fn() };
});
vi.mock('../lib/useAuthUser', () => ({
  useAuthUser: () => ({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'test@example.edu',
    fullName: 'Test Student',
    avatarUrl: '',
    institution: 'Test University',
    role: 'student',
    createdAt: '2026-01-01T00:00:00Z',
  }),
}));
const extractDocument = vi.mocked(api.extractDocument);
const summarizeDocument = vi.mocked(api.summarizeDocument);

const makeSummary = (over: Partial<SummaryResult> = {}): SummaryResult => ({
  title: 'Consensus Protocols',
  contentParagraphs: ['Nodes agree on one value using quorums.', 'Raft elects a leader to order the log.'],
  bulletPoints: [
    { title: 'Quorums.', text: 'A majority vote keeps replicas consistent.' },
    { title: 'Leaders.', text: 'One leader orders all writes.' },
  ],
  discussionQuestions: [{ question: 'Why a majority?', context: 'Think about partitions.' }],
  promptQuestion: 'How do quorums keep replicas consistent?',
  emotionalTone: 'Analytical & Rigorous',
  tags: ['Consensus', 'Raft'],
  excerpt: 'Nodes agree on one value using quorums.',
  metadata: {
    model: 'qwen/qwen3.8-27b',
    mode: 'abstractive',
    length: 'balanced',
    language: 'English',
    originalWordCount: 1234,
    summaryWordCount: 61,
    reductionRate: '95%',
    sections: 1,
    processingSeconds: 3.2,
    examplesUsed: 0,
  },
  warnings: [],
  ...over,
});

const makeResult = (over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  text: 'Consensus protocols let nodes agree. Paxos and Raft use quorums.',
  wordCount: 1234,
  charCount: 60,
  source: { kind: 'file', format: 'pdf', fileName: 'Lecture_Notes-4.pdf', pageCount: 12, ocrUsed: false },
  language: { code: 'en', iso3: 'eng', name: 'English', confidence: 0.98, mixed: false },
  stats: { paragraphs: 3, sentences: 42, chunks: 1 },
  chunks: [{ index: 0, start: 0, end: 60, tokenEstimate: 15 }],
  warnings: [],
  ...over,
});

const setup = (props: Partial<ComponentProps<typeof NewSummaryModal>> = {}) => {
  const onCreated = vi.fn<(doc: DocumentSummary, options?: { originalFile?: File | null }) => void>();
  const onClose = vi.fn();
  // applyAccept:false so the component's own validation is what we exercise
  const user = userEvent.setup({ applyAccept: false, advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const utils = render(<NewSummaryModal isOpen onClose={onClose} onCreated={onCreated} {...props} />);
  const fileInput = () => utils.container.querySelector<HTMLInputElement>('#document-file-input')!;
  const startButton = () => screen.getByRole('button', { name: /start ai summarization/i });
  /** The extraction result card (the file name also shows in the dropzone, so query the card itself). */
  const findCard = () => waitFor(() => {
    const card = utils.container.querySelector<HTMLElement>('#extraction-summary');
    if (!card) throw new Error('extraction card not shown yet');
    return card;
  });
  return { user, onCreated, onClose, fileInput, startButton, findCard, ...utils };
};

const pdf = (name = 'Lecture_Notes-4.pdf', size = 2048) => {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  extractDocument.mockReset();
  summarizeDocument.mockReset();
  summarizeDocument.mockResolvedValue(makeSummary());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NewSummaryModal: sources and initial state', () => {
  it('offers upload, web article, paste and sample sources, with Start disabled until there is input', () => {
    const { startButton } = setup();
    for (const label of [/upload document/i, /web article/i, /paste text/i, /sample coursework/i]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('NewSummaryModal: uploading a file', () => {
  it('sends the file to the server, shows what was extracted, and fills the title', async () => {
    extractDocument.mockResolvedValue(makeResult());
    const { user, fileInput, startButton, findCard } = setup();
    const file = pdf();
    await user.upload(fileInput(), file);

    expect(extractDocument).toHaveBeenCalledTimes(1);
    expect(extractDocument.mock.calls[0][0]).toMatchObject({ file, stripReferences: false });

    const summary = await findCard();
    expect(within(summary).getByText('Lecture_Notes-4.pdf')).toBeTruthy();
    expect(within(summary).getByText('1,234')).toBeTruthy(); // real word count
    expect(within(summary).getByText('42')).toBeTruthy();
    expect(within(summary).getByText('English')).toBeTruthy();
    expect(summary.textContent).toMatch(/PDF • 2 KB • 12 pages/);

    expect((screen.getByLabelText(/document title/i) as HTMLInputElement).value).toBe('Lecture Notes 4');
    expect((startButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows extractor warnings and OCR status', async () => {
    extractDocument.mockResolvedValue(
      makeResult({
        source: { kind: 'file', format: 'pdf', fileName: 'scan.pdf', pageCount: 3, ocrUsed: true },
        warnings: ['No text layer, so text was recognised with OCR. Check it for recognition errors.'],
      }),
    );
    const { user, fileInput } = setup();
    await user.upload(fileInput(), pdf('scan.pdf'));
    expect(await screen.findByText(/recognised with OCR$/)).toBeTruthy();
    expect(screen.getByText(/Check it for recognition errors/)).toBeTruthy();
  });

  it('does not call the server for an unsupported file type', async () => {
    const { user, fileInput, startButton } = setup();
    await user.upload(fileInput(), new File(['MZ'], 'setup.exe'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a supported file type/);
    expect(extractDocument).not.toHaveBeenCalled();
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not call the server for an empty or oversized file', async () => {
    const { user, fileInput } = setup();
    await user.upload(fileInput(), pdf('empty.pdf', 0));
    expect((await screen.findByRole('alert')).textContent).toMatch(/is empty/);
    await user.upload(fileInput(), pdf('huge.pdf', 60 * 1024 * 1024));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/limit is 50 MB/));
    expect(extractDocument).not.toHaveBeenCalled();
  });

  it('shows the server error message when extraction fails, and keeps Start disabled', async () => {
    extractDocument.mockRejectedValue(new api.ApiError('The PDF is password-protected. Remove the password and try again.', 422, 'unprocessable'));
    const { user, fileInput, startButton } = setup();
    await user.upload(fileInput(), pdf('locked.pdf'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/password-protected/);
    expect(screen.queryByText(/words$/)).toBeNull();
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows friendly text when the server is unreachable', async () => {
    extractDocument.mockRejectedValue(new api.ApiError('raw', 0, 'network_error'));
    const { user, fileInput } = setup();
    await user.upload(fileInput(), pdf());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach the server/);
  });

  it('lets the student remove the extracted document', async () => {
    extractDocument.mockResolvedValue(makeResult());
    const { user, fileInput, startButton, findCard } = setup();
    await user.upload(fileInput(), pdf());
    await findCard();
    await user.click(screen.getByRole('button', { name: /remove extracted document/i }));
    expect(screen.queryByText('1,234')).toBeNull();
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('re-extracts the same file when "ignore references" is toggled', async () => {
    extractDocument.mockResolvedValue(makeResult());
    const { user, fileInput, findCard } = setup();
    const file = pdf();
    await user.upload(fileInput(), file);
    await findCard();

    await user.click(screen.getByLabelText(/ignore the reference list/i));
    await waitFor(() => expect(extractDocument).toHaveBeenCalledTimes(2));
    expect(extractDocument.mock.calls[1][0]).toMatchObject({ file, stripReferences: true });
  });

  it('shows a loading state while a file is being read', async () => {
    let resolve!: (r: ExtractionResult) => void;
    extractDocument.mockReturnValue(new Promise<ExtractionResult>((r) => (resolve = r)));
    const { user, fileInput, startButton } = setup();
    await user.upload(fileInput(), pdf('slow.pdf'));
    expect(await screen.findByText(/Reading slow\.pdf/)).toBeTruthy();
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve(makeResult()));
    await screen.findByText('1,234');
  });
});

describe('NewSummaryModal: web articles', () => {
  it('rejects a malformed link without calling the server', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /web article/i }));
    await user.type(screen.getByLabelText(/article or paper link/i), 'not a link');
    await user.click(screen.getByRole('button', { name: /fetch & extract/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/full link/);
    expect(extractDocument).not.toHaveBeenCalled();
  });

  it('rejects non-http schemes', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /web article/i }));
    await user.type(screen.getByLabelText(/article or paper link/i), 'ftp://example.com/file');
    await user.click(screen.getByRole('button', { name: /fetch & extract/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/http and https/);
  });

  it('fetches a valid link (button or Enter) and shows the page title', async () => {
    extractDocument.mockResolvedValue(
      makeResult({
        source: { kind: 'url', format: 'html', url: 'https://example.edu/consensus', title: 'Consensus in Practice', ocrUsed: false },
      }),
    );
    const { user, startButton } = setup();
    await user.click(screen.getByRole('button', { name: /web article/i }));
    await user.type(screen.getByLabelText(/article or paper link/i), 'https://example.edu/consensus{Enter}');

    expect(extractDocument).toHaveBeenCalledTimes(1);
    expect(extractDocument.mock.calls[0][0]).toMatchObject({ url: 'https://example.edu/consensus' });
    expect(await screen.findByText('https://example.edu/consensus', { selector: 'p' })).toBeTruthy();
    expect((screen.getByLabelText(/document title/i) as HTMLInputElement).value).toBe('Consensus in Practice');
    expect((startButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the server error for a blocked address', async () => {
    extractDocument.mockRejectedValue(new api.ApiError('That URL points to a private or disallowed address and cannot be fetched.', 400, 'bad_request'));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /web article/i }));
    await user.type(screen.getByLabelText(/article or paper link/i), 'http://169.254.169.254/latest');
    await user.click(screen.getByRole('button', { name: /fetch & extract/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/private or disallowed/);
  });
});

describe('NewSummaryModal: switching sources', () => {
  it('clears an earlier extraction when the source type changes', async () => {
    extractDocument.mockResolvedValue(makeResult());
    const { user, fileInput } = setup();
    await user.upload(fileInput(), pdf());
    await screen.findByText('1,234');
    await user.click(screen.getByRole('button', { name: /paste text/i }));
    expect(screen.queryByText('1,234')).toBeNull();
  });
});

describe('NewSummaryModal: pasted text and creating the document', () => {
  it('extracts pasted text on start, then builds the document from the real extraction', async () => {
    const result = makeResult({
      text: 'Real cleaned text from the server about consensus protocols.',
      wordCount: 9,
      source: { kind: 'text', format: 'text', ocrUsed: false },
    });
    extractDocument.mockResolvedValue(result);
    const { user, onCreated, onClose, startButton } = setup();

    await user.click(screen.getByRole('button', { name: /paste text/i }));
    expect((startButton() as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByPlaceholderText(/paste full text/i), 'raw pasted text');
    expect((startButton() as HTMLButtonElement).disabled).toBe(false);
    await user.click(startButton());

    expect(extractDocument).toHaveBeenCalledTimes(1);
    expect(extractDocument.mock.calls[0][0]).toEqual({ text: 'raw pasted text', stripReferences: false });

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    // The model receives the cleaned text from the server, not the raw paste.
    expect(summarizeDocument.mock.calls[0][0]).toMatchObject({
      text: result.text,
      category: 'Computer Science',
      summarizationType: 'abstractive',
      length: 'balanced',
      language: 'English',
      sourceLanguage: 'en',
    });
    const doc = onCreated.mock.calls[0][0];
    // A real id and timestamp, so it can be stored; pasted text has no original file to keep.
    expect(doc.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(new Date(doc.createdAt!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(onCreated.mock.calls[0][1]).toEqual({ originalFile: null });
    expect(doc.sourceText).toBe(result.text);
    expect(doc.sourceMetadata).toMatchObject({ originalWordCount: 1234, fileType: 'NOTE', author: 'Test Student', institution: 'Test University' });
    expect(doc.title).toBe('Synthesized Academic Reflection');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays on the form with an error if pasted text cannot be processed', async () => {
    extractDocument.mockRejectedValue(new api.ApiError('No readable text was found in this document.', 422, 'unprocessable'));
    const { user, onCreated, startButton } = setup();
    await user.click(screen.getByRole('button', { name: /paste text/i }));
    await user.type(screen.getByPlaceholderText(/paste full text/i), '.....');
    await user.click(startButton());

    expect((await screen.findByRole('alert')).textContent).toMatch(/No readable text/);
    expect(screen.queryByText(/Summarizing Academic Material/)).toBeNull();
    expect(summarizeDocument).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('uses the uploaded file extraction (not a second request) when starting', async () => {
    extractDocument.mockResolvedValue(makeResult());
    const { user, fileInput, onCreated, startButton } = setup();
    await user.upload(fileInput(), pdf());
    await screen.findByText('1,234');
    await user.click(startButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    expect(extractDocument).toHaveBeenCalledTimes(1);
    const doc = onCreated.mock.calls[0][0];
    // The uploaded file is handed over so the original can be kept in the account's storage.
    expect(onCreated.mock.calls[0][1]?.originalFile?.name).toBe('Lecture_Notes-4.pdf');
    expect(doc.title).toBe('Lecture Notes 4');
    expect(doc.sourceMetadata).toMatchObject({ fileName: 'Lecture_Notes-4.pdf', fileType: 'PDF', originalWordCount: 1234 });
  });

  it('uses a sample preset as pasted text', async () => {
    extractDocument.mockResolvedValue(makeResult({ source: { kind: 'text', format: 'text', ocrUsed: false } }));
    const { user, startButton } = setup();
    await user.click(screen.getByRole('button', { name: /sample coursework/i }));
    await user.click(screen.getByText('Distributed Systems & Paxos Consensus'));
    expect((screen.getByLabelText(/document title/i) as HTMLInputElement).value).toBe('Distributed Systems & Paxos Consensus');
    await user.click(startButton());
    expect(extractDocument.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining('Paxos and Raft') });
  });

  it('resets the form after a successful creation', async () => {
    extractDocument.mockResolvedValue(makeResult());
    const { user, fileInput, startButton, onCreated } = setup();
    await user.upload(fileInput(), pdf());
    await screen.findByText('1,234');
    await user.click(startButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText(/document title/i) as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('1,234')).toBeNull();
  });

  it('creates exactly one document even when React double-invokes effects and updaters (StrictMode)', async () => {
    extractDocument.mockResolvedValue(makeResult());
    const onCreated = vi.fn();
    const user = userEvent.setup({ applyAccept: false, advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { container } = render(
      <StrictMode>
        <NewSummaryModal isOpen onClose={vi.fn()} onCreated={onCreated} />
      </StrictMode>,
    );
    await user.upload(container.querySelector<HTMLInputElement>('#document-file-input')!, pdf());
    await waitFor(() => expect(container.querySelector('#extraction-summary')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: /start ai summarization/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(summarizeDocument).toHaveBeenCalledTimes(1);
  });

  it('builds the document from what the model wrote, not from a template', async () => {
    extractDocument.mockResolvedValue(makeResult());
    summarizeDocument.mockResolvedValue(makeSummary({ warnings: ['Check these figures: 34%.'] }));
    const { user, fileInput, onCreated, startButton } = setup();
    await user.upload(fileInput(), pdf());
    await screen.findByText('1,234');
    await user.click(startButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    const doc = onCreated.mock.calls[0][0];
    expect(doc.contentParagraphs).toEqual(['Nodes agree on one value using quorums.', 'Raft elects a leader to order the log.']);
    expect(doc.bulletPoints.map((b) => b.title)).toEqual(['Quorums.', 'Leaders.']);
    expect(doc.discussionQuestions).toMatchObject([{ question: 'Why a majority?', context: 'Think about partitions.' }]);
    expect(doc.promptQuestion).toBe('How do quorums keep replicas consistent?');
    expect(doc.tags).toEqual(['Consensus', 'Raft']);
    expect(doc.summaryWarnings).toEqual(['Check these figures: 34%.']);
    expect(doc.sourceMetadata).toMatchObject({ modelUsed: 'qwen/qwen3.8-27b', summaryWordCount: 61, reductionRate: '95%', processingTime: '3.2s' });
    // Nothing invented: the old hard-coded quality claims are gone.
    expect(doc.sourceMetadata).not.toHaveProperty('rougeScores');
    expect(JSON.stringify(doc)).not.toMatch(/BERT|ROUGE metrics/);
  });

  it('shows live progress from the summarizer while it works', async () => {
    extractDocument.mockResolvedValue(makeResult());
    let finish!: (s: SummaryResult) => void;
    summarizeDocument.mockImplementation((_input, opts) => {
      opts?.onProgress?.({ stage: 'sections', message: 'Reading section 2 of 4', percent: 40, current: 1, total: 4 });
      return new Promise<SummaryResult>((resolve) => (finish = resolve));
    });
    const { user, fileInput, onCreated, startButton } = setup();
    await user.upload(fileInput(), pdf());
    await screen.findByText('1,234');
    await user.click(startButton());

    expect(await screen.findByText('Reading section 2 of 4')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    expect(onCreated).not.toHaveBeenCalled();
    await act(async () => finish(makeSummary()));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('returns to the form with the server message if summarizing fails, and creates nothing', async () => {
    extractDocument.mockResolvedValue(makeResult());
    summarizeDocument.mockRejectedValue(new api.ApiError('Summarization failed: the AI service is busy.', 502, 'upstream_error'));
    const { user, fileInput, onCreated, startButton } = setup();
    await user.upload(fileInput(), pdf());
    await screen.findByText('1,234');
    await user.click(startButton());

    expect((await screen.findByRole('alert')).textContent).toMatch(/AI service is busy/);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
    // The extraction is kept, so the student can simply try again.
    expect((startButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('cancels an in-progress summarization and creates nothing', async () => {
    extractDocument.mockResolvedValue(makeResult());
    let signal: AbortSignal | undefined;
    summarizeDocument.mockImplementation((_input, opts) => {
      signal = opts?.signal;
      return new Promise<SummaryResult>(() => undefined);
    });
    const { user, fileInput, onCreated, startButton } = setup();
    await user.upload(fileInput(), pdf());
    await screen.findByText('1,234');
    await user.click(startButton());
    await screen.findByRole('progressbar');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe('NewSummaryModal: style examples from the student’s rated summaries', () => {
  const startWithText = async (t: ReturnType<typeof setup>) => {
    extractDocument.mockResolvedValue(makeResult({ source: { kind: 'text', format: 'text', ocrUsed: false } }));
    await t.user.click(screen.getByRole('button', { name: /paste text/i }));
    await t.user.type(screen.getByPlaceholderText(/paste full text/i), 'some notes');
    await t.user.click(t.startButton());
  };

  it('asks for examples in the chosen subject and language, sends them, and records how many were used', async () => {
    const getExamples = vi.fn().mockResolvedValue([{ title: 'Earlier', text: 'A good summary.' }]);
    summarizeDocument.mockResolvedValue({ ...makeSummary(), metadata: { ...makeSummary().metadata, examplesUsed: 1 } });
    const t = setup({ getExamples });
    await startWithText(t);

    await waitFor(() => expect(t.onCreated).toHaveBeenCalledTimes(1));
    expect(getExamples).toHaveBeenCalledWith('Computer Science', 'English');
    expect(summarizeDocument.mock.calls[0][0].examples).toEqual([{ title: 'Earlier', text: 'A good summary.' }]);
    expect(t.onCreated.mock.calls[0][0].sourceMetadata).toMatchObject({ examplesUsed: 1, summaryLength: 'balanced', summaryMode: 'abstractive' });
  });

  it('still summarises, without examples, when they cannot be loaded', async () => {
    const getExamples = vi.fn().mockRejectedValue(new Error('offline'));
    const t = setup({ getExamples });
    await startWithText(t);

    await waitFor(() => expect(t.onCreated).toHaveBeenCalledTimes(1));
    expect(summarizeDocument.mock.calls[0][0].examples).toEqual([]);
  });

  it('does not ask for examples in extractive mode, which writes no prose', async () => {
    const getExamples = vi.fn().mockResolvedValue([{ title: 'Earlier', text: 'x' }]);
    const t = setup({ getExamples });
    await t.user.selectOptions(screen.getByDisplayValue(/abstractive/i), 'extractive');
    await startWithText(t);

    await waitFor(() => expect(t.onCreated).toHaveBeenCalledTimes(1));
    expect(getExamples).not.toHaveBeenCalled();
    expect(summarizeDocument.mock.calls[0][0]).toMatchObject({ summarizationType: 'extractive', examples: [] });
  });
});

// @vitest-environment jsdom
import {useState, type ComponentProps} from 'react';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {DocumentSummary, FeedbackAggregate, FeedbackEntry} from '../types';
import * as api from '../lib/api';
import {MainEditorView} from './MainEditorView';
import {MetricsView} from './MetricsView';
import {SummaryFeedback} from './SummaryFeedback';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {...actual, generateQuestion: vi.fn()};
});
vi.mock('../lib/useAuthUser', () => ({useAuthUser: () => null}));
const generateQuestion = vi.mocked(api.generateQuestion);

beforeEach(() => {
  generateQuestion.mockReset();
  window.HTMLElement.prototype.scrollTo = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const entry = (over: Partial<FeedbackEntry> = {}): FeedbackEntry => ({
  id: 'f1',
  documentId: 'd1',
  rating: 4,
  comment: 'Clear.',
  consent: true,
  params: {},
  createdAt: '2026-09-20T10:00:00Z',
  ...over,
});

describe('SummaryFeedback', () => {
  it('asks for a rating first, then reveals the comment and consent, and submits what was chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SummaryFeedback entry={null} onSubmit={onSubmit} />);

    expect(screen.queryByRole('button', {name: /submit rating/i})).toBeNull();
    await user.click(screen.getByRole('radio', {name: /4 of 5/}));
    await user.type(screen.getByLabelText(/comment on this summary/i), 'Missed the second theorem.');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', {name: /submit rating/i}));

    expect(onSubmit).toHaveBeenCalledWith({rating: 4, comment: 'Missed the second theorem.', consent: true});
    expect((await screen.findByRole('status')).textContent).toMatch(/saved/i);
  });

  it('starts from the existing rating and offers to update it', () => {
    render(<SummaryFeedback entry={entry({rating: 2, comment: 'Too short.', consent: false})} onSubmit={vi.fn()} />);
    expect(screen.getByText(/your rating of this summary/i)).toBeTruthy();
    expect(screen.getByRole('radio', {name: /2 of 5/}).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText(/comment on this summary/i) as HTMLTextAreaElement).value).toBe('Too short.');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', {name: /update rating/i})).toBeTruthy();
  });

  it('never claims success when saving fails, and keeps what was typed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Could not save your rating: network down'));
    render(<SummaryFeedback entry={null} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('radio', {name: /5 of 5/}));
    await user.type(screen.getByLabelText(/comment/i), 'Great');
    await user.click(screen.getByRole('button', {name: /submit rating/i}));

    expect((await screen.findByRole('alert')).textContent).toContain('network down');
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText(/comment/i) as HTMLTextAreaElement).value).toBe('Great');
  });

  it('says exactly what consent does and does not do', () => {
    render(<SummaryFeedback entry={entry()} onSubmit={vi.fn()} />);
    const text = screen.getByRole('checkbox').closest('label')!.textContent!;
    expect(text).toMatch(/my future summaries/);
    expect(text).toMatch(/not shared with other students/);
    expect(text).not.toMatch(/fine-tun|train/i);
  });
});

const doc = (over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id: 'd1',
  title: 'Consensus',
  dateBadge: 'Today',
  timeAgoGroup: 'Last 7 days',
  category: 'Computer Science',
  categoryColor: 'blue',
  tags: [],
  excerpt: '',
  createdDate: '',
  emotionalTone: 'Analytical & Rigorous',
  contentParagraphs: ['Nodes agree on one value.'],
  bulletPoints: [{title: 'Quorums.', text: 'A majority vote.'}],
  discussionQuestions: [{id: 'q1', question: 'Why a majority?', context: 'Partitions.'}],
  currentDiscussionIndex: 0,
  userNotes: '',
  comments: [],
  sourceText: 'source',
  sourceMetadata: {language: 'English'},
  ...over,
});

function Editor({initial, feedback}: {initial: DocumentSummary; feedback?: ComponentProps<typeof MainEditorView>['feedback']}) {
  const [d, setD] = useState(initial);
  return <MainEditorView document={d} onUpdateDocument={setD} onToggleComments={() => undefined} isCommentsOpen={false} onExport={() => undefined} feedback={feedback} />;
}

describe('MainEditorView: rating and question generation', () => {
  it('shows the rating form under the summary only when feedback is wired up', () => {
    const {rerender} = render(<Editor initial={doc()} />);
    expect(screen.queryByRole('form', {name: /rate this summary/i})).toBeNull();
    rerender(<Editor initial={doc()} feedback={{entry: null, onSubmit: vi.fn()}} />);
    expect(screen.getByRole('form', {name: /rate this summary/i})).toBeTruthy();
  });

  it('asks the server for a real question from the summary and adds it after the existing ones', async () => {
    const user = userEvent.setup();
    generateQuestion.mockResolvedValue({question: 'How would a network partition change the outcome?', context: 'Think about minorities.'});
    render(<Editor initial={doc()} />);

    await user.click(screen.getByRole('button', {name: /generate a question now/i}));

    await waitFor(() => expect(screen.getByText('How would a network partition change the outcome?')).toBeTruthy());
    expect(generateQuestion).toHaveBeenCalledWith({
      title: 'Consensus',
      language: 'English',
      contentParagraphs: ['Nodes agree on one value.'],
      bulletPoints: [{title: 'Quorums.', text: 'A majority vote.'}],
      existingQuestions: ['Why a majority?'],
    });
  });

  it('shows the failure instead of inventing a question, and leaves the questions as they were', async () => {
    const user = userEvent.setup();
    generateQuestion.mockRejectedValue(new api.ApiError('Question generation failed: try again.', 502, 'upstream_error'));
    render(<Editor initial={doc()} />);

    await user.click(screen.getByRole('button', {name: /generate a question now/i}));

    expect((await screen.findByRole('alert')).textContent).toMatch(/question generation failed/i);
    expect(screen.getByText('Why a majority?')).toBeTruthy();
    expect(generateQuestion).toHaveBeenCalledTimes(1);
  });

  it('no longer offers the canned "additional key point" action', async () => {
    const user = userEvent.setup();
    render(<Editor initial={doc()} />);
    await user.click(screen.getByTitle(/leaderforge ai assistant/i));
    expect(screen.queryByText(/extract additional key point/i)).toBeNull();
    expect(screen.getByText(/generate revision question/i)).toBeTruthy();
  });
});

describe('MetricsView', () => {
  const idle = {entries: [] as FeedbackEntry[], status: 'ready' as const, error: null};
  const noBenchmark = {documents: 0};

  it('shows no invented numbers for a brand-new account', () => {
    render(<MetricsView documents={[]} feedback={idle} role="student" benchmark={noBenchmark} />);
    expect(screen.getByText(/you have no summaries yet/i)).toBeTruthy();
    expect(screen.getByText(/you have not rated a summary yet/i)).toBeTruthy();
    expect(screen.getByText(/no benchmark has been run yet/i)).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/0\.892|0\.741|0\.865|GDPR|FERPA|34%|98\.5%|fine-tun/i);
  });

  it('computes usage and rating figures from the student’s own data', () => {
    const docs = [
      doc({id: 'a', sourceMetadata: {originalWordCount: 1000, summaryWordCount: 100, processingTime: '2s', modelUsed: 'gpt-oss'}}),
      doc({id: 'b', sourceMetadata: {originalWordCount: 1000, summaryWordCount: 300, processingTime: '4s', modelUsed: 'gpt-oss'}}),
    ];
    const entries = [entry({id: '1', rating: 5, model: 'gpt-oss'}), entry({id: '2', rating: 3, model: 'gpt-oss', consent: false, comment: 'Too vague.'})];
    render(<MetricsView documents={docs} feedback={{entries, status: 'ready', error: null}} role="student" benchmark={noBenchmark} />);

    expect(screen.getByText('80%')).toBeTruthy(); // 1 - 400/2000
    expect(screen.getByText('3.0s')).toBeTruthy();
    expect(screen.getAllByText(/4\.0 \/ 5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 ratings; 1 allowed as examples/)).toBeTruthy();
    expect(screen.getByText(/gpt-oss \(2\)/)).toBeTruthy();
    expect(screen.getByText(/Too vague\./)).toBeTruthy();
  });

  it('reports the benchmark with how many documents it covers, and never per summary', () => {
    render(
      <MetricsView
        documents={[]}
        feedback={idle}
        role="student"
        benchmark={{documents: 12, rouge1: 0.412, rouge2: 0.187, rougeL: 0.301, mode: 'abstractive', length: 'balanced', model: 'gpt-oss', generatedAt: '2026-09-21T10:00:00Z'}}
      />,
    );
    expect(screen.getByText('0.412')).toBeTruthy();
    expect(screen.getByText(/Benchmark on 12 reference documents/)).toBeTruthy();
    expect(screen.getByText(/says nothing about any individual summary/i)).toBeTruthy();
  });

  it('shows the all-users report only to faculty, and only what the server returns', async () => {
    const rows: FeedbackAggregate[] = [
      {dimension: 'all', value: 'all', responses: 9, averageRating: 4.2},
      {dimension: 'model', value: 'gpt-oss', responses: 9, averageRating: 4.2},
    ];
    const loadAggregates = vi.fn().mockResolvedValue(rows);

    const {rerender} = render(<MetricsView documents={[]} feedback={idle} role="student" loadAggregates={loadAggregates} benchmark={noBenchmark} />);
    expect(screen.queryByText(/across all users/i)).toBeNull();
    expect(loadAggregates).not.toHaveBeenCalled();

    rerender(<MetricsView documents={[]} feedback={idle} role="faculty" loadAggregates={loadAggregates} benchmark={noBenchmark} />);
    expect((await screen.findAllByText(/4\.2 \/ 5/, {selector: 'td'})).length).toBe(2); // "Everyone" and the model group
    expect(screen.getByText(/fewer than 3 ratings are hidden/i)).toBeTruthy();
  });

  it('says so when faculty have too few ratings for any group', async () => {
    render(<MetricsView documents={[]} feedback={idle} role="faculty" loadAggregates={vi.fn().mockResolvedValue([])} benchmark={noBenchmark} />);
    expect(await screen.findByText(/not enough ratings yet/i)).toBeTruthy();
  });

  it('describes data use truthfully: a third-party AI service, no retraining', () => {
    render(<MetricsView documents={[]} feedback={idle} role="student" benchmark={noBenchmark} />);
    expect(screen.getByText(/sent to an AI service \(Groq\)/)).toBeTruthy();
    expect(screen.getByText(/not retrained on your data/i)).toBeTruthy();
  });
});

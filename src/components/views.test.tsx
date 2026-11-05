// @vitest-environment jsdom
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {DocumentSummary} from '../types';
import {DashboardView} from './DashboardView';
import {ProgramsView} from './ProgramsView';
import {SchedulingView} from './SchedulingView';

vi.mock('../lib/useAuthUser', () => ({
  useAuthUser: () => ({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'amina@example.edu',
    fullName: 'Amina Yusuf',
    avatarUrl: '',
    institution: 'Test University',
    studentId: 'S-0042',
    role: 'researcher',
    createdAt: '2026-01-01T00:00:00Z',
  }),
}));

afterEach(cleanup);

const DAY = 24 * 60 * 60 * 1000;
const doc = (id: string, over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id,
  title: `Summary ${id}`,
  dateBadge: 'Today',
  timeAgoGroup: 'Last 7 days',
  category: 'Computer Science',
  categoryColor: 'blue',
  tags: [],
  excerpt: `Excerpt of ${id}`,
  createdDate: '',
  createdAt: new Date().toISOString(),
  emotionalTone: '',
  contentParagraphs: [],
  bulletPoints: [],
  discussionQuestions: [],
  currentDiscussionIndex: 0,
  userNotes: '',
  comments: [],
  ...over,
});

const noop = () => undefined;

describe('DashboardView', () => {
  const renderIt = (documents: DocumentSummary[]) =>
    render(<DashboardView documents={documents} onSelectDoc={noop} onNewDocClick={noop} onOpenArchitecture={noop} />);

  it('shows no invented numbers or people for a new account', () => {
    renderIt([]);
    const text = document.body.textContent ?? '';
    expect(text).toContain('No summaries yet');
    expect(text).toContain('0 Docs');
    expect(text).toContain('0 of 0');
    for (const fake of ['83.4', 'ROUGE', '0.88', '4.2x', 'Geoffrey Sagwe', 'BCSITP', 'BERT']) expect(text).not.toContain(fake);
    // Time saved and compression have nothing to be computed from.
    expect(screen.getByText('Reading Time Saved').parentElement.textContent).toContain('—');
    expect(screen.getByText('Compression Ratio').parentElement.textContent).toContain('—');
  });

  it('computes its figures from the documents and shows the signed-in user', () => {
    renderIt([
      doc('a', {sourceMetadata: {originalWordCount: 4000, summaryWordCount: 400, reductionRate: '90%', modelUsed: 'openai/gpt-oss-120b'}}),
      doc('b', {category: 'Economics', sourceMetadata: {originalWordCount: 1000, summaryWordCount: 100}}),
    ]);
    const card = (label: string) => screen.getByText(label).parentElement!;
    expect(card('Summarized Materials').textContent).toContain('2 Docs');
    expect(card('Summarized Materials').textContent).toContain('Across 2 categories');
    expect(card('Compression Ratio').textContent).toContain('90%');
    expect(card('Compression Ratio').textContent).toContain('5,000 words read down to 500');
    expect(card('Reading Time Saved').textContent).toContain('23 min'); // 4500 words / 200 wpm = 22.5, rounded
    expect(screen.getByText('90% shorter')).toBeTruthy();
    expect(screen.getByText('Amina Yusuf', {selector: 'p'})).toBeTruthy();
    expect(screen.getByText(/researcher • Test University/)).toBeTruthy();
    expect(screen.getByText('openai/gpt-oss-120b')).toBeTruthy();
  });

  it('opens a summary from the recent list', async () => {
    const onSelect = vi.fn();
    render(<DashboardView documents={[doc('a')]} onSelectDoc={onSelect} onNewDocClick={noop} onOpenArchitecture={noop} />);
    await userEvent.click(screen.getByText('Summary a'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: 'a'}));
  });
});

describe('ProgramsView', () => {
  it('shows an empty state instead of made-up courses', () => {
    render(<ProgramsView documents={[]} onSelectDoc={noop} onNewDocClick={noop} />);
    expect(screen.getByText('No course materials yet')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/CSIT-402|ECON-201|LEAD-401|BCSITP/);
  });

  it('groups the real documents by category with true counts', async () => {
    const onSelect = vi.fn();
    render(
      <ProgramsView
        documents={[
          doc('a', {createdAt: new Date(Date.now() - 3 * DAY).toISOString()}),
          doc('b'),
          doc('c', {category: 'Economics', categoryColor: 'purple'}),
        ]}
        onSelectDoc={onSelect}
        onNewDocClick={noop}
      />,
    );
    const cs = screen.getByRole('heading', {name: 'Computer Science'}).closest('div.bg-white')! as HTMLElement;
    expect(within(cs).getByText('2 Summaries')).toBeTruthy();
    expect(screen.getByText('1 Summary')).toBeTruthy();
    await userEvent.click(within(cs).getByRole('button', {name: /Open latest/}));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: 'b'})); // the newest one
  });
});

describe('SchedulingView', () => {
  const progress = (lastReviewedAt?: string): DocumentSummary['reviewProgress'] => ({
    scrollPercent: 0,
    maxScrollPercent: 0,
    reviewedBulletIndices: [],
    completedTaskIds: ['t1'],
    isFullyReviewed: false,
    lastReviewedAt,
  });

  it('shows an empty state instead of made-up tasks', () => {
    render(<SchedulingView documents={[]} onSelectDoc={noop} onNewDocClick={noop} onUpdateDocument={noop} />);
    expect(screen.getByText('No reviews scheduled')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Supervisor Meeting|47%|ECON-201/);
  });

  it('lists what is due, oldest first, with its step and how late it is', () => {
    render(
      <SchedulingView
        documents={[
          doc('new', {title: 'Just made', createdAt: new Date().toISOString()}),
          doc('old', {title: 'Made long ago', createdAt: new Date(Date.now() - 12 * DAY).toISOString()}),
        ]}
        onSelectDoc={noop}
        onNewDocClick={noop}
        onUpdateDocument={noop}
      />,
    );
    const rows = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Review'));
    expect(rows[0].textContent).toContain('Made long ago');
    expect(rows[0].textContent).toContain('Review 1 of 4');
    expect(rows[0].textContent).toContain('Overdue by 11 days');
    expect(rows[1].textContent).toContain('Just made');
    expect(rows[1].textContent).toContain('Due tomorrow');
    expect(screen.getByText(/1 summary is due for review/)).toBeTruthy();
  });

  it('records a review, keeping the rest of the progress, so the next step is scheduled', async () => {
    const onUpdate = vi.fn();
    const old = doc('old', {createdAt: new Date(Date.now() - 12 * DAY).toISOString(), reviewProgress: progress()});
    render(<SchedulingView documents={[old]} onSelectDoc={noop} onNewDocClick={noop} onUpdateDocument={onUpdate} />);
    await userEvent.click(screen.getByRole('button', {name: /Mark Summary old as reviewed/}));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const saved = onUpdate.mock.calls[0][0] as DocumentSummary;
    expect(saved.reviewProgress?.completedTaskIds).toEqual(['t1']);
    expect(Date.parse(saved.reviewProgress?.lastReviewedAt ?? '')).toBeGreaterThan(Date.now() - 5000);
  });

  it('opens a summary from its row', async () => {
    const onSelect = vi.fn();
    render(<SchedulingView documents={[doc('a')]} onSelectDoc={onSelect} onNewDocClick={noop} onUpdateDocument={noop} />);
    await userEvent.click(screen.getByRole('button', {name: /Open Summary a/}));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: 'a'}));
  });
});

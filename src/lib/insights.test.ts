import {describe, expect, it} from 'vitest';
import type {DocumentSummary} from '../types';
import {dashboardStats, describeDue, formatDuration, groupByCategory, reviewSchedule, UNCATEGORISED} from './insights';

const DAY = 24 * 60 * 60 * 1000;
// Noon, so "start of day" maths is not near a boundary in any timezone.
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();

const doc = (over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  title: 'T',
  dateBadge: '',
  timeAgoGroup: 'Last 7 days',
  category: 'Computer Science',
  categoryColor: 'blue',
  tags: [],
  excerpt: '',
  createdDate: '',
  createdAt: new Date(NOW).toISOString(),
  emotionalTone: '',
  contentParagraphs: [],
  bulletPoints: [],
  discussionQuestions: [],
  currentDiscussionIndex: 0,
  userNotes: '',
  comments: [],
  ...over,
});
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

describe('dashboardStats', () => {
  it('reports zeros and nulls, not invented numbers, when there is nothing to measure', () => {
    expect(dashboardStats([])).toMatchObject({documentCount: 0, categoryCount: 0, compressionPercent: null, minutesSaved: null, latestModel: null});
    const stats = dashboardStats([doc()]); // no word counts recorded
    expect(stats).toMatchObject({documentCount: 1, measuredCount: 0, compressionPercent: null, minutesSaved: null});
  });

  it('uses only documents that recorded both word counts', () => {
    const stats = dashboardStats([
      doc({sourceMetadata: {originalWordCount: 4000, summaryWordCount: 400, modelUsed: 'old-model'}, createdAt: ago(5)}),
      doc({sourceMetadata: {originalWordCount: 1000, summaryWordCount: 100, modelUsed: 'new-model'}, createdAt: ago(1), category: 'Economics'}),
      doc({sourceMetadata: {}, category: ''}),
    ]);
    expect(stats.measuredCount).toBe(2);
    expect(stats.originalWords).toBe(5000);
    expect(stats.summaryWords).toBe(500);
    expect(stats.compressionPercent).toBe(90);
    expect(stats.minutesSaved).toBeCloseTo(22.5); // 4500 words / 200 wpm
    expect(stats.categoryCount).toBe(2); // the empty category does not count
    expect(stats.latestModel).toBe('new-model');
  });

  it('counts fully reviewed documents', () => {
    const done = {scrollPercent: 100, maxScrollPercent: 100, reviewedBulletIndices: [], completedTaskIds: [], isFullyReviewed: true};
    expect(dashboardStats([doc({reviewProgress: done}), doc()]).fullyReviewedCount).toBe(1);
  });

  it('formats durations', () => {
    expect(formatDuration(0.2)).toBe('< 1 min');
    expect(formatDuration(42.4)).toBe('42 min');
    expect(formatDuration(150)).toBe('2.5 hrs');
  });
});

describe('groupByCategory', () => {
  it('groups by category, biggest first, newest document first within a group', () => {
    const groups = groupByCategory([
      doc({id: 'a', category: 'Economics', createdAt: ago(3), categoryColor: 'purple'}),
      doc({id: 'b', category: 'Computer Science', createdAt: ago(9), sourceMetadata: {courseCode: 'CSIT-402'}}),
      doc({id: 'c', category: 'Computer Science', createdAt: ago(1), sourceMetadata: {courseCode: 'CSIT-402'}}),
      doc({id: 'd', category: '  ', createdAt: ago(2)}),
    ]);
    expect(groups.map((g) => [g.name, g.count])).toEqual([
      ['Computer Science', 2],
      ['Economics', 1],
      [UNCATEGORISED, 1],
    ]);
    expect(groups[0].documents.map((d) => d.id)).toEqual(['c', 'b']);
    expect(groups[0].courseCodes).toEqual(['CSIT-402']);
    expect(groups[1].color).toBe('purple');
  });

  it('is empty for no documents', () => expect(groupByCategory([])).toEqual([]));
});

describe('reviewSchedule', () => {
  const next = (d: DocumentSummary) => reviewSchedule([d], NOW).items[0];

  it('first review is due a day after the summary was made', () => {
    expect(next(doc({createdAt: ago(0)}))).toMatchObject({step: 1, status: 'upcoming', daysFromToday: 1});
    expect(next(doc({createdAt: ago(1)}))).toMatchObject({step: 1, status: 'today', daysFromToday: 0});
  });

  it('a never-reviewed old summary is overdue at step 1', () => {
    const item = next(doc({createdAt: ago(10)}));
    expect(item).toMatchObject({step: 1, status: 'overdue'});
    expect(describeDue(item)).toBe('Overdue by 9 days');
  });

  it('a review covers every step due on or before it', () => {
    // Made 10 days ago and reviewed today: steps at day 1, 3 and 7 are covered; day 30 is next.
    const item = next(doc({createdAt: ago(10), reviewProgress: progress(NOW)}));
    expect(item).toMatchObject({step: 4, status: 'upcoming', daysFromToday: 20});
    expect(describeDue(item)).toMatch(/^Due (Oct|Sep) \d+$/);
    // Reviewed two days after it was made: only day 1 is covered.
    expect(next(doc({createdAt: ago(10), reviewProgress: progress(NOW - 8 * DAY)})).step).toBe(2);
  });

  it('moves a summary to completed after the last step', () => {
    const d = doc({createdAt: ago(40), reviewProgress: progress(NOW - 1 * DAY)});
    const result = reviewSchedule([d], NOW);
    expect(result.items).toEqual([]);
    expect(result.completed).toEqual([d]);
  });

  it('ignores review times saved in the old display format and documents without a date', () => {
    expect(next(doc({createdAt: ago(10), reviewProgress: progress('5:10 PM')})).step).toBe(1);
    expect(reviewSchedule([doc({createdAt: undefined})], NOW)).toEqual({items: [], completed: []});
  });

  it('lists what is due now before what is coming up, oldest first', () => {
    const items = reviewSchedule(
      [doc({id: 'later', createdAt: ago(0)}), doc({id: 'old', createdAt: ago(20)}), doc({id: 'today', createdAt: ago(1)})],
      NOW,
    ).items;
    expect(items.map((i) => i.doc.id)).toEqual(['old', 'today', 'later']);
    expect(items.map((i) => i.status)).toEqual(['overdue', 'today', 'upcoming']);
  });

  it('words the due date', () => {
    const base = {dueAt: new Date(NOW + 5 * DAY)};
    expect(describeDue({...base, status: 'today', daysFromToday: 0})).toBe('Due today');
    expect(describeDue({...base, status: 'upcoming', daysFromToday: 1})).toBe('Due tomorrow');
    expect(describeDue({...base, status: 'upcoming', daysFromToday: 5})).toBe('Due in 5 days');
    expect(describeDue({...base, status: 'overdue', daysFromToday: -1})).toBe('Overdue by 1 day');
  });
});

function progress(reviewedAt: number | string): DocumentSummary['reviewProgress'] {
  return {
    scrollPercent: 0,
    maxScrollPercent: 0,
    reviewedBulletIndices: [],
    completedTaskIds: [],
    isFullyReviewed: false,
    lastReviewedAt: typeof reviewedAt === 'number' ? new Date(reviewedAt).toISOString() : reviewedAt,
  };
}

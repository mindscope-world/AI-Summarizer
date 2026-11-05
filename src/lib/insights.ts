import type {DocumentSummary} from '../types';

const DAY = 24 * 60 * 60 * 1000;
/** Average adult reading speed used to estimate time saved. */
export const WORDS_PER_MINUTE = 200;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardStats {
  documentCount: number;
  categoryCount: number;
  /** Documents that have both word counts recorded (older or imported ones may not). */
  measuredCount: number;
  originalWords: number;
  summaryWords: number;
  /** Share of the source removed, 0-100, or null when nothing was measured. */
  compressionPercent: number | null;
  /** Reading time saved, or null when nothing was measured. */
  minutesSaved: number | null;
  fullyReviewedCount: number;
  /** Model behind the most recent summary that recorded one. */
  latestModel: string | null;
}

/** Numbers for the dashboard, computed only from what the documents actually recorded. */
export function dashboardStats(docs: DocumentSummary[]): DashboardStats {
  let measuredCount = 0;
  let originalWords = 0;
  let summaryWords = 0;
  for (const d of docs) {
    const o = d.sourceMetadata?.originalWordCount;
    const s = d.sourceMetadata?.summaryWordCount;
    if (typeof o === 'number' && typeof s === 'number' && o > 0) {
      measuredCount++;
      originalWords += o;
      summaryWords += s;
    }
  }
  const newestFirst = [...docs].sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '') || 0);
  return {
    documentCount: docs.length,
    categoryCount: new Set(docs.map((d) => d.category.trim()).filter(Boolean)).size,
    measuredCount,
    originalWords,
    summaryWords,
    compressionPercent: measuredCount ? Math.max(0, Math.round((1 - summaryWords / originalWords) * 100)) : null,
    minutesSaved: measuredCount ? Math.max(0, (originalWords - summaryWords) / WORDS_PER_MINUTE) : null,
    fullyReviewedCount: docs.filter((d) => d.reviewProgress?.isFullyReviewed).length,
    latestModel: newestFirst.find((d) => d.sourceMetadata?.modelUsed)?.sourceMetadata?.modelUsed ?? null,
  };
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} hrs`;
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export interface CategoryGroup {
  name: string;
  count: number;
  /** Colour chosen for the category's summaries. */
  color: DocumentSummary['categoryColor'];
  courseCodes: string[];
  /** Newest first. */
  documents: DocumentSummary[];
}

export const UNCATEGORISED = 'Uncategorised';

/** Summaries grouped by category, biggest group first. */
export function groupByCategory(docs: DocumentSummary[]): CategoryGroup[] {
  const groups = new Map<string, DocumentSummary[]>();
  for (const d of docs) {
    const name = d.category.trim() || UNCATEGORISED;
    groups.set(name, [...(groups.get(name) ?? []), d]);
  }
  return [...groups.entries()]
    .map(([name, documents]) => {
      const sorted = [...documents].sort((a, b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0));
      return {
        name,
        count: sorted.length,
        color: sorted[0].categoryColor,
        courseCodes: [...new Set(sorted.map((d) => d.sourceMetadata?.courseCode?.trim()).filter((c): c is string => !!c))],
        documents: sorted,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Revision schedule
// ---------------------------------------------------------------------------

/** Days after a summary is made when it is due for review (a standard spaced-repetition ladder). */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 30] as const;

export type ReviewStatus = 'overdue' | 'today' | 'upcoming';

export interface ReviewItem {
  doc: DocumentSummary;
  dueAt: Date;
  /** 1-based position on the ladder, e.g. 2 of 4. */
  step: number;
  totalSteps: number;
  status: ReviewStatus;
  /** Whole days between today and the due day (negative when overdue). */
  daysFromToday: number;
}

export interface ReviewSchedule {
  /** Overdue and due today first (oldest first), then upcoming by date. */
  items: ReviewItem[];
  /** Summaries that have been through every step. */
  completed: DocumentSummary[];
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * When each summary should next be reviewed. The ladder counts from the day it was made; a
 * review recorded at time R covers every step due on or before R, so the next step is the first
 * one due after R (the first one, if it was never reviewed).
 */
export function reviewSchedule(docs: DocumentSummary[], now = Date.now()): ReviewSchedule {
  const today = startOfDay(now);
  const items: ReviewItem[] = [];
  const completed: DocumentSummary[] = [];

  for (const doc of docs) {
    const created = Date.parse(doc.createdAt ?? '');
    if (Number.isNaN(created)) continue;
    const parsed = Date.parse(doc.reviewProgress?.lastReviewedAt ?? '');
    const reviewedAt = Number.isNaN(parsed) ? -Infinity : parsed; // older values were not dates

    const index = REVIEW_INTERVAL_DAYS.findIndex((days) => created + days * DAY > reviewedAt);
    if (index === -1) {
      completed.push(doc);
      continue;
    }
    const dueAt = new Date(created + REVIEW_INTERVAL_DAYS[index] * DAY);
    const daysFromToday = Math.round((startOfDay(dueAt.getTime()) - today) / DAY);
    items.push({
      doc,
      dueAt,
      step: index + 1,
      totalSteps: REVIEW_INTERVAL_DAYS.length,
      status: daysFromToday < 0 ? 'overdue' : daysFromToday === 0 ? 'today' : 'upcoming',
      daysFromToday,
    });
  }

  items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return {items, completed};
}

export function describeDue(item: Pick<ReviewItem, 'status' | 'daysFromToday' | 'dueAt'>): string {
  if (item.status === 'today') return 'Due today';
  if (item.status === 'overdue') return item.daysFromToday === -1 ? 'Overdue by 1 day' : `Overdue by ${-item.daysFromToday} days`;
  if (item.daysFromToday === 1) return 'Due tomorrow';
  if (item.daysFromToday < 7) return `Due in ${item.daysFromToday} days`;
  return `Due ${item.dueAt.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`;
}

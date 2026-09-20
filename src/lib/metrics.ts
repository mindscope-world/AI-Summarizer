import type {DocumentSummary, FeedbackEntry} from '../types';
import {dashboardStats, type DashboardStats} from './insights';

/**
 * Numbers for the Metrics tab. Everything is computed from what the signed-in student has actually
 * recorded (their summaries and their own ratings); nothing here is a constant.
 */

export interface RatingSummary {
  count: number;
  /** Mean of the ratings, or null when there are none. */
  average: number | null;
  /** Number of ratings of 1, 2, 3, 4 and 5 stars (index 0 = one star). */
  distribution: [number, number, number, number, number];
  /** Ratings the student allowed to be used as examples. */
  consentedCount: number;
}

export function ratingSummary(entries: FeedbackEntry[]): RatingSummary {
  const distribution: RatingSummary['distribution'] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const e of entries) {
    if (e.rating >= 1 && e.rating <= 5) {
      distribution[e.rating - 1]++;
      total += e.rating;
    }
  }
  const count = distribution.reduce((a, b) => a + b, 0);
  return {count, average: count ? total / count : null, distribution, consentedCount: entries.filter((e) => e.consent).length};
}

export type RatingDimension = 'model' | 'mode' | 'length' | 'language' | 'examples';

export interface GroupAverage {
  value: string;
  responses: number;
  average: number;
}

const valueOf = (e: FeedbackEntry, dimension: RatingDimension): string => {
  switch (dimension) {
    case 'model':
      return e.model || 'unknown';
    case 'examples':
      return e.params.usedExamples ? 'with examples' : 'without examples';
    default:
      return e.params[dimension] || 'unknown';
  }
};

/** Average rating per value of one dimension (per model, per length, ...), most-rated first. */
export function averageBy(entries: FeedbackEntry[], dimension: RatingDimension): GroupAverage[] {
  const groups = new Map<string, number[]>();
  for (const e of entries) {
    const key = valueOf(e, dimension);
    groups.set(key, [...(groups.get(key) ?? []), e.rating]);
  }
  return [...groups.entries()]
    .map(([value, ratings]) => ({value, responses: ratings.length, average: ratings.reduce((a, b) => a + b, 0) / ratings.length}))
    .sort((a, b) => b.responses - a.responses || a.value.localeCompare(b.value));
}

/** "3.2s" -> 3.2. The summarizer records its run time in that form. */
export function parseSeconds(value: string | undefined): number | null {
  const m = value?.trim().match(/^(\d+(?:\.\d+)?)\s*s$/i);
  return m ? Number(m[1]) : null;
}

export interface UsageMetrics extends DashboardStats {
  /** Mean time the summarizer took, over the summaries that recorded it. */
  averageSeconds: number | null;
  slowestSeconds: number | null;
  timedCount: number;
  /** How many summaries came from each model. */
  byModel: {model: string; count: number}[];
  /** How many summaries were made with the student's own examples in the prompt. */
  withExamples: number;
}

export function usageMetrics(docs: DocumentSummary[]): UsageMetrics {
  const seconds = docs.map((d) => parseSeconds(d.sourceMetadata?.processingTime)).filter((s): s is number => s !== null);
  const models = new Map<string, number>();
  for (const d of docs) {
    const model = d.sourceMetadata?.modelUsed;
    if (model) models.set(model, (models.get(model) ?? 0) + 1);
  }
  return {
    ...dashboardStats(docs),
    averageSeconds: seconds.length ? seconds.reduce((a, b) => a + b, 0) / seconds.length : null,
    slowestSeconds: seconds.length ? Math.max(...seconds) : null,
    timedCount: seconds.length,
    byModel: [...models.entries()].map(([model, count]) => ({model, count})).sort((a, b) => b.count - a.count || a.model.localeCompare(b.model)),
    withExamples: docs.filter((d) => (d.sourceMetadata?.examplesUsed ?? 0) > 0).length,
  };
}

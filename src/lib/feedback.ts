import type {SupabaseClient} from '@supabase/supabase-js';
import type {FeedbackAggregate, FeedbackEntry, FeedbackInput, FeedbackParams, FeedbackRole, SummaryExample} from '../types';

/**
 * Ratings on summaries, kept in the `feedback` table (see supabase/migrations). Like the document
 * repository this talks to Supabase straight from the browser: Row Level Security keeps each
 * person's ratings private, and the only cross-user numbers are the faculty-only aggregates.
 */
export interface FeedbackRepository {
  /** Every rating the signed-in user has given. */
  mine(): Promise<FeedbackEntry[]>;
  /** Creates the rating for this summary or replaces the one already given. */
  submit(input: FeedbackInput): Promise<FeedbackEntry>;
  /** The user's own consented, well-rated summaries in this category and language, best first. */
  examples(options: {category: string; language: string; limit?: number}): Promise<SummaryExample[]>;
  /** Averages over everyone's ratings, or null when the account is not faculty. */
  aggregates(): Promise<FeedbackAggregate[] | null>;
}

interface FeedbackRow {
  id: string;
  document_id: string | null;
  rating: number;
  comment: string;
  consent: boolean;
  model: string | null;
  params: FeedbackParams | null;
  role: FeedbackRole | null;
  created_at: string;
}

const toEntry = (row: FeedbackRow): FeedbackEntry => ({
  id: row.id,
  documentId: row.document_id,
  rating: row.rating,
  comment: row.comment,
  consent: row.consent,
  model: row.model ?? undefined,
  params: row.params ?? {},
  role: row.role ?? undefined,
  createdAt: row.created_at,
});

/** How much of one earlier summary goes into a prompt as an example. Keeps the prompt (and cost) small. */
export const EXAMPLE_MAX_CHARS = 1500;
/** Only summaries rated this high or higher are used as examples. */
export const EXAMPLE_MIN_RATING = 4;

interface ExampleRow {
  rating: number;
  documents: {
    title: string;
    summaries: {language: string; body: {contentParagraphs?: string[]; bulletPoints?: {title: string; text: string}[]}}[] | null;
  } | null;
}

/** Turns a stored summary into the short text shown to the model. */
export function exampleText(body: {contentParagraphs?: string[]; bulletPoints?: {title: string; text: string}[]}): string {
  const parts = [...(body.contentParagraphs ?? []), ...(body.bulletPoints ?? []).map((b) => `- ${b.title} ${b.text}`)];
  const text = parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return text.length > EXAMPLE_MAX_CHARS ? `${text.slice(0, EXAMPLE_MAX_CHARS - 3).trimEnd()}...` : text;
}

export function createFeedbackRepository(client: SupabaseClient, userId: string): FeedbackRepository {
  return {
    async mine() {
      const {data, error} = await client.from('feedback').select('*').order('created_at', {ascending: false});
      if (error) throw new Error(`Could not load your ratings: ${error.message}`);
      return (data as FeedbackRow[]).map(toEntry);
    },

    async submit(input) {
      const rating = Math.round(input.rating);
      if (!(rating >= 1 && rating <= 5)) throw new Error('Choose a rating from 1 to 5.');
      const {data, error} = await client
        .from('feedback')
        .upsert(
          {
            user_id: userId,
            document_id: input.documentId,
            rating,
            comment: input.comment.trim().slice(0, 5000),
            consent: input.consent,
            model: input.model ?? null,
            params: input.params,
            role: input.role,
          },
          {onConflict: 'user_id,document_id'},
        )
        .select()
        .single();
      if (error) throw new Error(`Could not save your rating: ${error.message}`);
      return toEntry(data as FeedbackRow);
    },

    async examples({category, language, limit = 2}) {
      const {data, error} = await client
        .from('feedback')
        .select('rating, documents!inner(title, category, summaries(language, body))')
        .eq('consent', true)
        .gte('rating', EXAMPLE_MIN_RATING)
        .eq('documents.category', category)
        .order('rating', {ascending: false})
        .order('created_at', {ascending: false})
        .limit(limit * 3);
      if (error) throw new Error(`Could not load examples: ${error.message}`);

      const out: SummaryExample[] = [];
      for (const row of (data ?? []) as unknown as ExampleRow[]) {
        const summary = row.documents?.summaries?.find((s) => s.language === language);
        const text = summary ? exampleText(summary.body) : '';
        if (row.documents && text) out.push({title: row.documents.title, text});
        if (out.length >= limit) break;
      }
      return out;
    },

    async aggregates() {
      const {data, error} = await client.rpc('feedback_aggregates');
      if (error) {
        // 42501 = insufficient privilege: the account is not faculty. Not a failure, just no report.
        if (error.code === '42501') return null;
        throw new Error(`Could not load the feedback report: ${error.message}`);
      }
      return ((data ?? []) as {dimension: FeedbackAggregate['dimension']; value: string; responses: number | string; average_rating: number | string}[]).map((r) => ({
        dimension: r.dimension,
        value: r.value,
        responses: Number(r.responses),
        averageRating: Number(r.average_rating),
      }));
    },
  };
}

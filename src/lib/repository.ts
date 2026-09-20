import type {SupabaseClient} from '@supabase/supabase-js';
import type {CommentItem, DocumentReviewProgress, DocumentSummary, DiscussionQuestion, SourceMetadata} from '../types';

/**
 * Persistence for a signed-in user's documents. All access goes straight to Supabase from the
 * browser; what keeps students apart is Row Level Security (supabase/migrations), not this code.
 * The app works with one flat `DocumentSummary`, which is stored across several tables:
 * documents (metadata), summaries (structured body), comments, review_progress, and
 * document_sources (the large extracted text, fetched only when a document is opened).
 */

export interface DocumentRepository {
  /** Every document of the signed-in user, newest first. Source text is not included (see loadSourceText). */
  list(): Promise<DocumentSummary[]>;
  /** Stores a new document. `warnings` lists non-fatal problems (e.g. the original file could not be kept). */
  create(doc: DocumentSummary, options?: {originalFile?: File | null}): Promise<{warnings: string[]}>;
  /** Writes whatever changed since the last successful save of this document. */
  save(doc: DocumentSummary): Promise<void>;
  remove(id: string): Promise<void>;
  loadSourceText(id: string): Promise<string | null>;
}

export const LEGACY_STORAGE_KEY = 'leaderforge_summaries';

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Only reached on very old browsers; ids just need to be unique, not secret.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface SummaryBody {
  contentParagraphs: string[];
  bulletPoints: DocumentSummary['bulletPoints'];
  discussionQuestions: DiscussionQuestion[];
  warnings?: string[];
}

interface DocumentRow {
  id: string;
  title: string;
  category: string;
  category_color: DocumentSummary['categoryColor'];
  tags: string[];
  excerpt: string;
  prompt_question: string | null;
  emotional_tone: string;
  user_notes: string;
  current_discussion_index: number;
  source_metadata: SourceMetadata;
  created_at: string;
  updated_at: string;
  summaries?: SummaryRow[] | SummaryRow | null;
  comments?: CommentRow[] | null;
  review_progress?: ReviewRow[] | ReviewRow | null;
}
interface SummaryRow {
  body: SummaryBody;
  language: string;
}
interface CommentRow {
  id: string;
  author_name: string;
  avatar_url: string | null;
  body: string;
  created_at: string;
}
interface ReviewRow {
  progress: DocumentReviewProgress;
}

const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ---------------------------------------------------------------------------
// Display strings are derived from timestamps, never stored
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

export function timeAgoGroup(createdAt: string, now = Date.now()): DocumentSummary['timeAgoGroup'] {
  const age = now - new Date(createdAt).getTime();
  return age <= 7 * DAY ? 'Last 7 days' : age <= 30 * DAY ? 'Last 30 days' : 'Older';
}

export function dateBadge(createdAt: string, now = Date.now()): string {
  const d = new Date(createdAt);
  const days = Math.floor((now - d.getTime()) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

export function formatCreated(createdAt: string): string {
  const d = new Date(createdAt);
  return (
    d.toLocaleDateString('en-US', {month: 'long', day: '2-digit', year: 'numeric'}) +
    ' ' +
    d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'})
  );
}

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toDocument(row: DocumentRow, now = Date.now()): DocumentSummary {
  const summaries = asArray(row.summaries);
  const summary = summaries.find((s) => s.language === (row.source_metadata?.language ?? 'English')) ?? summaries[0];
  const body: SummaryBody = summary?.body ?? {contentParagraphs: [], bulletPoints: [], discussionQuestions: []};
  const comments: CommentItem[] = asArray(row.comments)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((c) => ({id: c.id, author: c.author_name, avatar: c.avatar_url ?? '', text: c.body, timestamp: relativeTime(c.created_at, now)}));
  const review = asArray(row.review_progress)[0]?.progress;

  return {
    id: row.id,
    title: row.title,
    dateBadge: dateBadge(row.created_at, now),
    timeAgoGroup: timeAgoGroup(row.created_at, now),
    category: row.category,
    categoryColor: row.category_color,
    tags: row.tags,
    excerpt: row.excerpt,
    createdDate: formatCreated(row.created_at),
    lastEditedDate: dateBadge(row.updated_at, now),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    emotionalTone: row.emotional_tone,
    promptQuestion: row.prompt_question ?? undefined,
    contentParagraphs: body.contentParagraphs ?? [],
    bulletPoints: body.bulletPoints ?? [],
    discussionQuestions: body.discussionQuestions ?? [],
    currentDiscussionIndex: row.current_discussion_index,
    userNotes: row.user_notes,
    comments,
    sourceMetadata: row.source_metadata ?? {},
    reviewProgress: review && Object.keys(review).length ? review : undefined,
    summaryWarnings: body.warnings?.length ? body.warnings : undefined,
  };
}

/** The four independently-saved parts of a document, as comparable strings. */
interface Parts {
  meta: Record<string, unknown>;
  summary: SummaryBody;
  review: DocumentReviewProgress | null;
  comments: CommentItem[];
}

function partsOf(doc: DocumentSummary): Parts {
  return {
    meta: {
      title: doc.title,
      category: doc.category,
      category_color: doc.categoryColor,
      tags: doc.tags,
      excerpt: doc.excerpt,
      prompt_question: doc.promptQuestion ?? null,
      emotional_tone: doc.emotionalTone,
      user_notes: doc.userNotes,
      current_discussion_index: Math.max(0, doc.currentDiscussionIndex),
      source_metadata: doc.sourceMetadata ?? {},
    },
    summary: {
      contentParagraphs: doc.contentParagraphs,
      bulletPoints: doc.bulletPoints,
      discussionQuestions: doc.discussionQuestions,
      warnings: doc.summaryWarnings ?? [],
    },
    review: doc.reviewProgress ?? null,
    comments: doc.comments,
  };
}

interface Snapshot {
  meta: string;
  summary: string;
  review: string;
  commentIds: Set<string>;
}

/** JSON with sorted keys: Postgres `jsonb` returns keys in its own order, which must not look like an edit. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

const snapshotOf = (doc: DocumentSummary): Snapshot => {
  const p = partsOf(doc);
  return {meta: stable(p.meta), summary: stable(p.summary), review: stable(p.review), commentIds: new Set(doc.comments.map((c) => c.id))};
};

function check<T>(res: {data?: T; error: {message: string} | null}, what: string): T {
  if (res.error) throw new Error(`Could not ${what}: ${res.error.message}`);
  return res.data as T;
}

const safeFileName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'document';

export interface AuthorInfo {
  fullName: string;
  avatarUrl: string;
}

export function createRepository(client: SupabaseClient, userId: string, author: AuthorInfo): DocumentRepository {
  /** What each document looked like at its last successful save, so only real changes are sent. */
  const saved = new Map<string, Snapshot>();

  async function insertComments(docId: string, comments: CommentItem[]) {
    if (!comments.length) return;
    check(
      await client.from('comments').insert(
        comments.map((c) => ({
          id: c.id,
          document_id: docId,
          user_id: userId,
          author_name: c.author || author.fullName,
          avatar_url: c.avatar || null,
          body: c.text,
        })),
      ),
      'save the comment',
    );
  }

  return {
    async list() {
      const {data, error} = await client
        .from('documents')
        .select('*, summaries(*), comments(*), review_progress(*)')
        .order('created_at', {ascending: false});
      if (error) throw new Error(`Could not load your summaries: ${error.message}`);
      const docs = (data as DocumentRow[]).map((row) => toDocument(row));
      for (const doc of docs) saved.set(doc.id, snapshotOf(doc));
      return docs;
    },

    async create(doc, {originalFile} = {}) {
      const warnings: string[] = [];
      const parts = partsOf(doc);
      check(
        await client.from('documents').insert({id: doc.id, user_id: userId, ...parts.meta, ...(doc.createdAt ? {created_at: doc.createdAt} : {})}),
        'save the summary',
      );
      try {
        if (doc.sourceText) check(await client.from('document_sources').insert({document_id: doc.id, user_id: userId, text: doc.sourceText}), 'save the source text');
        check(
          await client.from('summaries').insert({
            document_id: doc.id,
            user_id: userId,
            language: doc.sourceMetadata?.language ?? 'English',
            model: doc.sourceMetadata?.modelUsed ?? null,
            body: parts.summary,
          }),
          'save the summary',
        );
        if (parts.review) check(await client.from('review_progress').insert({document_id: doc.id, user_id: userId, progress: parts.review}), 'save review progress');
        await insertComments(doc.id, doc.comments);
      } catch (err) {
        // Don't leave a half-saved document behind.
        await client.from('documents').delete().eq('id', doc.id);
        throw err;
      }
      saved.set(doc.id, snapshotOf(doc));

      if (originalFile) {
        const path = `${userId}/${doc.id}/${safeFileName(originalFile.name)}`;
        const {error} = await client.storage.from('uploads').upload(path, originalFile, {contentType: originalFile.type || undefined});
        if (error) warnings.push('The summary was saved, but the original file could not be kept.');
        else await client.from('documents').update({original_file_path: path}).eq('id', doc.id);
      }
      return {warnings};
    },

    async save(doc) {
      const before = saved.get(doc.id);
      const now = snapshotOf(doc);
      const parts = partsOf(doc);

      if (!before || before.meta !== now.meta) check(await client.from('documents').update(parts.meta).eq('id', doc.id), 'save your changes');
      if (!before || before.summary !== now.summary) {
        check(
          await client.from('summaries').upsert(
            {
              document_id: doc.id,
              user_id: userId,
              language: doc.sourceMetadata?.language ?? 'English',
              model: doc.sourceMetadata?.modelUsed ?? null,
              body: parts.summary,
            },
            {onConflict: 'document_id,language'},
          ),
          'save your changes',
        );
      }
      if (parts.review && (!before || before.review !== now.review)) {
        check(await client.from('review_progress').upsert({document_id: doc.id, user_id: userId, progress: parts.review}, {onConflict: 'document_id'}), 'save review progress');
      }
      const known = before?.commentIds ?? new Set<string>();
      const added = doc.comments.filter((c) => !known.has(c.id));
      const removed = [...known].filter((id) => !now.commentIds.has(id));
      await insertComments(doc.id, added);
      if (removed.length) check(await client.from('comments').delete().in('id', removed), 'remove the comment');

      saved.set(doc.id, now);
    },

    async remove(id) {
      // Best effort: also drop the stored original. The row delete is what matters.
      const {data} = await client.from('documents').select('original_file_path').eq('id', id).maybeSingle();
      check(await client.from('documents').delete().eq('id', id), 'delete the summary');
      saved.delete(id);
      const path = (data as {original_file_path?: string | null} | null)?.original_file_path;
      if (path) await client.storage.from('uploads').remove([path]).catch(() => undefined);
    },

    async loadSourceText(id) {
      const {data, error} = await client.from('document_sources').select('text').eq('document_id', id).maybeSingle();
      if (error) throw new Error(`Could not load the source text: ${error.message}`);
      return (data as {text: string} | null)?.text ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// One-time import of summaries saved in this browser before accounts existed
// ---------------------------------------------------------------------------

/** Summaries this browser holds that the student made themselves (not the demo documents old versions shipped with). */
export function readLegacyDocuments(demoIds: ReadonlySet<string>, storage: Pick<Storage, 'getItem'> = localStorage): DocumentSummary[] {
  try {
    const raw = storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is DocumentSummary =>
        !!d && typeof d === 'object' && typeof d.id === 'string' && typeof d.title === 'string' && Array.isArray(d.contentParagraphs) && !demoIds.has(d.id),
    );
  } catch {
    return [];
  }
}

/** Gives a legacy document fresh ids (the old ones are not UUIDs) and a real timestamp. */
export function upgradeLegacy(doc: DocumentSummary): DocumentSummary {
  const parsed = Date.parse(doc.createdDate);
  const createdAt = Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  return {
    ...doc,
    id: isUuid(doc.id) ? doc.id : newId(),
    createdAt,
    category: doc.category ?? '',
    tags: doc.tags ?? [],
    bulletPoints: (doc.bulletPoints ?? []).map(({title, text, reviewed}) => ({title, text, ...(reviewed ? {reviewed} : {})})),
    discussionQuestions: (doc.discussionQuestions ?? []).map((q) => ({...q, id: q.id || newId()})),
    comments: (doc.comments ?? []).map((c) => ({...c, id: isUuid(c.id) ? c.id : newId()})),
    currentDiscussionIndex: Math.max(0, doc.currentDiscussionIndex ?? 0),
  };
}

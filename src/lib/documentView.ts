import {TRANSLATION_LANGUAGES, type DocumentSummary, type ExportDocument, type TranslateRequest, type TranslationLanguage} from '../types';

/** The language a document's own summary is written in (what the summarizer was asked for). */
export function originalLanguage(doc: DocumentSummary): string {
  return doc.sourceMetadata?.language || 'English';
}

/** Languages the summary can be shown in: its own, then any translations. */
export function languagesOf(doc: DocumentSummary): string[] {
  return [originalLanguage(doc), ...Object.keys(doc.translations ?? {}).filter((l) => l !== originalLanguage(doc))];
}

/** Languages the summary could still be translated into (or re-translated into). */
export function translationTargets(doc: DocumentSummary): TranslationLanguage[] {
  return TRANSLATION_LANGUAGES.filter((l) => l !== originalLanguage(doc));
}

/** The prose of a summary in one language, ready to display or export. */
export interface ContentView {
  language: string;
  contentParagraphs: string[];
  bulletPoints: {title: string; text: string; reviewed?: boolean}[];
  discussionQuestions: {id: string; question: string; context: string}[];
  promptQuestion?: string;
  warnings: string[];
  model?: string;
  /** True when the summary changed after the translation was made (items were added), so some text is untranslated. */
  stale: boolean;
}

/**
 * The document's content in `language`. A translation lines up with the original by position, so
 * review ticks and the current question carry over. Items added after a translation was made
 * have no translation yet and show in the original language (`stale`).
 */
export function contentIn(doc: DocumentSummary, language: string): ContentView {
  const t = language === originalLanguage(doc) ? undefined : doc.translations?.[language];
  if (!t) {
    return {
      language: originalLanguage(doc),
      contentParagraphs: doc.contentParagraphs,
      bulletPoints: doc.bulletPoints,
      discussionQuestions: doc.discussionQuestions,
      promptQuestion: doc.promptQuestion,
      warnings: doc.summaryWarnings ?? [],
      model: doc.sourceMetadata?.modelUsed,
      stale: false,
    };
  }
  return {
    language,
    contentParagraphs: t.contentParagraphs,
    bulletPoints: doc.bulletPoints.map((b, i) => ({...(t.bulletPoints[i] ?? b), ...(b.reviewed ? {reviewed: true} : {})})),
    discussionQuestions: doc.discussionQuestions.map((q, i) => ({id: q.id, question: t.discussionQuestions[i]?.question ?? q.question, context: t.discussionQuestions[i]?.context ?? q.context})),
    promptQuestion: t.promptQuestion ?? doc.promptQuestion,
    warnings: t.warnings ?? [],
    model: t.model,
    stale: doc.bulletPoints.length !== t.bulletPoints.length || doc.discussionQuestions.length !== t.discussionQuestions.length,
  };
}

/** What to send to /api/translate for this document. */
export function toTranslateRequest(doc: DocumentSummary, target: TranslationLanguage): TranslateRequest {
  const source = originalLanguage(doc);
  return {
    targetLanguage: target,
    sourceLanguage: (TRANSLATION_LANGUAGES as readonly string[]).includes(source) ? (source as TranslationLanguage) : undefined,
    contentParagraphs: doc.contentParagraphs,
    bulletPoints: doc.bulletPoints.map(({title, text}) => ({title, text})),
    discussionQuestions: doc.discussionQuestions.map(({question, context}) => ({question, context})),
    promptQuestion: doc.promptQuestion || undefined,
  };
}

/** What to send to /api/export: the summary as shown in `language`, plus the student's own notes. */
export function toExportDocument(doc: DocumentSummary, language: string): ExportDocument {
  const view = contentIn(doc, language);
  const meta = doc.sourceMetadata;
  return {
    title: doc.title,
    category: doc.category || undefined,
    tags: doc.tags,
    createdDate: doc.createdDate || undefined,
    author: meta?.author,
    institution: meta?.institution,
    sourceName: meta?.fileName,
    language: view.language,
    model: view.model,
    originalWordCount: meta?.originalWordCount,
    summaryWordCount: meta?.summaryWordCount,
    reductionRate: meta?.reductionRate,
    contentParagraphs: view.contentParagraphs,
    bulletPoints: view.bulletPoints.map(({title, text}) => ({title, text})),
    discussionQuestions: view.discussionQuestions.map(({question, context}) => ({question, context})),
    userNotes: doc.userNotes || undefined,
    warnings: view.warnings.length ? view.warnings : undefined,
  };
}

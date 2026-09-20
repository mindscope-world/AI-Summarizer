export type NavigationTab = 'Landing' | 'Dashboard' | 'Programs' | 'Journal' | 'Scheduling' | 'Metrics';

export interface CommentItem {
  id: string;
  author: string;
  avatar: string;
  text: string;
  timestamp: string;
}

export interface DiscussionQuestion {
  id: string;
  question: string;
  context: string;
}

export interface SourceMetadata {
  fileName?: string;
  fileType?: 'PDF' | 'DOCX' | 'TXT' | 'WEB' | 'NOTE';
  author?: string;
  institution?: string;
  courseCode?: string;
  originalWordCount?: number;
  summaryWordCount?: number;
  reductionRate?: string;
  modelUsed?: string;
  processingTime?: string;
  language?: string;
  rougeScores?: {
    rouge1: number;
    rouge2: number;
    rougeL: number;
  };
}

export interface ReviewMilestoneTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  category: 'reading' | 'comprehension' | 'reflection' | 'verification';
}

export interface DocumentReviewProgress {
  scrollPercent: number;
  maxScrollPercent: number;
  reviewedBulletIndices: number[];
  completedTaskIds: string[];
  isFullyReviewed: boolean;
  lastReviewedAt?: string;
  preferredMode?: 'scroll' | 'tasks' | 'holistic';
}

export interface DocumentSummary {
  id: string;
  title: string;
  dateBadge: string;
  dateBadgeIcon?: 'calendar' | 'clock';
  timeAgoGroup: 'Last 7 days' | 'Last 30 days' | 'Older';
  category: string;
  categoryColor: 'peach' | 'blue' | 'purple' | 'mint' | 'amber';
  extraCount?: number;
  tags: string[];
  excerpt: string;
  createdDate: string;
  lastEditedDate?: string;
  emotionalTone: string;
  promptQuestion?: string;
  contentParagraphs: string[];
  bulletPoints: {
    title: string;
    text: string;
    reviewed?: boolean;
  }[];
  discussionQuestions: DiscussionQuestion[];
  currentDiscussionIndex: number;
  userNotes: string;
  comments: CommentItem[];
  sourceText?: string;
  sourceMetadata?: SourceMetadata;
  reviewProgress?: DocumentReviewProgress;
  /** Notes about this summary (e.g. figures that could not be found in the source). */
  summaryWarnings?: string[];
}

// ---------------------------------------------------------------------------
// API contract (shared by the Express server in /server and src/lib/api.ts)
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  uptimeSeconds: number;
  timestamp: string;
  /** Which open-weights models the server is configured to use (never credentials). */
  ai: {provider: 'groq'; model: string; ocrModel: string};
}

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'unprocessable'
  | 'upstream_error'
  | 'not_implemented'
  | 'internal_error';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: ApiErrorDetail[];
  };
}

// ---------------------------------------------------------------------------
// Ingestion / preprocessing (POST /api/extract)
// ---------------------------------------------------------------------------

export type SourceFormat = 'pdf' | 'docx' | 'txt' | 'md' | 'html' | 'text';

export interface ExtractionChunk {
  index: number;
  /** Character offsets into `ExtractionResult.text` (chunks overlap slightly). */
  start: number;
  end: number;
  tokenEstimate: number;
}

export interface DetectedLanguage {
  code: 'en' | 'sw' | 'fr' | 'other' | 'und';
  /** ISO 639-3 code from the detector when known (e.g. "eng", "swh"). */
  iso3?: string;
  name: string;
  /** Share (0-1) of the sampled text that agreed with `code`. */
  confidence: number;
  /** True when a second language makes up a substantial part of the text. */
  mixed: boolean;
}

export interface ExtractionResult {
  /** Cleaned, normalised plain text; paragraphs separated by a blank line. */
  text: string;
  wordCount: number;
  charCount: number;
  source: {
    kind: 'file' | 'url' | 'text';
    format: SourceFormat;
    fileName?: string;
    url?: string;
    title?: string;
    author?: string;
    siteName?: string;
    pageCount?: number;
    /** True when the text came from OCR because the PDF had no text layer. */
    ocrUsed: boolean;
  };
  language: DetectedLanguage;
  stats: {paragraphs: number; sentences: number; chunks: number};
  chunks: ExtractionChunk[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Summarization (POST /api/summarize, POST /api/questions)
// ---------------------------------------------------------------------------

export type SummaryMode = 'abstractive' | 'extractive';
export type SummaryLength = 'concise' | 'balanced' | 'detailed';
export type SummaryLanguage = 'English' | 'Swahili';

export const SUMMARY_TONES = ['Optimistic', 'Analytical & Rigorous', 'Reflective', 'Action-Oriented', 'Critical Review'] as const;

export interface SummaryResult {
  title: string;
  contentParagraphs: string[];
  bulletPoints: {title: string; text: string}[];
  discussionQuestions: {question: string; context: string}[];
  promptQuestion: string;
  emotionalTone: string;
  tags: string[];
  excerpt: string;
  metadata: {
    model: string;
    mode: SummaryMode;
    length: SummaryLength;
    language: SummaryLanguage;
    originalWordCount: number;
    summaryWordCount: number;
    /** e.g. "94%": how much shorter the summary is than the source. */
    reductionRate: string;
    /** How many sections a long document was split into (1 = summarised in one go). */
    sections: number;
    processingSeconds: number;
  };
  /** Things the reader should double-check (ungrounded figures, degraded features). */
  warnings: string[];
}

export interface SummarizeProgress {
  stage: 'prepare' | 'sections' | 'waiting' | 'synthesize' | 'verify';
  message: string;
  /** 0-100, monotonic within a run. */
  percent: number;
  current?: number;
  total?: number;
}

/** Events streamed by POST /api/summarize when the client asks for text/event-stream. */
export type SummarizeEvent =
  | ({type: 'progress'} & SummarizeProgress)
  | {type: 'result'; result: SummaryResult}
  | {type: 'error'; error: ApiErrorBody['error']};

export interface GeneratedQuestion {
  question: string;
  context: string;
}

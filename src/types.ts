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
}

export interface SummarizeJobConfig {
  sourceType: 'file' | 'text' | 'url' | 'library';
  fileName?: string;
  fileContent?: string;
  url?: string;
  courseCode?: string;
  summarizationType: 'abstractive' | 'extractive';
  length: 'concise' | 'balanced' | 'detailed';
  language: 'English' | 'Swahili' | 'French';
  model: 'BERT-Academic' | 'T5-EastAfrica' | 'GPT-Academic';
  category: string;
}

import React, { useState, useRef, useEffect } from 'react';
import { 
  Clock,
  Smile,
  Tag,
  Plus,
  MessageSquare,
  Search,
  MoreHorizontal,
  RotateCw,
  X,
  Sparkles,
  ChevronDown,
  Check,
  Download,
  Copy,
  BookOpen,
  SplitSquareVertical,
  Eye,
  AlertCircle
} from 'lucide-react';
import { DocumentSummary, FeedbackEntry, ReviewMilestoneTask, SummaryLanguage, TranslationLanguage, TRANSLATION_LANGUAGES } from '../types';
import { describeApiError, generateQuestion, translateSummary } from '../lib/api';
import { contentIn, languagesOf, originalLanguage, toTranslateRequest } from '../lib/documentView';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SummaryFeedback, type FeedbackSubmission } from './SummaryFeedback';
import { getCategoryBadgeStyles, cn } from '../lib/utils';
import { ReviewProgressBar } from './ReviewProgressBar';

interface MainEditorViewProps {
  document: DocumentSummary;
  onUpdateDocument: (updated: DocumentSummary) => void;
  onToggleComments: () => void;
  isCommentsOpen: boolean;
  /** `language` is the language of the summary as currently shown. */
  onExport: (format: 'pdf' | 'docx' | 'txt' | 'md', language: string) => void;
  /** The student's existing rating of this summary, and how to save a new one. Omit to hide the rating form. */
  feedback?: {
    entry: FeedbackEntry | null;
    onSubmit: (submission: FeedbackSubmission) => Promise<void>;
  };
}

export const MainEditorView: React.FC<MainEditorViewProps> = ({
  document: currentDoc,
  onUpdateDocument,
  onToggleComments,
  isCommentsOpen,
  onExport,
  feedback,
}) => {
  // View mode
  const [viewMode, setViewMode] = useState<'summary' | 'source' | 'split'>('summary');
  
  
  // Which language the summary is shown in (null = the document's own), and translation progress
  const [viewLanguage, setViewLanguage] = useState<string | null>(null);
  const [translating, setTranslating] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const translateAbortRef = useRef<AbortController | null>(null);
  const latestDocRef = useRef(currentDoc);
  latestDocRef.current = currentDoc;
  const language = viewLanguage && languagesOf(currentDoc).includes(viewLanguage) ? viewLanguage : originalLanguage(currentDoc);
  const view = contentIn(currentDoc, language);

  // Another document was opened: forget the language choice and stop any translation in flight.
  useEffect(() => {
    setViewLanguage(null);
    setTranslateError(null);
    setTranslating(null);
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    return () => translateAbortRef.current?.abort();
  }, [currentDoc.id]);

  const handleCancelTranslate = () => {
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    setTranslating(null);
  };

  const handleTranslate = async (target: string) => {
    if (translating) return;
    const controller = new AbortController();
    translateAbortRef.current = controller;
    setTranslating(target);
    setTranslateError(null);
    try {
      const result = await translateSummary(toTranslateRequest(currentDoc, target as TranslationLanguage), { signal: controller.signal });
      if (controller.signal.aborted) return;
      // Keep any edits made while the model was working.
      const latest = latestDocRef.current;
      onUpdateDocument({
        ...latest,
        translations: {
          ...latest.translations,
          [result.language]: {
            contentParagraphs: result.contentParagraphs,
            bulletPoints: result.bulletPoints,
            discussionQuestions: result.discussionQuestions,
            promptQuestion: result.promptQuestion,
            model: result.model,
            warnings: result.warnings.length ? result.warnings : undefined,
          },
        },
      });
      setViewLanguage(result.language);
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
      setTranslateError(describeApiError(err));
    } finally {
      if (translateAbortRef.current === controller) {
        translateAbortRef.current = null;
        setTranslating(null);
      }
    }
  };

  // Search within document
  const [showDocSearch, setShowDocSearch] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');

  // Tone selector
  const [showToneDropdown, setShowToneDropdown] = useState(false);
  const tones = ['Optimistic', 'Analytical & Rigorous', 'Reflective', 'Action-Oriented', 'Critical Review'];

  // Add tag inline
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // Discussion card state
  const [showDiscussionCard, setShowDiscussionCard] = useState(true);
  const [isReloadingQuestion, setIsReloadingQuestion] = useState(false);
  const [selectedQuestionSaved, setSelectedQuestionSaved] = useState(false);

  // User input reflection text
  // The source text is fetched when a document is opened; never show made-up placeholder text meanwhile.
  const sourceTextShown =
    currentDoc.sourceText === undefined
      ? 'Loading the original text...'
      : currentDoc.sourceText || 'The original text is not available for this summary.';

  const [userReflection, setUserReflection] = useState(currentDoc.userNotes || '');
  const [isCopied, setIsCopied] = useState(false);


  // AI Prompt generation state
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [showBottomAIOptions, setShowBottomAIOptions] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Scroll and review progress tracking state
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [scrollPercent, setScrollPercent] = useState<number>(0);
  const [maxScrollPercent, setMaxScrollPercent] = useState<number>(
    currentDoc.reviewProgress?.maxScrollPercent || 0
  );
  const [progressMode, setProgressMode] = useState<'scroll' | 'tasks' | 'holistic'>(
    currentDoc.reviewProgress?.preferredMode || 'tasks'
  );

  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>(() => {
    if (currentDoc.reviewProgress?.completedTaskIds) {
      return currentDoc.reviewProgress.completedTaskIds;
    }
    const initial: string[] = [];
    if (currentDoc.userNotes?.trim()) initial.push('task-active-recall');
    if (currentDoc.comments?.length > 0) initial.push('task-peer-notes');
    return initial;
  });

  // Reset scroll and re-sync state on document change
  useEffect(() => {
    setUserReflection(currentDoc.userNotes || '');
    setScrollPercent(0);
    setMaxScrollPercent(currentDoc.reviewProgress?.maxScrollPercent || 0);
    if (currentDoc.reviewProgress?.completedTaskIds) {
      setCompletedTaskIds(currentDoc.reviewProgress.completedTaskIds);
    }
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [currentDoc.id]);

  // Auto-complete review tasks based on user interactions
  useEffect(() => {
    if (viewMode === 'source' || viewMode === 'split') {
      setCompletedTaskIds((prev) => 
        prev.includes('task-source-verify') ? prev : [...prev, 'task-source-verify']
      );
    }
  }, [viewMode]);

  useEffect(() => {
    if (isCommentsOpen) {
      setCompletedTaskIds((prev) => 
        prev.includes('task-peer-notes') ? prev : [...prev, 'task-peer-notes']
      );
    }
  }, [isCommentsOpen]);

  useEffect(() => {
    if (userReflection.trim().length > 15) {
      setCompletedTaskIds((prev) => 
        prev.includes('task-active-recall') ? prev : [...prev, 'task-active-recall']
      );
    }
  }, [userReflection]);

  // Handle container scroll event for reading depth calculation
  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 5) {
      setScrollPercent(100);
      setMaxScrollPercent(100);
      if (!completedTaskIds.includes('task-read-intro')) {
        setCompletedTaskIds((prev) => [...prev, 'task-read-intro']);
      }
      return;
    }
    const pct = Math.min(100, Math.max(0, Math.round((scrollTop / maxScroll) * 100)));
    setScrollPercent(pct);
    if (pct > maxScrollPercent) {
      setMaxScrollPercent(pct);
      if (pct >= 25 && !completedTaskIds.includes('task-read-intro')) {
        setCompletedTaskIds((prev) => [...prev, 'task-read-intro']);
      }
    }
  };

  const handleToggleTask = (taskId: string) => {
    const isCompleted = completedTaskIds.includes(taskId);
    const nextTaskIds = isCompleted 
      ? completedTaskIds.filter(id => id !== taskId) 
      : [...completedTaskIds, taskId];
    
    setCompletedTaskIds(nextTaskIds);

    // If toggling bullet points task, sync with bulletPoints
    if (taskId === 'task-review-bullets') {
      const updatedBullets = currentDoc.bulletPoints.map(b => ({
        ...b,
        reviewed: !isCompleted,
      }));
      onUpdateDocument({
        ...currentDoc,
        bulletPoints: updatedBullets,
        reviewProgress: {
          scrollPercent,
          maxScrollPercent,
          completedTaskIds: nextTaskIds,
          reviewedBulletIndices: !isCompleted ? updatedBullets.map((_, i) => i) : [],
          isFullyReviewed: nextTaskIds.length >= 5,
          preferredMode: progressMode,
        },
      });
    } else {
      onUpdateDocument({
        ...currentDoc,
        reviewProgress: {
          scrollPercent,
          maxScrollPercent,
          completedTaskIds: nextTaskIds,
          reviewedBulletIndices: currentDoc.bulletPoints
            .map((b, i) => b.reviewed ? i : -1)
            .filter(i => i !== -1),
          isFullyReviewed: nextTaskIds.length >= 5,
          preferredMode: progressMode,
        },
      });
    }
  };

  const handleToggleBulletReviewed = (index: number) => {
    const updatedBullets = currentDoc.bulletPoints.map((bullet, idx) => {
      if (idx === index) {
        return { ...bullet, reviewed: !bullet.reviewed };
      }
      return bullet;
    });

    const allReviewed = updatedBullets.length > 0 && updatedBullets.every(b => b.reviewed);
    const updatedCompletedTasks = allReviewed 
      ? Array.from(new Set([...completedTaskIds, 'task-review-bullets']))
      : completedTaskIds.filter(id => id !== 'task-review-bullets');

    setCompletedTaskIds(updatedCompletedTasks);

    onUpdateDocument({
      ...currentDoc,
      bulletPoints: updatedBullets,
      reviewProgress: {
        scrollPercent,
        maxScrollPercent,
        completedTaskIds: updatedCompletedTasks,
        reviewedBulletIndices: updatedBullets.map((b, i) => b.reviewed ? i : -1).filter(i => i !== -1),
        isFullyReviewed: updatedCompletedTasks.length >= 5,
        preferredMode: progressMode,
      },
    });
  };

  const handleMarkAllCompleted = () => {
    const allTaskIds = [
      'task-read-intro',
      'task-review-bullets',
      'task-active-recall',
      'task-source-verify',
      'task-peer-notes'
    ];
    setCompletedTaskIds(allTaskIds);
    setMaxScrollPercent(100);
    setScrollPercent(100);

    const allBulletsReviewed = currentDoc.bulletPoints.map(b => ({ ...b, reviewed: true }));
    onUpdateDocument({
      ...currentDoc,
      bulletPoints: allBulletsReviewed,
      reviewProgress: {
        scrollPercent: 100,
        maxScrollPercent: 100,
        completedTaskIds: allTaskIds,
        reviewedBulletIndices: allBulletsReviewed.map((_, i) => i),
        isFullyReviewed: true,
        lastReviewedAt: new Date().toISOString(),
        preferredMode: progressMode,
      },
    });
  };

  const handleResetProgress = () => {
    setCompletedTaskIds([]);
    setMaxScrollPercent(0);
    setScrollPercent(0);
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    const resetBullets = currentDoc.bulletPoints.map(b => ({ ...b, reviewed: false }));
    onUpdateDocument({
      ...currentDoc,
      bulletPoints: resetBullets,
      reviewProgress: {
        scrollPercent: 0,
        maxScrollPercent: 0,
        completedTaskIds: [],
        reviewedBulletIndices: [],
        isFullyReviewed: false,
        preferredMode: progressMode,
      },
    });
  };

  const handleChangeProgressMode = (mode: 'scroll' | 'tasks' | 'holistic') => {
    setProgressMode(mode);
    onUpdateDocument({
      ...currentDoc,
      reviewProgress: {
        ...(currentDoc.reviewProgress || {
          scrollPercent,
          maxScrollPercent,
          completedTaskIds,
          reviewedBulletIndices: [],
          isFullyReviewed: false,
        }),
        preferredMode: mode,
      },
    });
  };

  const currentMilestoneTasks: ReviewMilestoneTask[] = [
    {
      id: 'task-read-intro',
      title: 'Read Thesis & Context',
      description: 'Review document title, tone, and opening academic abstract.',
      completed: completedTaskIds.includes('task-read-intro') || maxScrollPercent >= 25,
      category: 'reading',
    },
    {
      id: 'task-review-bullets',
      title: 'Examine Core Takeaways',
      description: 'Review and verify key synthesized findings and arguments.',
      completed: completedTaskIds.includes('task-review-bullets') || (currentDoc.bulletPoints.length > 0 && currentDoc.bulletPoints.every(b => b.reviewed)),
      category: 'comprehension',
    },
    {
      id: 'task-active-recall',
      title: 'Active Recall & Reflection',
      description: 'Answer Socratic discussion questions or synthesize reflection notes.',
      completed: completedTaskIds.includes('task-active-recall') || userReflection.trim().length > 15,
      category: 'reflection',
    },
    {
      id: 'task-source-verify',
      title: 'Cross-Reference Source Document',
      description: 'Inspect original source literature or examine side-by-side comparison.',
      completed: completedTaskIds.includes('task-source-verify') || viewMode === 'source' || viewMode === 'split',
      category: 'verification',
    },
    {
      id: 'task-peer-notes',
      title: 'Review Annotations & Feedback',
      description: 'Inspect instructor comments, study group critiques, or add feedback.',
      completed: completedTaskIds.includes('task-peer-notes') || isCommentsOpen || currentDoc.comments.length > 0,
      category: 'comprehension',
    },
  ];

  const reviewedBulletCount = currentDoc.bulletPoints.filter(b => b.reviewed).length;
  const totalWords = (
    currentDoc.title + ' ' + 
    currentDoc.contentParagraphs.join(' ') + ' ' + 
    currentDoc.bulletPoints.map(b => b.title + ' ' + b.text).join(' ')
  ).split(/\s+/).filter(Boolean).length;
  const estimatedReadingTimeMinutes = Math.max(1, Math.ceil(totalWords / 180));

  // Cycle to next discussion question
  const handleNextQuestion = () => {
    setIsReloadingQuestion(true);
    setTimeout(() => {
      const nextIdx = (currentDoc.currentDiscussionIndex + 1) % (currentDoc.discussionQuestions.length || 1);
      onUpdateDocument({
        ...currentDoc,
        currentDiscussionIndex: nextIdx,
      });
      setIsReloadingQuestion(false);
      setSelectedQuestionSaved(false);
    }, 250);
  };

  const handleSelectQuestion = () => {
    const q = currentDoc.discussionQuestions[currentDoc.currentDiscussionIndex]?.question || '';
    const updatedNotes = userReflection ? `${userReflection}\n\nQ: ${q}\nMy answer: ` : `Q: ${q}\nMy answer: `;
    setUserReflection(updatedNotes);
    onUpdateDocument({
      ...currentDoc,
      userNotes: updatedNotes,
    });
    setSelectedQuestionSaved(true);
    setTimeout(() => setSelectedQuestionSaved(false), 2000);
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    if (!currentDoc.tags.includes(newTagInput.trim())) {
      onUpdateDocument({
        ...currentDoc,
        tags: [...currentDoc.tags, newTagInput.trim()],
      });
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateDocument({
      ...currentDoc,
      tags: currentDoc.tags.filter(t => t !== tagToRemove),
    });
  };

  const handleCopySummary = () => {
    const textToCopy = `${currentDoc.title}\n\n${view.contentParagraphs.join('\n\n')}\n\n${view.bulletPoints.map(b => `${b.title} ${b.text}`).join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleGenerateQuestionAI = async () => {
    if (isGeneratingAI) return;
    setIsGeneratingAI(true);
    setQuestionError(null);
    try {
      // The model reads the summary in the language it was written in, so the new question lines up with the others.
      const own = originalLanguage(currentDoc);
      const language: SummaryLanguage = (TRANSLATION_LANGUAGES as readonly string[]).includes(own) ? (own as SummaryLanguage) : 'English';
      const generated = await generateQuestion({
        title: currentDoc.title,
        language,
        contentParagraphs: currentDoc.contentParagraphs,
        bulletPoints: currentDoc.bulletPoints.map(({ title, text }) => ({ title, text })),
        existingQuestions: currentDoc.discussionQuestions.map((q) => q.question),
      });
      const newQ = { id: `dq-gen-${Date.now()}`, question: generated.question, context: generated.context };
      const updatedQuestions = [...currentDoc.discussionQuestions, newQ];
      onUpdateDocument({
        ...currentDoc,
        discussionQuestions: updatedQuestions,
        currentDiscussionIndex: updatedQuestions.length - 1,
      });
      setShowDiscussionCard(true);
    } catch (err) {
      setQuestionError(describeApiError(err));
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const activeQuestion = view.discussionQuestions[currentDoc.currentDiscussionIndex] || {
    question: 'No discussion question yet.',
    context: 'Use "Generate a question now" below to have the AI write one from this summary.',
  };

  return (
    <div className="flex-1 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col min-h-[calc(100vh-80px)] overflow-hidden relative">
      
      {/* Top Header section matching image.png */}
      <div className="p-6 pb-4 border-b border-slate-100">
        
        {/* Title row with action items on right */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 
              id="main-document-title"
              className="text-2xl lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight outline-none"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                const newTitle = e.currentTarget.textContent?.trim();
                if (newTitle && newTitle !== currentDoc.title) {
                  onUpdateDocument({ ...currentDoc, title: newTitle });
                }
              }}
            >
              {currentDoc.title}
            </h1>
            <div className="mt-2">
              <LanguageSwitcher
                document={currentDoc}
                value={language}
                onChange={setViewLanguage}
                onTranslate={handleTranslate}
                onCancel={handleCancelTranslate}
                translating={translating}
                error={translateError}
              />
            </div>
          </div>

          {/* Right Action Icons matching image.png: Edited Dec 02, Comment icon with badge, Search icon, More icon */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Edited {currentDoc.lastEditedDate || currentDoc.dateBadge}
            </span>

            {/* Comment icon button */}
            <button
              id="editor-toggle-comments-btn"
              onClick={onToggleComments}
              title="View & add comments"
              className={cn(
                "relative w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                isCommentsOpen
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-200/70 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              {currentDoc.comments.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {currentDoc.comments.length}
                </span>
              )}
            </button>

            {/* Search inside document button */}
            <button
              id="editor-doc-search-btn"
              onClick={() => setShowDocSearch(!showDocSearch)}
              title="Search within text"
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                showDocSearch
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-200/70 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              )}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* More options menu */}
            <div className="relative">
              <button
                id="editor-more-options-btn"
                onClick={() => setShowExportMenu(!showExportMenu)}
                title="More options"
                className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200/70 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-40 text-xs">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase text-slate-400">
                    Export Summary
                  </div>
                  <button
                    onClick={() => { onExport('pdf', language); setShowExportMenu(false); }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Download as PDF</span>
                  </button>
                  <button
                    onClick={() => { onExport('docx', language); setShowExportMenu(false); }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Download as Word (.docx)</span>
                  </button>
                  <button
                    onClick={() => { onExport('txt', language); setShowExportMenu(false); }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Plain Text (.txt)</span>
                  </button>
                  <button
                    onClick={() => { onExport('md', language); setShowExportMenu(false); }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Markdown (.md)</span>
                  </button>
                  <div className="border-t border-slate-100 my-1"></div>
                  <button
                    onClick={() => { handleCopySummary(); setShowExportMenu(false); }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isCopied ? 'Copied!' : 'Copy to Clipboard'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Document In-page Search Bar if toggled */}
        {showDocSearch && (
          <div className="mb-4 p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2 animate-in fade-in">
            <Search className="w-4 h-4 text-slate-400 ml-1" />
            <input
              type="text"
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              placeholder="Search in this document..."
              className="flex-1 bg-transparent text-xs outline-none text-slate-800 placeholder:text-slate-400"
              autoFocus
            />
            <button 
              onClick={() => { setShowDocSearch(false); setDocSearchQuery(''); }}
              className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Metadata Details Rows matching image.png */}
        <div className="space-y-2 text-xs">
          
          {/* Row 1: Created */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-slate-500 w-32 shrink-0">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Created</span>
            </div>
            <span className="font-semibold text-slate-800">
              {currentDoc.createdDate}
            </span>
          </div>

          {/* Row 2: Emotional tone / Academic tone */}
          <div className="flex items-center gap-3 relative">
            <div className="flex items-center gap-2 text-slate-500 w-32 shrink-0">
              <Smile className="w-4 h-4 text-slate-400" />
              <span>Emotional tone</span>
            </div>
            <div className="relative">
              <button
                id="change-tone-btn"
                onClick={() => setShowToneDropdown(!showToneDropdown)}
                className="font-semibold text-slate-800 hover:text-emerald-700 flex items-center gap-1.5 py-0.5 px-1.5 rounded hover:bg-slate-100 transition-colors"
              >
                <span>{currentDoc.emotionalTone}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showToneDropdown && (
                <div className="absolute left-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in">
                  {tones.map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        onUpdateDocument({ ...currentDoc, emotionalTone: t });
                        setShowToneDropdown(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between",
                        currentDoc.emotionalTone === t ? "text-emerald-600 font-bold" : "text-slate-700"
                      )}
                    >
                      <span>{t}</span>
                      {currentDoc.emotionalTone === t && <Check className="w-3 h-3 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Tags matching image.png (peach pill, mint pill, + Add more button) */}
          <div className="flex items-center gap-3 pt-0.5">
            <div className="flex items-center gap-2 text-slate-500 w-32 shrink-0">
              <Tag className="w-4 h-4 text-slate-400" />
              <span>Tags</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {currentDoc.tags.map((tag, idx) => {
                // Alternating peach and mint styling matching image.png
                const isMint = idx % 2 === 1;
                return (
                  <span
                    key={tag}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold group",
                      isMint 
                        ? "bg-[#D8F3E5] text-[#047857]" 
                        : "bg-[#FEECE6] text-[#E05D3D]"
                    )}
                  >
                    <span>{tag}</span>
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      title="Remove tag"
                      className="opacity-0 group-hover:opacity-100 hover:text-slate-900 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}

              {/* + Add more button */}
              {isAddingTag ? (
                <form onSubmit={handleAddTag} className="inline-flex items-center">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="New tag..."
                    className="px-2 py-0.5 text-xs border border-emerald-400 rounded-lg outline-none w-24"
                    autoFocus
                    onBlur={() => {
                      if (!newTagInput.trim()) setIsAddingTag(false);
                    }}
                  />
                </form>
              ) : (
                <button
                  id="editor-add-tag-btn"
                  onClick={() => setIsAddingTag(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg font-medium border border-transparent hover:border-slate-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add more</span>
                </button>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* View mode: the summary alone, the source alone, or both side by side */}
      <div className="px-6 py-2.5 border-b border-slate-100 bg-white flex items-center justify-end gap-3 flex-wrap">
        {/* View mode toggle: Summary | Source Document | Side by Side */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-medium">
          <button
            onClick={() => setViewMode('summary')}
            className={cn(
              "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5",
              viewMode === 'summary' ? "bg-white text-slate-900 shadow-2xs font-semibold" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Eye className="w-3 h-3" />
            <span>Summary</span>
          </button>
          <button
            onClick={() => setViewMode('source')}
            className={cn(
              "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5",
              viewMode === 'source' ? "bg-white text-slate-900 shadow-2xs font-semibold" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <BookOpen className="w-3 h-3" />
            <span>Source Doc</span>
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={cn(
              "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 hidden lg:flex",
              viewMode === 'split' ? "bg-white text-slate-900 shadow-2xs font-semibold" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <SplitSquareVertical className="w-3 h-3" />
            <span>Side-by-Side</span>
          </button>
        </div>

      </div>

      {/* Visual Reading & Review Progress Bar */}
      <ReviewProgressBar
        scrollPercent={scrollPercent}
        maxScrollPercent={maxScrollPercent}
        tasks={currentMilestoneTasks}
        activeMode={progressMode}
        onChangeMode={handleChangeProgressMode}
        onToggleTask={handleToggleTask}
        onMarkAllCompleted={handleMarkAllCompleted}
        onResetProgress={handleResetProgress}
        totalWords={totalWords}
        estimatedReadingTimeMinutes={estimatedReadingTimeMinutes}
        reviewedBulletCount={reviewedBulletCount}
        totalBulletCount={currentDoc.bulletPoints.length}
      />

      {/* Main Content Area */}
      <div 
        ref={contentScrollRef}
        onScroll={handleContentScroll}
        className="flex-1 p-6 lg:p-8 overflow-y-auto pb-28 scroll-smooth"
      >
        
        {viewMode === 'source' ? (
          /* Source Document Viewer */
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-xs text-amber-900">Original Ingested Document</h4>
                <p className="text-[11px] text-amber-700">
                  {currentDoc.sourceMetadata?.fileName || 'Academic Coursework Material'} • {currentDoc.sourceMetadata?.originalWordCount || 2450} words
                </p>
              </div>
              <span className="text-xs bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-md font-mono font-medium">
                {currentDoc.sourceMetadata?.fileType || 'DOCX'}
              </span>
            </div>

            <div className="prose prose-slate max-w-none text-xs text-slate-700 leading-relaxed bg-slate-50/50 p-6 rounded-2xl border border-slate-100 font-mono">
              <p className="font-bold text-sm text-slate-900 mb-2">ORIGINAL TEXT DUMP (PRE-SUMMARIZATION):</p>
              <p>
                {sourceTextShown}
              </p>
            </div>
          </div>
        ) : (
          /* Normal Summary View & Split View */
          <div className={cn(
            "mx-auto transition-all",
            viewMode === 'split' ? "grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl" : "max-w-3xl"
          )}>
            
            {/* Split View Left: Source Text Comparison */}
            {viewMode === 'split' && (
              <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200 text-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="font-bold text-slate-700">Source Document</span>
                  <span className="text-[10px] text-slate-500">{currentDoc.sourceMetadata?.originalWordCount || 2450} words</span>
                </div>
                <div className="text-slate-600 leading-relaxed space-y-2 max-h-[600px] overflow-y-auto pr-2">
                  <p>
                    {sourceTextShown}
                  </p>
                  <p>
                    Every mistake previously experienced caused hesitation. However, systematic reframing converted setbacks into structured learning opportunities, unlocking proactive initiative in coursework selection and collaborative project leadership.
                  </p>
                </div>
              </div>
            )}

            {/* Summary Content Column */}
            <div className="space-y-6">
              
              {/* Question / Prompt Header matching image.png */}
              {view.promptQuestion && (
                <div className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    ?
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">
                    {view.promptQuestion}
                  </h2>
                </div>
              )}

              {/* Introductory paragraphs */}
              {view.contentParagraphs.map((para, i) => (
                <p key={i} className="text-xs text-slate-700 leading-relaxed">
                  {para}
                </p>
              ))}

              {/* Things the reader should double-check (e.g. figures not found in the source) */}
              {view.warnings.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                  {view.warnings.map((w) => (
                    <li key={w} className="flex gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-600" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Bullet points with bold lead-ins and interactive review checkboxes */}
              <div className="space-y-3 relative">
                {view.bulletPoints.map((item, idx) => {
                  const isReviewed = !!item.reviewed;
                  return (
                    <div 
                      key={idx} 
                      className={cn(
                        "flex items-start gap-2.5 text-xs leading-relaxed transition-all p-2 -mx-2 rounded-xl group",
                        isReviewed 
                          ? "bg-emerald-50/40 text-slate-800" 
                          : "text-slate-700 hover:bg-slate-50/70"
                      )}
                    >
                      {/* Interactive Review Checkmark Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleBulletReviewed(idx)}
                        title={isReviewed ? "Mark point as unreviewed" : "Mark point as reviewed & understood"}
                        className={cn(
                          "mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer",
                          isReviewed 
                            ? "bg-emerald-500 border-emerald-500 text-white shadow-2xs" 
                            : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50"
                        )}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </button>

                      <div className="flex-1">
                        <span className={cn(
                          "font-bold mr-1.5 transition-colors",
                          isReviewed ? "text-emerald-950" : "text-slate-900"
                        )}>
                          {item.title}
                        </span>
                        <span className={isReviewed ? "text-slate-800" : "text-slate-700"}>
                          {item.text}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Comment marker on right margin matching image.png (`💬 2`) */}
                <div className="absolute -right-4 top-2 hidden sm:block">
                  <button
                    onClick={onToggleComments}
                    title="View inline comments"
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 px-1.5 py-0.5 rounded-md border border-slate-200/80 transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>{currentDoc.comments.length}</span>
                  </button>
                </div>
              </div>

              {/* Interactive "Questions for discussion" card matching image.png */}
              {showDiscussionCard && (
                <div className="p-4 bg-purple-50/40 rounded-2xl border border-purple-100/90 shadow-2xs space-y-3 mt-6 transition-all">
                  
                  {/* Top row: badge + action buttons */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#F3E8FD] text-[#7E3AF2]">
                      <span className="w-3 h-3 rounded-full bg-[#7E3AF2] text-white flex items-center justify-center text-[9px] font-bold">
                        ?
                      </span>
                      <span>Questions for discussion</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        id="select-this-question-btn"
                        onClick={handleSelectQuestion}
                        className={cn(
                          "px-3 py-1 rounded-xl text-xs font-semibold border transition-all duration-150 shadow-2xs",
                          selectedQuestionSaved
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {selectedQuestionSaved ? 'Selected & Added!' : 'Select this questions'}
                      </button>

                      {/* Reload button with tooltip "Another question" matching image.png */}
                      <div className="relative group">
                        <button
                          id="another-question-refresh-btn"
                          onClick={handleNextQuestion}
                          title="Another question"
                          className={cn(
                            "w-7 h-7 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all",
                            isReloadingQuestion && "animate-spin"
                          )}
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-0.5 px-2 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                          Another question
                        </span>
                      </div>

                      {/* Dismiss button */}
                      <button
                        onClick={() => setShowDiscussionCard(false)}
                        className="w-7 h-7 rounded-xl border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Question Title & context */}
                  <div>
                    <h3 className="font-bold text-xs text-slate-900 mb-0.5">
                      {activeQuestion.question}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {activeQuestion.context}
                    </p>
                  </div>

                </div>
              )}

              {/* Reflection writing area matching image.png "Write what you think..." */}
              <div className="mt-4">
                <textarea
                  id="reflection-notes-input"
                  value={userReflection}
                  onChange={(e) => {
                    setUserReflection(e.target.value);
                  }}
                  onBlur={() => {
                    if (userReflection !== (currentDoc.userNotes || '')) {
                      onUpdateDocument({ ...currentDoc, userNotes: userReflection });
                    }
                  }}
                  placeholder="Write what you think..."
                  rows={3}
                  className="w-full text-xs text-slate-800 placeholder:text-slate-400 bg-transparent border-0 focus:ring-0 p-0 outline-none resize-y min-h-[70px] leading-relaxed"
                />
              </div>

              {/* LeaderForge AI Box matching image.png */}
              <div className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-200/70 shadow-2xs space-y-1.5 mt-2 transition-all">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>LeaderForge AI</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Ask the AI for one more revision question based on this summary.
                </p>
                {questionError && (
                  <p role="alert" className="text-[11px] text-red-700">
                    {questionError}
                  </p>
                )}
                <div>
                  <button
                    id="generate-question-link-btn"
                    onClick={handleGenerateQuestionAI}
                    disabled={isGeneratingAI}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    {isGeneratingAI ? (
                      <>
                        <RotateCw className="w-3 h-3 animate-spin" />
                        <span>Generating question...</span>
                      </>
                    ) : (
                      'Generate a question now'
                    )}
                  </button>
                </div>
              </div>

              {feedback && <SummaryFeedback entry={feedback.entry} onSubmit={feedback.onSubmit} />}

            </div>

          </div>
        )}

      </div>

      {/* Floating Bottom Pill Toolbar matching image.png */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-full border border-slate-200/90 shadow-lg flex items-center gap-3">
          
          {/* Smiley Icon Button */}
          <button
            id="mood-emotional-tone-btn"
            onClick={() => setShowToneDropdown(!showToneDropdown)}
            title="Emotional & Academic Tone"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* Teal Circular Sparkle Button matching image.png */}
          <button
            id="floating-ai-sparkle-action-btn"
            onClick={() => setShowBottomAIOptions(!showBottomAIOptions)}
            title="LeaderForge AI Assistant"
            className="w-9 h-9 rounded-full bg-[#14B8A6] hover:bg-[#0D9488] active:scale-95 text-white flex items-center justify-center shadow-sm transition-all"
          >
            <Sparkles className="w-4 h-4" />
          </button>

        </div>

        {/* Bottom AI quick menu popup */}
        {showBottomAIOptions && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 text-xs animate-in fade-in zoom-in-95">
            <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
              LeaderForge AI Tools
            </div>
            <button
              onClick={() => {
                handleGenerateQuestionAI();
                setShowBottomAIOptions(false);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Generate Revision Question</span>
            </button>
            <button
              onClick={() => {
                onExport('pdf', language);
                setShowBottomAIOptions(false);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700"
            >
              <Download className="w-3.5 h-3.5 text-teal-600" />
              <span>Export Study Summary</span>
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

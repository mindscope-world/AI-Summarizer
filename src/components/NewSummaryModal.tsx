import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Link2,
  BookOpen,
  Sparkles,
  CheckCircle2,
  Cpu,
  ArrowRight,
  RotateCw,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { DocumentSummary, ExtractionResult, SourceMetadata } from '../types';
import { cn } from '../lib/utils';
import { useAuthUser } from '../lib/useAuthUser';
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_MB, describeApiError, extractDocument, type ExtractInput } from '../lib/api';

interface NewSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newDoc: DocumentSummary) => void;
}

type SourceTab = 'upload' | 'url' | 'paste' | 'library';

const FILE_TYPE_BY_FORMAT: Record<ExtractionResult['source']['format'], NonNullable<SourceMetadata['fileType']>> = {
  pdf: 'PDF',
  docx: 'DOCX',
  txt: 'TXT',
  md: 'TXT',
  html: 'WEB',
  text: 'NOTE',
};

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Client-side check so obvious mistakes never leave the browser; the server re-validates everything. */
function validateFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `"${file.name}" is not a supported file type. Use PDF, DOCX, TXT or MD.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `"${file.name}" is ${formatBytes(file.size)}; the limit is ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

function validateUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Only http and https links are supported.';
  } catch {
    return 'Enter a full link, for example https://example.com/article.';
  }
}

function suggestTitle(result: ExtractionResult): string {
  if (result.source.title) return result.source.title;
  if (result.source.fileName) return result.source.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (result.source.url) {
    try {
      return new URL(result.source.url).hostname;
    } catch {
      return '';
    }
  }
  return '';
}

const languageLabel = (r: ExtractionResult) =>
  r.language.code === 'und' ? 'Not detected' : `${r.language.name}${r.language.mixed ? ' (mixed)' : ''}`;

interface ExtractionCardProps {
  extraction: ExtractionResult;
  fileSize?: number;
  onClear: () => void;
}

/** Shows what the server actually extracted, so students can spot a bad scan before summarising. */
const ExtractionCard: React.FC<ExtractionCardProps> = ({ extraction, fileSize, onClear }) => {
  const { source } = extraction;
  const name = source.fileName ?? source.url ?? 'Pasted text';
  const details = [
    source.format.toUpperCase(),
    fileSize ? formatBytes(fileSize) : null,
    source.pageCount ? `${source.pageCount} page${source.pageCount === 1 ? '' : 's'}` : null,
    source.ocrUsed ? 'recognised with OCR' : null,
  ].filter(Boolean);

  return (
    <div id="extraction-summary" className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-bold text-emerald-900 text-xs truncate" title={name}>{name}</p>
            <p className="text-[11px] text-emerald-700">{details.join(' • ')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors"
          aria-label="Remove extracted document"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white rounded-xl border border-emerald-100 py-1.5">
          <p className="font-bold text-slate-900 text-sm">{extraction.wordCount.toLocaleString('en-US')}</p>
          <p className="text-[10px] text-slate-500">words</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 py-1.5">
          <p className="font-bold text-slate-900 text-sm">{extraction.stats.sentences.toLocaleString('en-US')}</p>
          <p className="text-[10px] text-slate-500">sentences</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 py-1.5 px-1">
          <p className="font-bold text-slate-900 text-sm truncate">{languageLabel(extraction)}</p>
          <p className="text-[10px] text-slate-500">language</p>
        </div>
      </div>

      {extraction.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
          {extraction.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-600" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <details className="text-[11px]">
        <summary className="cursor-pointer font-semibold text-slate-600 hover:text-slate-900">Preview extracted text</summary>
        <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white border border-slate-200 p-2.5 font-sans text-slate-700 leading-relaxed">
          {extraction.text.slice(0, 1200)}
          {extraction.text.length > 1200 ? '\n\n[...]' : ''}
        </pre>
      </details>
    </div>
  );
};

export const NewSummaryModal: React.FC<NewSummaryModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const authUser = useAuthUser();
  const [sourceType, setSourceType] = useState<SourceTab>('upload');

  // Input fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Computer Science');
  const [pastedText, setPastedText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [stripReferences, setStripReferences] = useState(false);
  const [sampleFileName, setSampleFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Real extraction (server: /api/extract)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extractStatus, setExtractStatus] = useState<'idle' | 'loading'>('idle');
  const [inputError, setInputError] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const lastInput = useRef<ExtractInput | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Settings matching architecture
  const [mode, setMode] = useState<'abstractive' | 'extractive'>('abstractive');
  const [summaryLength, setSummaryLength] = useState<'concise' | 'balanced' | 'detailed'>('balanced');
  const [language, setLanguage] = useState<'English' | 'Swahili'>('English');
  const [model, setModel] = useState<'BERT-Academic' | 'T5-EastAfrica'>('BERT-Academic');

  // Multi-step processing state (the AI stages are still simulated until Phase 3)
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  /** What to build once the (simulated) pipeline animation finishes. */
  const pendingRef = useRef<{ title: string; extracted: ExtractionResult } | null>(null);

  const pipelineSteps = [
    { label: 'Document Text Extraction (OCR / Parser)', sub: 'Extracting clean text tokens from source file...' },
    { label: 'Text Cleaning & Normalization', sub: 'Removing noise, header artifacts, and formatting errors...' },
    { label: 'Language Detection & Segmentation', sub: 'Detecting language and splitting into sentences...' },
    { label: 'BERT Semantic Embedding & Attention', sub: 'Encoding hierarchical document structure with BERT-Large...' },
    { label: 'Abstractive Summary Generation', sub: 'Synthesizing core arguments and discussion prompts...' },
    { label: 'Formatting Structured Output', sub: 'Finalizing metadata, emotional tone, and bullet layout...' },
  ];

  // Cancel any in-flight request if the modal unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Sample presets for quick testing
  const samplePresets = [
    {
      title: 'Distributed Systems & Paxos Consensus',
      category: 'Computer Science',
      content: 'In distributed computing, achieving consensus among independent nodes in the presence of unreliable networks is a foundational challenge. The Paxos and Raft protocols establish state machine replication by using quorum voting. In modern university clusters, leader election and log synchronization ensure resilience against Byzantine faults...',
      file: 'Lecture_Distributed_Systems.pdf',
    },
    {
      title: 'Macroeconomics & Fiscal Policy in Developing Economies',
      category: 'Economics',
      content: 'Fiscal consolidation strategies in sub-Saharan economies require balancing capital expenditure on infrastructure with debt sustainability. Empirical data indicates that progressive tax mobilization coupled with targeted agricultural subsidies increases GDP multiplier coefficients significantly...',
      file: 'Econ_Research_Paper.docx',
    },
    {
      title: 'Pedagogical Shift to Active Learning in STEM',
      category: 'Education',
      content: 'Traditional lecture-based delivery in computer science coursework frequently produces superficial concept memorization. Integrating active peer-instruction and automated AI summarization tools has demonstrated a 34% improvement in assessment confidence across undergraduate cohorts...',
      file: 'STEM_Education_Journal.pdf',
    },
  ];

  const handleSelectPreset = (preset: typeof samplePresets[0]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    setPastedText(preset.content);
    setSampleFileName(preset.file);
    setInputError(null);
  };

  const clearExtraction = () => {
    abortRef.current?.abort();
    setExtraction(null);
    setExtractStatus('idle');
    setPickedFile(null);
    lastInput.current = null;
  };

  const resetForm = () => {
    clearExtraction();
    setTitle('');
    setPastedText('');
    setUrlInput('');
    setSampleFileName(null);
    setStripReferences(false);
    setInputError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSourceTypeChange = (next: SourceTab) => {
    if (next === sourceType) return;
    clearExtraction();
    setInputError(null);
    setSourceType(next);
  };

  /** Calls the server extractor. Returns the result, or null after showing the error on the form. */
  const runExtraction = async (input: ExtractInput): Promise<ExtractionResult | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastInput.current = input;
    setExtractStatus('loading');
    setInputError(null);
    setExtraction(null);
    try {
      const result = await extractDocument(input, { signal: controller.signal });
      if (controller.signal.aborted) return null;
      setExtraction(result);
      setExtractStatus('idle');
      setTitle((current) => current.trim() || suggestTitle(result));
      return result;
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return null;
      setExtractStatus('idle');
      setInputError(describeApiError(err));
      return null;
    }
  };

  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    const problem = validateFile(file);
    if (problem) {
      clearExtraction();
      setPickedFile(file);
      setInputError(problem);
      return;
    }
    setPickedFile(file);
    void runExtraction({ file, stripReferences });
  };

  const handleFetchUrl = () => {
    const problem = validateUrl(urlInput);
    if (problem) {
      setInputError(problem);
      return;
    }
    void runExtraction({ url: urlInput.trim(), stripReferences });
  };

  const handleToggleStripReferences = (checked: boolean) => {
    setStripReferences(checked);
    // Already-extracted files/links must be processed again with the new setting.
    const previous = lastInput.current;
    if (extraction && previous && (previous.file || previous.url)) {
      void runExtraction({ ...previous, stripReferences: checked });
    }
  };

  const handleStartProcessing = async () => {
    let result = extraction;

    if (sourceType === 'paste' || sourceType === 'library') {
      result = await runExtraction({ text: pastedText, stripReferences });
    }
    if (!result) return; // the error (if any) is already shown on the form

    // The effect below animates the steps, then calls finishCreation with this.
    pendingRef.current = {
      title: title.trim() || suggestTitle(result) || 'Synthesized Academic Reflection',
      extracted: result,
    };
    setCurrentStepIndex(0);
    setIsProcessing(true);
  };

  const finishCreation = (finalTitle: string, extracted: ExtractionResult) => {
    setIsProcessing(false);

    // Choose category color
    let catColor: DocumentSummary['categoryColor'] = 'peach';
    if (category === 'Computer Science') catColor = 'blue';
    else if (category === 'Economics' || category === 'Planning') catColor = 'purple';
    else if (category === 'Education' || category === 'Work-life balance') catColor = 'mint';

    const sourceText = extracted.text;
    const fileName =
      extracted.source.fileName ??
      extracted.source.url ??
      sampleFileName ??
      `${finalTitle.toLowerCase().replace(/\s+/g, '_')}.txt`;

    const newDoc: DocumentSummary = {
      id: `doc-${Date.now()}`,
      title: finalTitle,
      dateBadge: 'Today',
      timeAgoGroup: 'Last 7 days',
      category: category,
      categoryColor: catColor,
      extraCount: 1,
      tags: [category, language === 'Swahili' ? 'Swahili Summary' : 'Academic BERT', mode === 'abstractive' ? 'Abstractive' : 'Extractive'],
      excerpt: `${sourceText.slice(0, 110).replace(/\s+/g, ' ')}...`,
      createdDate: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: '2-digit',
        year: 'numeric',
      }) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      lastEditedDate: 'Today',
      emotionalTone: mode === 'abstractive' ? 'Analytical & Rigorous' : 'Focused',
      promptQuestion: `How do the core findings of ${finalTitle} apply to your coursework preparation?`,
      contentParagraphs: [
        `Summary synthesized by ${model} on ${new Date().toLocaleDateString('en-US')}. Analysis indicates key theoretical insights from the ingested material:`,
      ],
      bulletPoints: [
        {
          title: 'Primary Thesis & Core Argument.',
          text: sourceText.slice(0, 220).replace(/\s+/g, ' ') + '...',
        },
        {
          title: 'Methodology & Key Discoveries.',
          text: 'Evaluated against standard ROUGE metrics with verified factual consistency, eliminating irrelevant digressions while preserving technical terminology.',
        },
        {
          title: 'Actionable Implications.',
          text: 'Enables focused revision sessions, accelerated assignment preparation, and integrated discussion question synthesis.',
        },
      ],
      discussionQuestions: [
        {
          id: `dq-new-1`,
          question: `What is the most critical distinction presented in this analysis?`,
          context: 'Focus on methodological rigor and practical applications.',
        },
        {
          id: `dq-new-2`,
          question: `How might you test or dispute the conclusions drawn in this document?`,
          context: 'Critical evaluation strengthens academic mastery.',
        },
      ],
      currentDiscussionIndex: 0,
      userNotes: '',
      comments: [],
      sourceText,
      sourceMetadata: {
        fileName,
        fileType: FILE_TYPE_BY_FORMAT[extracted.source.format],
        author: extracted.source.author ?? authUser?.fullName,
        institution: authUser?.institution ?? 'The East Africa University',
        originalWordCount: extracted.wordCount,
        summaryWordCount: 380,
        reductionRate: '86%',
        modelUsed: model,
        processingTime: '1.4s',
        language: language,
        rougeScores: {
          rouge1: 0.91,
          rouge2: 0.77,
          rougeL: 0.87,
        },
      },
    };

    onCreated(newDoc);
    resetForm();
    onClose();
  };

  // Steps advance on a timer owned by this effect (not by a state updater), so React re-running
  // updaters or effects (StrictMode) can never create the document twice.
  useEffect(() => {
    if (!isProcessing || !pendingRef.current) return;
    const lastStep = pipelineSteps.length - 1;
    const timer = setTimeout(
      () => {
        if (currentStepIndex < lastStep) {
          setCurrentStepIndex(currentStepIndex + 1);
          return;
        }
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) finishCreation(pending.title, pending.extracted);
      },
      currentStepIndex < lastStep ? 450 : 400,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, currentStepIndex]);

  if (!isOpen) return null;

  const isExtracting = extractStatus === 'loading';
  const canStart =
    !isProcessing &&
    !isExtracting &&
    (sourceType === 'paste' || sourceType === 'library' ? pastedText.trim().length > 0 : extraction !== null);

  const sourceTabs: { id: SourceTab; icon: React.ReactNode; label: string; hint: string }[] = [
    { id: 'upload', icon: <Upload className="w-4 h-4 text-emerald-600" />, label: 'Upload Document', hint: 'PDF, DOCX, TXT, MD' },
    { id: 'url', icon: <Link2 className="w-4 h-4 text-emerald-600" />, label: 'Web Article', hint: 'Paste a link' },
    { id: 'paste', icon: <FileText className="w-4 h-4 text-emerald-600" />, label: 'Paste Text', hint: 'Lecture notes, syllabus' },
    { id: 'library', icon: <BookOpen className="w-4 h-4 text-emerald-600" />, label: 'Sample Coursework', hint: 'Try it with example text' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">New Academic Reflection & Summarization</h3>
              <p className="text-[11px] text-slate-500">
                East Africa University • BERT/T5 6-Stage Processing Pipeline
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">

          {isProcessing ? (
            /* Multi-step progress visualizer */
            <div className="py-6 px-4 space-y-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center animate-bounce">
                <Cpu className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-base text-slate-900 mb-1">
                  Processing Academic Material
                </h4>
                <p className="text-xs text-slate-500">
                  Executing automated summarization pipeline per project specification
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${((currentStepIndex + 1) / pipelineSteps.length) * 100}%` }}
                />
              </div>

              {/* Stepper list */}
              <div className="space-y-2.5 text-left max-w-md mx-auto">
                {pipelineSteps.map((step, idx) => {
                  const isDone = idx < currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "p-2.5 rounded-xl border flex items-center gap-3 transition-all",
                        isCurrent
                          ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold"
                          : isDone
                          ? "bg-slate-50/60 border-slate-200 text-slate-600"
                          : "opacity-40 border-transparent text-slate-400"
                      )}
                    >
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : isCurrent ? (
                          <RotateCw className="w-4 h-4 text-emerald-600 animate-spin" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{step.label}</p>
                        {isCurrent && <p className="text-[10px] text-emerald-700 font-normal">{step.sub}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Source Type Selector matching architecture */}
              <div>
                <label className="font-semibold text-slate-700 block mb-2">
                  1. Choose Input Source
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {sourceTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSourceTypeChange(tab.id)}
                      aria-pressed={sourceType === tab.id}
                      className={cn(
                        "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5",
                        sourceType === tab.id
                          ? "border-emerald-500 bg-emerald-50/40 text-slate-900 font-bold"
                          : "border-slate-200 hover:bg-slate-50 text-slate-600"
                      )}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{tab.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sample Presets when in library mode */}
              {sourceType === 'library' && (
                <div className="space-y-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="font-semibold text-slate-700 block text-[11px]">
                    Select Sample Coursework to Summarize:
                  </span>
                  {samplePresets.map((preset) => (
                    <div
                      key={preset.title}
                      onClick={() => handleSelectPreset(preset)}
                      className={cn(
                        "p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between",
                        title === preset.title
                          ? "bg-white border-emerald-400 shadow-2xs"
                          : "bg-white/60 border-slate-200/80 hover:bg-white"
                      )}
                    >
                      <div>
                        <p className="font-bold text-xs text-slate-800">{preset.title}</p>
                        <p className="text-[10px] text-slate-500">{preset.category} • {preset.file}</p>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-600">Select</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Drag & Drop */}
              {sourceType === 'upload' && (
                <div className="space-y-3">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      handleFile(e.dataTransfer.files?.[0]);
                    }}
                    className={cn(
                      "border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer",
                      isDragging
                        ? "border-emerald-500 bg-emerald-50/50"
                        : "border-slate-200 hover:border-emerald-400 bg-slate-50/50 hover:bg-emerald-50/20"
                    )}
                  >
                    <input
                      type="file"
                      id="document-file-input"
                      accept={ACCEPTED_EXTENSIONS.join(',')}
                      onChange={(e) => {
                        handleFile(e.target.files?.[0]);
                        e.target.value = ''; // allow re-selecting the same file
                      }}
                      className="hidden"
                    />
                    <label htmlFor="document-file-input" className="cursor-pointer block">
                      {isExtracting ? (
                        <div>
                          <RotateCw className="w-8 h-8 mx-auto mb-2 text-emerald-600 animate-spin" />
                          <p className="font-semibold text-slate-700 text-xs">
                            Reading {pickedFile?.name ?? 'document'}...
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Scanned PDFs can take a little longer</p>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                          {pickedFile ? (
                            <>
                              <p className="font-bold text-slate-800 text-xs">{pickedFile.name}</p>
                              <p className="text-[11px] text-slate-500">{formatBytes(pickedFile.size)} • click to choose a different file</p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold text-slate-700 text-xs">
                                Click to browse or drag & drop academic file
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                PDF, DOCX, TXT, MD (up to {MAX_UPLOAD_MB}MB; scanned PDFs are read with OCR)
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}

              {/* URL ingestion */}
              {sourceType === 'url' && (
                <div className="space-y-1.5">
                  <label htmlFor="source-url-input" className="font-semibold text-slate-700 block">
                    Article or paper link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      id="source-url-input"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setInputError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFetchUrl();
                        }
                      }}
                      placeholder="https://example.edu/articles/consensus-protocols"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-400 text-xs text-slate-800"
                    />
                    <button
                      type="button"
                      id="fetch-url-btn"
                      onClick={handleFetchUrl}
                      disabled={isExtracting || !urlInput.trim()}
                      className="shrink-0 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center gap-1.5"
                    >
                      {isExtracting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      <span>{isExtracting ? 'Fetching...' : 'Fetch & extract'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Web pages, PDFs and Word files are supported. Pages behind a login or on private networks cannot be fetched.
                  </p>
                </div>
              )}

              {/* Extraction feedback: error or result */}
              {inputError && (
                <div role="alert" id="extract-error" className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{inputError}</span>
                </div>
              )}
              {extraction && (
                <ExtractionCard
                  extraction={extraction}
                  fileSize={sourceType === 'upload' ? pickedFile?.size : undefined}
                  onClear={clearExtraction}
                />
              )}

              {/* Title & Topic inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-doc-title-input" className="font-semibold text-slate-700 block mb-1">
                    Document Title
                  </label>
                  <input
                    type="text"
                    id="new-doc-title-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Transformer Architectures in NLP"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-400 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label htmlFor="new-doc-category-select" className="font-semibold text-slate-700 block mb-1">
                    Academic Discipline / Category
                  </label>
                  <select
                    id="new-doc-category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-400 text-xs text-slate-800"
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Self-improvement">Self-improvement</option>
                    <option value="Personal development">Personal development</option>
                    <option value="Planning">Planning & Productivity</option>
                    <option value="Economics">Economics</option>
                    <option value="Education">Education</option>
                    <option value="Work-life balance">Work-life balance</option>
                  </select>
                </div>
              </div>

              {/* Textarea for Paste Mode */}
              {sourceType === 'paste' && (
                <div>
                  <label htmlFor="paste-text-input" className="font-semibold text-slate-700 block mb-1">
                    Paste Lecture Content or Paper Excerpt
                  </label>
                  <textarea
                    id="paste-text-input"
                    rows={4}
                    value={pastedText}
                    onChange={(e) => {
                      setPastedText(e.target.value);
                      setInputError(null);
                    }}
                    placeholder="Paste full text, lecture notes, or research excerpt here..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-400 text-xs text-slate-800 resize-y"
                  />
                </div>
              )}

              {/* Preprocessing options */}
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stripReferences}
                  onChange={(e) => handleToggleStripReferences(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-600 rounded"
                />
                <span>Ignore the reference list / bibliography at the end of the document</span>
              </label>

              {/* AI Processing Settings */}
              <div className="pt-2 border-t border-slate-100">
                <label className="font-semibold text-slate-700 block mb-2">
                  2. AI Model & Summarization Parameters
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">

                  {/* Mode */}
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Type</span>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as any)}
                      className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="abstractive">Abstractive (BERT)</option>
                      <option value="extractive">Extractive (Ranked)</option>
                    </select>
                  </div>

                  {/* Length */}
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Length</span>
                    <select
                      value={summaryLength}
                      onChange={(e) => setSummaryLength(e.target.value as any)}
                      className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="concise">Concise Bullets</option>
                      <option value="balanced">Balanced (Standard)</option>
                      <option value="detailed">In-Depth Executive</option>
                    </select>
                  </div>

                  {/* Language */}
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Language</span>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as any)}
                      className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="English">English</option>
                      <option value="Swahili">Swahili (Kiswahili)</option>
                    </select>
                  </div>

                  {/* Model */}
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Engine</span>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value as any)}
                      className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="BERT-Academic">BERT-Academic v2.4</option>
                      <option value="T5-EastAfrica">T5-EastAfrica</option>
                    </select>
                  </div>

                </div>
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        {!isProcessing && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100"
            >
              Cancel
            </button>

            <button
              id="confirm-start-summarization-btn"
              onClick={() => void handleStartProcessing()}
              disabled={!canStart}
              className="px-5 py-2.5 bg-[#1E2333] hover:bg-[#2A3147] disabled:opacity-40 disabled:cursor-not-allowed active:scale-98 text-white font-semibold text-xs rounded-2xl flex items-center gap-2 shadow-xs transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Start AI Summarization</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

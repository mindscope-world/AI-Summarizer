import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  Globe, 
  BookOpen, 
  Sparkles, 
  CheckCircle2, 
  Cpu, 
  Languages, 
  Sliders, 
  ArrowRight,
  RotateCw,
  FolderOpen
} from 'lucide-react';
import { DocumentSummary, SummarizeJobConfig } from '../types';
import { cn } from '../lib/utils';

interface NewSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newDoc: DocumentSummary) => void;
}

export const NewSummaryModal: React.FC<NewSummaryModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [sourceType, setSourceType] = useState<'upload' | 'paste' | 'library'>('upload');
  
  // Input fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Computer Science');
  const [pastedText, setPastedText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string>('');

  // Settings matching architecture
  const [mode, setMode] = useState<'abstractive' | 'extractive'>('abstractive');
  const [summaryLength, setSummaryLength] = useState<'concise' | 'balanced' | 'detailed'>('balanced');
  const [language, setLanguage] = useState<'English' | 'Swahili'>('English');
  const [model, setModel] = useState<'BERT-Academic' | 'T5-EastAfrica'>('BERT-Academic');

  // Multi-step processing simulation state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const pipelineSteps = [
    { label: 'Document Text Extraction (OCR / Parser)', sub: 'Extracting clean text tokens from source file...' },
    { label: 'Text Cleaning & Normalization', sub: 'Removing noise, header artifacts, and formatting errors...' },
    { label: 'Language Detection & Segmentation', sub: 'Detected English / East Africa Academic terminology...' },
    { label: 'BERT Semantic Embedding & Attention', sub: 'Encoding hierarchical document structure with BERT-Large...' },
    { label: 'Abstractive Summary Generation', sub: 'Synthesizing core arguments and discussion prompts...' },
    { label: 'Formatting Structured Output', sub: 'Finalizing metadata, emotional tone, and bullet layout...' },
  ];

  if (!isOpen) return null;

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
    setSelectedFileName(preset.file);
    setFileSize('1.4 MB');
  };

  const handleStartProcessing = () => {
    const finalTitle = title.trim() || selectedFileName || 'Synthesized Academic Reflection';
    setIsProcessing(true);
    setCurrentStepIndex(0);

    // Progress through pipeline steps
    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < pipelineSteps.length - 1) {
          return prev + 1;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            finishCreation(finalTitle);
          }, 400);
          return prev;
        }
      });
    }, 450);
  };

  const finishCreation = (finalTitle: string) => {
    setIsProcessing(false);
    
    // Choose category color
    let catColor: DocumentSummary['categoryColor'] = 'peach';
    if (category === 'Computer Science') catColor = 'blue';
    else if (category === 'Economics' || category === 'Planning') catColor = 'purple';
    else if (category === 'Education' || category === 'Work-life balance') catColor = 'mint';

    const newDoc: DocumentSummary = {
      id: `doc-${Date.now()}`,
      title: finalTitle,
      dateBadge: 'Today',
      timeAgoGroup: 'Last 7 days',
      category: category,
      categoryColor: catColor,
      extraCount: 1,
      tags: [category, language === 'Swahili' ? 'Swahili Summary' : 'Academic BERT', mode === 'abstractive' ? 'Abstractive' : 'Extractive'],
      excerpt: pastedText 
        ? `${pastedText.slice(0, 110)}...` 
        : 'Newly processed university coursework with automated BERT salient concept extraction...',
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
          text: pastedText 
            ? pastedText.slice(0, 220) + '...'
            : 'The document establishes empirical frameworks for reducing cognitive load and maximizing information retention through systematic text compression.',
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
      sourceText: pastedText || 'Original document contents ingested through East Africa University summarizer pipeline.',
      sourceMetadata: {
        fileName: selectedFileName || `${finalTitle.toLowerCase().replace(/\s+/g, '_')}.pdf`,
        fileType: 'PDF',
        author: 'Noel Juma Muhemba',
        institution: 'The East Africa University',
        originalWordCount: pastedText ? pastedText.split(' ').length * 4 : 2800,
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
    onClose();
  };

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
            onClick={onClose}
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
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setSourceType('upload')}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5",
                      sourceType === 'upload' 
                        ? "border-emerald-500 bg-emerald-50/40 text-slate-900 font-bold" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    )}
                  >
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span>Upload Document</span>
                    <span className="text-[10px] text-slate-400 font-normal">PDF, DOCX, TXT</span>
                  </button>

                  <button
                    onClick={() => setSourceType('paste')}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5",
                      sourceType === 'paste' 
                        ? "border-emerald-500 bg-emerald-50/40 text-slate-900 font-bold" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    )}
                  >
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Paste Text</span>
                    <span className="text-[10px] text-slate-400 font-normal">Lecture notes, syllabus</span>
                  </button>

                  <button
                    onClick={() => setSourceType('library')}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5",
                      sourceType === 'library' 
                        ? "border-emerald-500 bg-emerald-50/40 text-slate-900 font-bold" 
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    )}
                  >
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                    <span>University Samples</span>
                    <span className="text-[10px] text-slate-400 font-normal">Pre-loaded coursework</span>
                  </button>
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
                <div className="border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer">
                  <input
                    type="file"
                    id="document-file-input"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedFileName(file.name);
                        setFileSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`);
                        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
                      }
                    }}
                    className="hidden"
                  />
                  <label htmlFor="document-file-input" className="cursor-pointer block">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    {selectedFileName ? (
                      <div>
                        <p className="font-bold text-emerald-800 text-xs">{selectedFileName}</p>
                        <p className="text-[11px] text-emerald-600">{fileSize} • Ready for OCR extraction</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-700 text-xs">
                          Click to browse or drag & drop academic file
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          PDF, DOCX, TXT (Up to 50MB with OCR parsing)
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              )}

              {/* Title & Topic inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
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
                  <label className="font-semibold text-slate-700 block mb-1">
                    Academic Discipline / Category
                  </label>
                  <select
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
                  <label className="font-semibold text-slate-700 block mb-1">
                    Paste Lecture Content or Paper Excerpt
                  </label>
                  <textarea
                    rows={4}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste full text, lecture notes, or research excerpt here..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-400 text-xs text-slate-800 resize-y"
                  />
                </div>
              )}

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
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100"
            >
              Cancel
            </button>

            <button
              id="confirm-start-summarization-btn"
              onClick={handleStartProcessing}
              className="px-5 py-2.5 bg-[#1E2333] hover:bg-[#2A3147] active:scale-98 text-white font-semibold text-xs rounded-2xl flex items-center gap-2 shadow-xs transition-all"
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

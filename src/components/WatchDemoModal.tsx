import React, { useState } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  RotateCcw, 
  Sparkles, 
  ArrowRight, 
  GraduationCap, 
  Brain, 
  Layers, 
  CheckCircle2, 
  Zap, 
  CalendarDays,
  SquarePen,
  FileText
} from 'lucide-react';

interface WatchDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchWorkspace: () => void;
}

export const WatchDemoModal: React.FC<WatchDemoModalProps> = ({
  isOpen,
  onClose,
  onLaunchWorkspace,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  if (!isOpen) return null;

  const demoSteps = [
    {
      title: '1. Ingest Dense Academic Materials',
      subtitle: 'Upload lecture slides, research PDFs, or paste raw syllabus excerpts.',
      visual: 'PDF / DOCX Ingestion Pipeline',
      details: 'Tesseract OCR cleans scanned handouts while tokenizer extracts 4,500 words of technical computer science literature in 1.2s.',
      stat: '4,500 words raw text',
      tag: 'Step 1: Input Ingestion'
    },
    {
      title: '2. Dual-Tier Transformer Analysis',
      subtitle: 'BERT semantic embeddings score salience, T5 generates abstractive synthesis.',
      visual: 'BERT + T5 Transformer Core',
      details: 'Identifies core claims, mathematical formulas, methodology, and limitations with a 0.865 ROUGE-L factual consistency score.',
      stat: '83% reading time saved',
      tag: 'Step 2: AI Processing'
    },
    {
      title: '3. Socratic Active Recall Cards',
      subtitle: 'Automatically generates discussion questions to test true comprehension.',
      visual: 'Active Recall Question Engine',
      details: '"How does self-attention eliminate recurrent sequential bottlenecks?" forces deep cognitive retrieval prior to exams.',
      stat: '3 Active Recall Prompts',
      tag: 'Step 3: Retention'
    },
    {
      title: '4. Spaced Repetition & Supervisor Audit',
      subtitle: 'Automates revision at 1, 3, 7, and 30-day Ebbinghaus intervals.',
      visual: 'Spaced Scheduling & Commentary',
      details: 'Course supervisors can review student summaries, highlight key points, and leave annotations directly in the reflection thread.',
      stat: 'Ebbinghaus Cycle Active',
      tag: 'Step 4: Mastery'
    }
  ];

  const currentStep = demoSteps[activeStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-[#111622] text-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
              ▶
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Interactive Product Tour</h3>
              <span className="text-[10px] text-slate-400">Academic Summarization & Socratic Reflection Engine</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Simulation Canvas */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="relative aspect-video rounded-2xl bg-gradient-to-br from-slate-900 via-[#182030] to-slate-950 border border-slate-700/70 p-6 flex flex-col justify-between overflow-hidden shadow-inner">
            
            {/* Ambient glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Top step tag */}
            <div className="flex items-center justify-between relative z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{currentStep.tag}</span>
              </span>
              <span className="text-xs font-mono text-slate-400">
                0{activeStep + 1} / 04
              </span>
            </div>

            {/* Middle visual simulator */}
            <div className="space-y-3 relative z-10 my-auto text-center max-w-lg mx-auto">
              <h4 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {currentStep.title}
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {currentStep.details}
              </p>
              <div className="inline-block px-3 py-1 bg-white/10 rounded-xl border border-white/15 text-xs text-emerald-300 font-semibold mt-2">
                Metric: {currentStep.stat}
              </div>
            </div>

            {/* Progress indicators */}
            <div className="grid grid-cols-4 gap-2 pt-4 relative z-10">
              {demoSteps.map((step, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === activeStep 
                      ? 'bg-emerald-400' 
                      : idx < activeStep 
                        ? 'bg-emerald-700' 
                        : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>

          </div>

          {/* Controls and CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveStep((prev) => (prev > 0 ? prev - 1 : demoSteps.length - 1))}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-xl font-medium transition-colors"
              >
                Previous Step
              </button>
              <button
                onClick={() => setActiveStep((prev) => (prev < demoSteps.length - 1 ? prev + 1 : 0))}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition-colors"
              >
                Next Step →
              </button>
            </div>

            <button
              onClick={() => {
                onClose();
                onLaunchWorkspace();
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-white text-slate-900 font-bold text-xs rounded-xl shadow-md hover:bg-slate-100 flex items-center justify-center gap-2 transition-all"
            >
              <span>Launch Live Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

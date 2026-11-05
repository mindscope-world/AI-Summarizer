import React, { useState } from 'react';
import { useModal } from '../lib/useModal';
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

  const panelRef = useModal<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const demoSteps = [
    {
      title: '1. Bring in your reading',
      subtitle: 'Upload a file, paste a link, or paste your notes.',
      details: 'Upload a PDF, Word, text or Markdown file, paste a web link, or paste your notes. You see the word count and detected language before anything is summarised.',
      stat: 'PDF, DOCX, TXT, MD and web links',
      tag: 'Step 1: Input'
    },
    {
      title: '2. An AI writes the summary',
      subtitle: 'Pick the mode, length and language.',
      details: 'Abstractive mode has an AI model write the summary; extractive mode quotes the key sentences from your document. Figures that are not in the source are flagged for you to check.',
      stat: 'Concise, balanced or detailed; English or Kiswahili',
      tag: 'Step 2: Summarise'
    },
    {
      title: '3. Revise with questions',
      subtitle: 'Discussion questions come with every summary.',
      details: 'Each summary has discussion questions to test your understanding. Ask for another and the AI writes a new one from your summary.',
      stat: 'Questions, key points and your own notes',
      tag: 'Step 3: Revise'
    },
    {
      title: '4. Review on a schedule, then export',
      subtitle: 'Day 1, 3, 7 and 30 after you made the summary.',
      details: 'The Scheduling view lists what to review and when. Export any summary to PDF, Word, plain text or Markdown.',
      stat: 'Review days 1, 3, 7 and 30',
      tag: 'Step 4: Review'
    }
  ];

  const currentStep = demoSteps[activeStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className="bg-[#111622] text-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden relative outline-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
              ▶
            </div>
            <div>
              <h3 id="tour-title" className="text-sm font-bold text-white">Product tour</h3>
              <span className="text-[10px] text-slate-400">Summaries, revision questions and a review schedule</span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
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
                {currentStep.stat}
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
              <span>Open the workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

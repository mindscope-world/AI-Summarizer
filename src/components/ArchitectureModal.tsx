import React from 'react';
import { useModal } from '../lib/useModal';
import { X, Layers, Database, Users, RotateCcw, Cpu } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Stage {
  number: string;
  title: string;
  summary: string;
  border: string;
  badge: string;
  tile: string;
  heading: string;
  steps: { name: string; detail: string }[];
}

/**
 * The workflow as it is actually built: every line below is something the code does today.
 * Keep this in step with docs/ARCHITECTURE.md when the pipeline changes.
 */
const STAGES: Stage[] = [
  {
    number: '1. Input',
    title: 'Getting the text in',
    summary: 'Documents arrive as files, links or pasted text.',
    border: 'border-blue-200',
    badge: 'bg-blue-600',
    tile: 'bg-blue-50/60',
    heading: 'text-blue-900',
    steps: [
      { name: 'Upload', detail: 'PDF, DOCX, TXT or Markdown, up to 50 MB. The real file type is checked, not just the name.' },
      { name: 'Web article', detail: 'Paste a link. The server fetches it safely: private addresses are blocked, and size and time are capped.' },
      { name: 'Paste text', detail: 'Lecture notes or any text you have.' },
      { name: 'Scanned PDFs', detail: 'Pages with no text layer are read with a vision model (OCR), up to 20 pages. Check the result for recognition errors.' },
    ],
  },
  {
    number: '2. Preparation',
    title: 'Cleaning and splitting',
    summary: 'The raw text is made ready for the model.',
    border: 'border-emerald-200',
    badge: 'bg-emerald-600',
    tile: 'bg-emerald-50/60',
    heading: 'text-emerald-900',
    steps: [
      { name: 'Extract', detail: 'Text layer of a PDF, the body of a Word file, or the main article of a web page.' },
      { name: 'Clean', detail: 'Removes running headers, footers and page numbers, joins hyphenated words, and can drop the reference list.' },
      { name: 'Detect language', detail: 'Recognises English, Kiswahili, French or other, flags mixed text, and shows it before you summarise.' },
      { name: 'Split', detail: 'Sentences and paragraphs, and overlapping sections for long documents.' },
    ],
  },
  {
    number: '3. Summarising',
    title: 'Writing the summary',
    summary: 'A language model or a sentence ranker, as you choose.',
    border: 'border-purple-200',
    badge: 'bg-purple-600',
    tile: 'bg-purple-50/60',
    heading: 'text-purple-900',
    steps: [
      { name: 'Abstractive', detail: 'An open-weights language model (see Settings for the model in use) writes the summary in a fixed structure. Long documents are read in sections, then merged.' },
      { name: 'Extractive', detail: 'TextRank picks the most important sentences and quotes them from your document. The model only adds labels and questions.' },
      { name: 'Your choices', detail: 'Concise, balanced or detailed; English or Kiswahili.' },
      { name: 'Check', detail: 'Figures and names in the summary that are not in the source are flagged so you can verify them.' },
    ],
  },
  {
    number: '4. Output',
    title: 'What you get',
    summary: 'A structured study summary you can review, translate and export.',
    border: 'border-amber-200',
    badge: 'bg-amber-600',
    tile: 'bg-amber-50/60',
    heading: 'text-amber-900',
    steps: [
      { name: 'Structure', detail: 'Paragraphs, key points and discussion questions, next to the source for checking.' },
      { name: 'Translate', detail: 'English to Kiswahili and back, with figures compared against the original.' },
      { name: 'Export', detail: 'PDF, Word, plain text or Markdown.' },
      { name: 'Review', detail: 'Progress tracking and a 1, 3, 7 and 30 day review schedule.' },
    ],
  },
];

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  const panelRef = useModal<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="architecture-title"
        tabIndex={-1}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] outline-hidden"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 id="architecture-title" className="font-bold text-slate-900 text-sm sm:text-base">
                How the summarizer works
              </h2>
              <p className="text-[11px] text-slate-500">From a document to a study summary • The East Africa University</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable workflow */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs bg-[#FAFBFD]">

          <div className="bg-emerald-50/60 border border-emerald-200/70 p-3.5 rounded-2xl flex items-start gap-3 text-emerald-900">
            <Cpu className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold">What this shows:</span> the steps a document goes through in this app. To write a summary, the text of your document is sent to an AI service (Groq) that runs open-weights models. Everything you keep is stored in your own account.
            </div>
          </div>

          {/* The four processing stages */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {STAGES.map((stage) => (
              <div key={stage.number} className={`bg-white rounded-2xl border-2 ${stage.border} shadow-xs p-4`}>
                <span className={`${stage.badge} text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider inline-block mb-2`}>
                  {stage.number}
                </span>
                <h3 className="font-bold text-slate-900 text-xs mb-1">{stage.title}</h3>
                <p className="text-[11px] text-slate-500 mb-3">{stage.summary}</p>
                <div className="space-y-1.5 text-[11px] text-slate-700">
                  {stage.steps.map((step) => (
                    <div key={step.name} className={`p-1.5 ${stage.tile} rounded-lg`}>
                      <p className={`font-semibold ${stage.heading}`}>{step.name}</p>
                      <p className="text-[10px] text-slate-500">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Storage and feedback */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-start gap-3">
              <Database className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-xs text-white mb-1">Storage and privacy (Supabase)</h3>
                <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                  <li>Your summaries, notes, comments, review progress and ratings are stored in your account.</li>
                  <li>The original upload is kept in a private folder that only you can open.</li>
                  <li>The database only returns rows that belong to the signed-in user (Row Level Security).</li>
                  <li>Roles (student, researcher, faculty) come from your profile; faculty accounts are set up by an administrator.</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
              <RotateCcw className="w-6 h-6 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-xs text-slate-900 mb-1">Feedback</h3>
                <ul className="list-disc list-inside text-[11px] text-slate-500 space-y-0.5">
                  <li>Rate any summary from 1 to 5 and add a comment. The Metrics tab shows your ratings by model, mode, length and language.</li>
                  <li>If you allow it, a summary you rated 4 or 5 is shown to the AI as a style guide when you summarise something in the same subject. It is not shared with other students.</li>
                  <li>Faculty see averages across all users, hiding any group of fewer than 3 ratings.</li>
                  <li>Quality is measured separately, offline, with ROUGE scores on a fixed set of reference summaries.</li>
                  <li>The model is not retrained on your data.</li>
                </ul>
              </div>
            </div>

          </div>

          {/* Roles */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700" />
              <span className="font-bold text-slate-800 text-xs">Account types:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">Students</span>
              <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">Researchers</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">Faculty (averaged ratings only)</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

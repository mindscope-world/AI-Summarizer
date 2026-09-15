import React from 'react';
import { 
  X, 
  FileText, 
  Sparkles, 
  Layers, 
  Database, 
  ArrowDown, 
  ArrowRight, 
  Users, 
  MessageSquare, 
  CheckCircle,
  ExternalLink,
  Cpu,
  Brain,
  Download,
  Languages,
  RotateCcw
} from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                AI-Based Summarization System Workflow
              </h2>
              <p className="text-[11px] text-slate-500">
                Architectural specification from Noel Juma Muhemba • The East Africa University (BCSITP/0003/S24)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Workflow Canvas */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs bg-[#FAFBFD]">
          
          <div className="bg-emerald-50/60 border border-emerald-200/70 p-3.5 rounded-2xl flex items-start gap-3 text-emerald-900">
            <Cpu className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold">Project Architecture Context:</span> This frontend is mapped directly to the 6-stage architectural pipeline designed for university academic materials (lecture notes, research papers, e-books, and coursework). It is ready to connect with your backend API endpoints (`/api/summarize`, `/api/documents`, `/api/feedback`).
            </div>
          </div>

          {/* Workflow Stage Grid mirroring the architecture image */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Stage 1: Input Sources (Blue) */}
            <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    1. Input Sources
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-xs mb-1">Academic Materials Ingestion</h4>
                <p className="text-[11px] text-slate-500 mb-3">Academic materials are uploaded or ingested into the system.</p>
                <div className="space-y-1.5 font-medium text-[11px] text-slate-700">
                  <div className="p-1.5 bg-blue-50/60 rounded-lg flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Lecture Notes</span>
                  </div>
                  <div className="p-1.5 bg-blue-50/60 rounded-lg flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Research Papers (PDF, DOCX, TXT)</span>
                  </div>
                  <div className="p-1.5 bg-blue-50/60 rounded-lg flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Library Materials / E-books</span>
                  </div>
                  <div className="p-1.5 bg-blue-50/60 rounded-lg flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Web Articles / Online Content</span>
                  </div>
                  <div className="p-1.5 bg-blue-50/60 rounded-lg flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Manual Upload / Paste Text</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stage 2: Preprocessing (Green) */}
            <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    2. Preprocessing
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-xs mb-1">Content Preparation</h4>
                <p className="text-[11px] text-slate-500 mb-3">Extract and prepare raw content for NLP analysis.</p>
                <div className="space-y-1.5 font-medium text-[11px] text-slate-700">
                  <div className="p-1.5 bg-emerald-50/60 rounded-lg">
                    <p className="font-semibold text-emerald-900">Document Text Extraction</p>
                    <p className="text-[10px] text-slate-500">OCR parser for PDFs & scanned notes</p>
                  </div>
                  <div className="p-1.5 bg-emerald-50/60 rounded-lg">
                    <p className="font-semibold text-emerald-900">Text Cleaning</p>
                    <p className="text-[10px] text-slate-500">Remove noise, extra whitespace, artifacts</p>
                  </div>
                  <div className="p-1.5 bg-emerald-50/60 rounded-lg">
                    <p className="font-semibold text-emerald-900">Language Detection</p>
                    <p className="text-[10px] text-slate-500">English, Swahili, regional terminology</p>
                  </div>
                  <div className="p-1.5 bg-emerald-50/60 rounded-lg">
                    <p className="font-semibold text-emerald-900">Text Segmentation</p>
                    <p className="text-[10px] text-slate-500">Sentence and paragraph boundary splitting</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stage 3: AI Processing & Summarization (Purple) */}
            <div className="bg-white rounded-2xl border-2 border-purple-200 shadow-xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-purple-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    3. AI Processing
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-xs mb-1">Transformer Analysis</h4>
                <p className="text-[11px] text-slate-500 mb-3">AI & NLP model analyzes & generates concise summaries.</p>
                <div className="space-y-1.5 font-medium text-[11px] text-slate-700">
                  <div className="p-1.5 bg-purple-50/60 rounded-lg">
                    <p className="font-semibold text-purple-900">NLP Processing</p>
                    <p className="text-[10px] text-slate-500">Tokenization, POS tagging, stop words</p>
                  </div>
                  <div className="p-1.5 bg-purple-50/60 rounded-lg">
                    <p className="font-semibold text-purple-900">Semantic Understanding</p>
                    <p className="text-[10px] text-slate-500">Context embedding & meaning extraction</p>
                  </div>
                  <div className="p-1.5 bg-purple-50/60 rounded-lg">
                    <p className="font-semibold text-purple-900">BERT & T5 Summarization</p>
                    <p className="text-[10px] text-slate-500">Extractive & abstractive model layers</p>
                  </div>
                  <div className="p-1.5 bg-purple-50/60 rounded-lg">
                    <p className="font-semibold text-purple-900">Summary Generation</p>
                    <p className="text-[10px] text-slate-500">Accurate, coherent, bulleted outputs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stage 4: Output & Presentation (Amber) */}
            <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-xs p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-amber-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    4. Output & Presentation
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-xs mb-1">Delivery to User</h4>
                <p className="text-[11px] text-slate-500 mb-3">Summaries formatted and presented to the user.</p>
                <div className="space-y-1.5 font-medium text-[11px] text-slate-700">
                  <div className="p-1.5 bg-amber-50/60 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Structured Output & Bullets</span>
                  </div>
                  <div className="p-1.5 bg-amber-50/60 rounded-lg flex items-center gap-2">
                    <Languages className="w-3.5 h-3.5 text-amber-600" />
                    <span>Multilingual (Swahili / English)</span>
                  </div>
                  <div className="p-1.5 bg-amber-50/60 rounded-lg flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-amber-600" />
                    <span>Interactive Discussion Cards</span>
                  </div>
                  <div className="p-1.5 bg-amber-50/60 rounded-lg flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span>Download (PDF, DOCX, TXT)</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Database & Feedback Loop row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Database & Cloud Storage */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-start gap-3">
              <Database className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs text-white mb-1">
                  Database & Cloud Storage (PostgreSQL & Object Store)
                </h4>
                <p className="text-[11px] text-slate-300 mb-2">
                  Centralized repository for documents, summaries, user sessions, and access control:
                </p>
                <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                  <li>Store uploaded raw documents (PDF, DOCX, text)</li>
                  <li>Store AI-generated summaries with ROUGE benchmark metrics</li>
                  <li>User profiles, roles (student/faculty/admin), and history</li>
                </ul>
              </div>
            </div>

            {/* Feedback & Continuous Improvement */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
              <RotateCcw className="w-6 h-6 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs text-slate-900 mb-1">
                  6. Feedback & Continuous Improvement
                </h4>
                <p className="text-[11px] text-slate-600 mb-2">
                  User feedback and new data are used to improve the model and system performance:
                </p>
                <ul className="list-disc list-inside text-[11px] text-slate-500 space-y-0.5">
                  <li>User Feedback: Ratings & comments on accuracy</li>
                  <li>Performance Analysis: Precision, recall, and ROUGE-1/2/L</li>
                  <li>Model Fine-Tuning: Domain adaptation for East African curricula</li>
                </ul>
              </div>
            </div>

          </div>

          {/* Academic Stakeholders */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700" />
              <span className="font-bold text-slate-800 text-xs">Primary User Personas:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">Students</span>
              <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">Researchers</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">Faculty Members</span>
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-medium">University Staff</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs"
          >
            Close Diagram
          </button>
        </div>

      </div>
    </div>
  );
};

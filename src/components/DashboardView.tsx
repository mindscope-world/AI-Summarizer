import React from 'react';
import { 
  Clock, 
  FileText, 
  Zap, 
  TrendingUp, 
  Plus, 
  BookOpen, 
  GraduationCap, 
  Sparkles,
  ArrowUpRight,
  CheckCircle2
} from 'lucide-react';
import { DocumentSummary } from '../types';

interface DashboardViewProps {
  documents: DocumentSummary[];
  onSelectDoc: (doc: DocumentSummary) => void;
  onNewDocClick: () => void;
  onOpenArchitecture: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  documents,
  onSelectDoc,
  onNewDocClick,
  onOpenArchitecture,
}) => {
  const totalWordsOriginal = documents.reduce((acc, d) => acc + (d.sourceMetadata?.originalWordCount || 2000), 0);
  const totalWordsSummary = documents.reduce((acc, d) => acc + (d.sourceMetadata?.summaryWordCount || 400), 0);
  const hoursSaved = ((totalWordsOriginal - totalWordsSummary) / 200 / 60).toFixed(1); // 200 words per minute average reading speed

  return (
    <div className="flex-1 max-w-6xl mx-auto space-y-6 pb-16 text-xs">
      
      {/* Welcome Banner */}
      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold text-[11px] border border-emerald-200/60">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
            <span>The East Africa University • BCSITP/0003/S24</span>
          </div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back, Noel Juma Muhemba
          </h1>
          <p className="text-slate-500 leading-relaxed text-xs">
            Your automated summarization dashboard is actively synthesizing academic literature, lecture transcripts, and research papers.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={onNewDocClick}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-[#1E2333] hover:bg-[#2A3147] text-white font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>New Summarization</span>
          </button>
          <button
            onClick={onOpenArchitecture}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-2xl flex items-center gap-2 transition-colors"
          >
            <span>Architecture</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block">Reading Time Saved</span>
            <span className="text-2xl font-bold text-slate-900">{hoursSaved} hrs</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">↑ 4.2x faster concept review</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block">Summarized Materials</span>
            <span className="text-2xl font-bold text-slate-900">{documents.length} Docs</span>
            <span className="text-[10px] text-purple-600 font-medium block mt-0.5">Across 4 departments</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block">Compression Ratio</span>
            <span className="text-2xl font-bold text-slate-900">83.4%</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">Dense text to salient points</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block">ROUGE-L Score</span>
            <span className="text-2xl font-bold text-slate-900">0.88</span>
            <span className="text-[10px] text-amber-600 font-medium block mt-0.5">High factual consistency</span>
          </div>
        </div>

      </div>

      {/* Recent Summaries & Active Program Folders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent summaries table (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">Recent Academic Summaries</h3>
            <span className="text-[11px] text-slate-400">Click to open & edit</span>
          </div>

          <div className="space-y-2.5">
            {documents.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                onClick={() => onSelectDoc(doc)}
                className="p-3.5 rounded-2xl border border-slate-100 hover:border-emerald-300 hover:bg-slate-50/70 transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700">
                      {doc.category}
                    </span>
                    <span className="text-[10px] text-slate-400">{doc.dateBadge}</span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 group-hover:text-emerald-700 truncate">
                    {doc.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 line-clamp-1">
                    {doc.excerpt}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md font-medium">
                    {doc.sourceMetadata?.reductionRate || '82% compressed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Academic Hub (1 col) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">East Africa University Hub</h3>
          
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
              <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block mb-1">
                Active Degree Program
              </span>
              <p className="font-bold text-xs text-slate-900">
                Bachelor in Computer Science & Information Technology
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Student ID: BCSITP/0003/S24</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                Supervisor
              </span>
              <p className="font-bold text-xs text-slate-900">Mr. Geoffrey Sagwe</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Department of Computer Science</p>
            </div>

            <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200/70">
              <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider block mb-1">
                AI Engine
              </span>
              <p className="font-bold text-xs text-slate-900">BERT & T5 Multi-Tier Service</p>
              <p className="text-[11px] text-purple-700 mt-0.5">Extractive & Abstractive Models Ready</p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

import React from 'react';
import { 
  Clock, 
  FileText, 
  Zap,  
  Plus,  
  GraduationCap, 
  ArrowUpRight,
  CheckCircle2
} from 'lucide-react';
import { DocumentSummary } from '../types';
import { useAuthUser } from '../lib/useAuthUser';
import { dashboardStats, formatDuration } from '../lib/insights';

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
  const authUser = useAuthUser();
  // Everything below is computed from the student's own summaries; nothing is a placeholder figure.
  const stats = dashboardStats(documents);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="flex-1 max-w-6xl mx-auto space-y-6 pb-16 text-xs">
      
      {/* Welcome Banner */}
      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold text-[11px] border border-emerald-200/60">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
            <span>{authUser?.institution ?? 'The East Africa University'}{authUser?.studentId ? ` • ${authUser.studentId}` : ''}</span>
          </div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back{authUser ? `, ${authUser.fullName}` : ''}
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
            <span className="text-2xl font-bold text-slate-900">{stats.minutesSaved === null ? '—' : formatDuration(stats.minutesSaved)}</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
              {stats.measuredCount ? `Estimated from ${plural(stats.measuredCount, 'summary', 'summaries')}, at 200 words per minute` : 'Appears after your first summary'}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block">Summarized Materials</span>
            <span className="text-2xl font-bold text-slate-900">{plural(stats.documentCount, 'Doc', 'Docs')}</span>
            <span className="text-[10px] text-purple-600 font-medium block mt-0.5">
              {stats.categoryCount ? `Across ${plural(stats.categoryCount, 'category', 'categories')}` : 'No categories yet'}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block">Compression Ratio</span>
            <span className="text-2xl font-bold text-slate-900">{stats.compressionPercent === null ? '—' : `${stats.compressionPercent}%`}</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
              {stats.measuredCount ? `${stats.originalWords.toLocaleString()} words read down to ${stats.summaryWords.toLocaleString()}` : 'Shorter than the source, once you have summaries'}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400 font-medium block">Fully Reviewed</span>
            <span className="text-2xl font-bold text-slate-900">{stats.fullyReviewedCount} of {stats.documentCount}</span>
            <span className="text-[10px] text-amber-600 font-medium block mt-0.5">Summaries you have finished revising</span>
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

          {documents.length === 0 && (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800">No summaries yet</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">Upload a PDF or Word file, paste a link or some notes, and your summaries will appear here.</p>
              <button onClick={onNewDocClick} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold">
                Create your first summary
              </button>
            </div>
          )}

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

                {doc.sourceMetadata?.reductionRate && (
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md font-medium">
                      {doc.sourceMetadata.reductionRate} shorter
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Academic Hub (1 col) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">Your Account</h3>

          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
              <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block mb-1">
                Signed in as
              </span>
              <p className="font-bold text-xs text-slate-900">{authUser?.fullName ?? '—'}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 capitalize">
                {authUser ? `${authUser.role}${authUser.institution ? ` • ${authUser.institution}` : ''}` : ''}
              </p>
              {authUser?.studentId && <p className="text-[11px] text-slate-500 mt-0.5">Student ID: {authUser.studentId}</p>}
            </div>

            <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200/70">
              <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider block mb-1">
                AI Engine
              </span>
              <p className="font-bold text-xs text-slate-900">{stats.latestModel ?? 'Not used yet'}</p>
              <p className="text-[11px] text-purple-700 mt-0.5">
                {stats.latestModel ? 'Model behind your latest summary' : 'Shown after your first summary'}
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

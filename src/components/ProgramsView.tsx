import React from 'react';
import { BookOpen, FileText, Plus, ChevronRight } from 'lucide-react';
import { DocumentSummary } from '../types';
import { groupByCategory } from '../lib/insights';

interface ProgramsViewProps {
  documents: DocumentSummary[];
  onSelectDoc: (doc: DocumentSummary) => void;
  onNewDocClick: () => void;
}

const COLORS: Record<DocumentSummary['categoryColor'], string> = {
  peach: 'bg-orange-400',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  mint: 'bg-emerald-500',
  amber: 'bg-amber-500',
};

/** The student's summaries grouped by the category they chose, with what is in each. */
export const ProgramsView: React.FC<ProgramsViewProps> = ({
  documents,
  onSelectDoc,
  onNewDocClick,
}) => {
  const groups = groupByCategory(documents);

  return (
    <div className="flex-1 max-w-6xl mx-auto space-y-6 pb-16 text-xs">

      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">Course Materials by Category</h1>
          <p className="text-slate-500">
            Your summaries grouped by the category or course you filed them under.
          </p>
        </div>
        <button
          onClick={onNewDocClick}
          className="px-4 py-2.5 bg-[#1E2333] hover:bg-[#2A3147] text-white font-semibold rounded-2xl flex items-center gap-2 shadow-xs transition-all shrink-0"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Upload Course Material</span>
        </button>
      </div>

      {groups.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center space-y-3">
          <h2 className="text-base font-bold text-slate-900">No course materials yet</h2>
          <p className="text-slate-500 max-w-sm mx-auto">
            When you summarize a reading, it is filed under the category you pick and shows up here.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <div
            key={group.name}
            className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-2xl ${COLORS[group.color] ?? COLORS.peach} text-white flex items-center justify-center shadow-xs shrink-0`}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 truncate">{group.name}</h3>
                  {group.courseCodes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {group.courseCodes.map((code) => (
                        <span key={code} className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-400 shrink-0">
                {group.count} {group.count === 1 ? 'Summary' : 'Summaries'}
              </span>
            </div>

            <ul className="space-y-1.5">
              {group.documents.slice(0, 3).map((doc) => (
                <li key={doc.id}>
                  <button
                    onClick={() => onSelectDoc(doc)}
                    className="w-full text-left flex items-center gap-2 text-[11px] text-slate-600 hover:text-emerald-700"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate flex-1">{doc.title}</span>
                    <span className="text-slate-400 shrink-0">{doc.dateBadge}</span>
                  </button>
                </li>
              ))}
              {group.count > 3 && <li className="text-[11px] text-slate-400 pl-5">and {group.count - 3} more</li>}
            </ul>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => onSelectDoc(group.documents[0])}
                className="text-xs font-semibold text-slate-700 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>Open latest</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

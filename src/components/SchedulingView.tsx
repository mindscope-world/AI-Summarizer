import React, { useMemo } from 'react';
import { CalendarDays, Clock, CheckCircle2, Plus, BookOpen } from 'lucide-react';
import { DocumentSummary } from '../types';
import { describeDue, REVIEW_INTERVAL_DAYS, reviewSchedule, ReviewItem } from '../lib/insights';

interface SchedulingViewProps {
  documents: DocumentSummary[];
  onSelectDoc: (doc: DocumentSummary) => void;
  onNewDocClick: () => void;
  /** Saves a change to a document (used to record that a review was done). */
  onUpdateDocument: (doc: DocumentSummary) => void;
}

const STATUS_STYLES: Record<ReviewItem['status'], string> = {
  overdue: 'bg-red-50 text-red-600',
  today: 'bg-amber-50 text-amber-700',
  upcoming: 'bg-slate-100 text-slate-600',
};

/** A spaced-repetition revision list computed from when each summary was made and last reviewed. */
export const SchedulingView: React.FC<SchedulingViewProps> = ({
  documents,
  onSelectDoc,
  onNewDocClick,
  onUpdateDocument,
}) => {
  const schedule = useMemo(() => reviewSchedule(documents), [documents]);

  const markReviewed = (doc: DocumentSummary) => {
    onUpdateDocument({
      ...doc,
      reviewProgress: {
        scrollPercent: 0,
        maxScrollPercent: 0,
        reviewedBulletIndices: [],
        completedTaskIds: [],
        isFullyReviewed: false,
        ...doc.reviewProgress,
        lastReviewedAt: new Date().toISOString(),
      },
    });
  };

  const dueNow = schedule.items.filter((i) => i.status !== 'upcoming');

  return (
    <div className="flex-1 max-w-6xl mx-auto space-y-6 pb-16 text-xs">

      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">Revision Schedule</h1>
          <p className="text-slate-500">
            {dueNow.length
              ? `${dueNow.length} ${dueNow.length === 1 ? 'summary is' : 'summaries are'} due for review.`
              : 'Nothing is due right now. Reviews are scheduled automatically for every summary you make.'}
          </p>
        </div>
        <button
          onClick={onNewDocClick}
          className="px-4 py-2.5 bg-[#1E2333] hover:bg-[#2A3147] text-white font-semibold rounded-2xl flex items-center gap-2 shadow-xs transition-all shrink-0"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>New Summarization</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
            Upcoming Review Sessions
          </h3>

          {documents.length === 0 && (
            <div className="py-8 text-center space-y-2">
              <CalendarDays className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">No reviews scheduled</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">Create a summary and its review sessions will appear here.</p>
            </div>
          )}

          {documents.length > 0 && schedule.items.length === 0 && (
            <p className="py-6 text-center text-[11px] text-slate-500">Every summary has been through its full review schedule.</p>
          )}

          <ul className="space-y-3">
            {schedule.items.map((item) => (
              <li
                key={item.doc.id}
                className="p-4 rounded-2xl border bg-white border-slate-200 hover:border-emerald-300 shadow-2xs transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="font-semibold text-xs text-slate-900 block truncate">{item.doc.title}</span>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    {item.doc.category && (
                      <>
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{item.doc.category}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>Review {item.step} of {item.totalSteps}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-500 font-medium">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {describeDue(item)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_STYLES[item.status]}`}>
                    {item.status === 'today' ? 'due' : item.status}
                  </span>
                  <button
                    onClick={() => onSelectDoc(item.doc)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-emerald-700"
                    title="Open summary"
                    aria-label={`Open ${item.doc.title}`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => markReviewed(item.doc)}
                    className="p-1.5 hover:bg-emerald-50 rounded-lg text-slate-500 hover:text-emerald-700"
                    title="Mark as reviewed"
                    aria-label={`Mark ${item.doc.title} as reviewed`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {schedule.completed.length > 0 && (
            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              {schedule.completed.length} {schedule.completed.length === 1 ? 'summary has' : 'summaries have'} finished the full schedule.
            </p>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">How reviews are scheduled</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Spaced repetition revisits material at growing gaps, following the forgetting curve. Each summary is due for review {REVIEW_INTERVAL_DAYS.slice(0, -1).join(', ')} and {REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1]} days after you made it.
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Press the tick on a session when you have reviewed it. A review also covers any earlier session that was still waiting.
          </p>
        </div>

      </div>

    </div>
  );
};

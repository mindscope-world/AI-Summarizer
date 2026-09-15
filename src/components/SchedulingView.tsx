import React, { useState } from 'react';
import { CalendarDays, Clock, CheckCircle2, AlertCircle, Plus, BookOpen } from 'lucide-react';
import { DocumentSummary } from '../types';

interface SchedulingViewProps {
  documents: DocumentSummary[];
  onSelectDoc: (doc: DocumentSummary) => void;
  onNewDocClick: () => void;
}

export const SchedulingView: React.FC<SchedulingViewProps> = ({
  documents,
  onSelectDoc,
  onNewDocClick,
}) => {
  const [tasks, setTasks] = useState([
    {
      id: 'task-1',
      title: 'Review BERT Transformer Fine-Tuning Summary',
      course: 'BCSITP/0003/S24',
      dueDate: 'Tomorrow, 10:00 AM',
      status: 'pending',
      priority: 'high',
      docId: 'doc-5',
    },
    {
      id: 'task-2',
      title: 'Active Recall on Confidence & Leadership Reflection',
      course: 'LEAD-401',
      dueDate: 'Thursday, 02:00 PM',
      status: 'pending',
      priority: 'medium',
      docId: 'doc-1',
    },
    {
      id: 'task-3',
      title: 'Supervisor Meeting: Data & System Analysis Presentation',
      course: 'Department CSIT',
      dueDate: 'Friday, 11:00 AM',
      status: 'upcoming',
      priority: 'high',
      docId: 'doc-5',
    },
    {
      id: 'task-4',
      title: 'Complete Economics Multiple Choice Quiz Prep',
      course: 'ECON-201',
      dueDate: 'Next Monday, 09:00 AM',
      status: 'completed',
      priority: 'low',
      docId: 'doc-2',
    },
  ]);

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t));
  };

  return (
    <div className="flex-1 max-w-6xl mx-auto space-y-6 pb-16 text-xs">
      
      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">Academic Revision & Study Schedule</h1>
          <p className="text-slate-500">
            Automated spaced-repetition schedules, exam revision deadlines, and scheduled summary reviews.
          </p>
        </div>
        <button
          onClick={onNewDocClick}
          className="px-4 py-2.5 bg-[#1E2333] hover:bg-[#2A3147] text-white font-semibold rounded-2xl flex items-center gap-2 shadow-xs transition-all"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Schedule New Review</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Schedule List */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
            Upcoming Assessment & Review Sessions
          </h3>

          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                  task.status === 'completed' 
                    ? 'bg-slate-50/50 border-slate-200 opacity-60' 
                    : 'bg-white border-slate-200 hover:border-emerald-300 shadow-2xs'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors"
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 hover:border-emerald-500" />
                    )}
                  </button>

                  <div className="space-y-1">
                    <span className={`font-semibold text-xs text-slate-900 block ${task.status === 'completed' ? 'line-through text-slate-500' : ''}`}>
                      {task.title}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-medium">
                        {task.course}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-500 font-medium">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {task.dueDate}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    task.priority === 'high' ? 'bg-red-50 text-red-600' :
                    task.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {task.priority}
                  </span>
                  <button
                    onClick={() => {
                      const found = documents.find(d => d.id === task.docId) || documents[0];
                      if (found) onSelectDoc(found);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-emerald-700"
                    title="Open linked summary"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spaced Repetition Info */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">Spaced Repetition Algorithm</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Based on the Ebbinghaus forgetting curve, this automated system schedules review intervals (Day 1, Day 3, Day 7, Day 30) for synthesized lecture summaries to maximize retention prior to examinations.
          </p>

          <div className="p-4 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl space-y-2">
            <span className="font-bold text-emerald-900 block text-xs">Retention Boost</span>
            <p className="text-[11px] text-emerald-800">
              Students reviewing automated summaries on a spaced schedule demonstrate 47% higher recall on technical terminology.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};

import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  BookOpen, 
  ListChecks, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw, 
  Sparkles, 
  Clock, 
  CheckCheck, 
  FileText, 
  Award,
  ArrowDown
} from 'lucide-react';
import { ReviewMilestoneTask } from '../types';

interface ReviewProgressBarProps {
  scrollPercent: number;
  maxScrollPercent: number;
  tasks: ReviewMilestoneTask[];
  activeMode: 'scroll' | 'tasks' | 'holistic';
  onChangeMode: (mode: 'scroll' | 'tasks' | 'holistic') => void;
  onToggleTask: (taskId: string) => void;
  onMarkAllCompleted: () => void;
  onResetProgress: () => void;
  totalWords?: number;
  estimatedReadingTimeMinutes?: number;
  reviewedBulletCount: number;
  totalBulletCount: number;
}

export const ReviewProgressBar: React.FC<ReviewProgressBarProps> = ({
  scrollPercent,
  maxScrollPercent,
  tasks,
  activeMode,
  onChangeMode,
  onToggleTask,
  onMarkAllCompleted,
  onResetProgress,
  totalWords = 350,
  estimatedReadingTimeMinutes = 2,
  reviewedBulletCount,
  totalBulletCount,
}) => {
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);

  const completedTasksCount = tasks.filter(t => t.completed).length;
  const taskProgressPercent = tasks.length > 0 
    ? Math.round((completedTasksCount / tasks.length) * 100) 
    : 0;

  // Reading depth uses max scroll reached so far
  const scrollReadingPercent = Math.max(scrollPercent, maxScrollPercent);

  // Holistic score combines reading scroll depth (50%) and task milestones (50%)
  const holisticPercent = Math.round((scrollReadingPercent * 0.5) + (taskProgressPercent * 0.5));

  const currentDisplayPercent = 
    activeMode === 'scroll' 
      ? scrollReadingPercent 
      : activeMode === 'tasks' 
        ? taskProgressPercent 
        : holisticPercent;

  const isCompleted = currentDisplayPercent >= 100;

  // Words estimated read based on reading progress
  const wordsRead = Math.round((totalWords * currentDisplayPercent) / 100);
  const minutesLeft = Math.max(0, Math.ceil(estimatedReadingTimeMinutes * (1 - currentDisplayPercent / 100)));

  return (
    <div 
      id="document-review-progress-container"
      className="bg-slate-50/90 border-b border-slate-200/80 px-6 py-2.5 transition-all text-xs"
    >
      {/* Top Header Row with status, mode selector, and dropdown toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        
        {/* Left: Progress info & badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span 
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                isCompleted 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {isCompleted ? (
                <Award className="w-3.5 h-3.5" />
              ) : (
                <BookOpen className="w-3.5 h-3.5" />
              )}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-slate-900 text-sm tracking-tight">
                {currentDisplayPercent}%
              </span>
              <span className="text-slate-500 font-medium text-[11px]">
                {isCompleted 
                  ? 'Review Complete' 
                  : activeMode === 'scroll' 
                    ? 'Read (Scroll depth)' 
                    : activeMode === 'tasks' 
                      ? `Reviewed (${completedTasksCount}/${tasks.length} tasks)` 
                      : 'Reviewed (Holistic)'}
              </span>
            </div>
          </div>

          {/* Quick status pill */}
          <span 
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider hidden sm:inline-flex items-center gap-1 ${
              isCompleted 
                ? 'bg-emerald-100 text-emerald-800' 
                : currentDisplayPercent > 50 
                  ? 'bg-teal-100 text-teal-800' 
                  : 'bg-slate-200/80 text-slate-700'
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCheck className="w-3 h-3 text-emerald-600" />
                <span>Mastered</span>
              </>
            ) : currentDisplayPercent > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                <span>In Progress</span>
              </>
            ) : (
              <span>Not Started</span>
            )}
          </span>

          {/* Word count / read time metric */}
          <span className="text-slate-400 text-[11px] hidden md:inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>~{wordsRead}/{totalWords} words • {isCompleted ? 'Finished' : `${minutesLeft}m remaining`}</span>
          </span>
        </div>

        {/* Right: Mode switches & checklist expander */}
        <div className="flex items-center gap-2">
          
          {/* Mode Switcher */}
          <div 
            id="review-progress-mode-selector"
            className="flex items-center bg-white border border-slate-200/90 rounded-xl p-0.5 shadow-2xs text-[11px]"
          >
            <button
              id="mode-scroll-btn"
              onClick={() => onChangeMode('scroll')}
              title="Track progress strictly by scroll depth down the document"
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeMode === 'scroll'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ArrowDown className="w-3 h-3" />
              <span>Scroll</span>
            </button>
            <button
              id="mode-tasks-btn"
              onClick={() => onChangeMode('tasks')}
              title="Track progress by academic review task completion"
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeMode === 'tasks'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ListChecks className="w-3 h-3" />
              <span>Tasks ({completedTasksCount}/{tasks.length})</span>
            </button>
            <button
              id="mode-holistic-btn"
              onClick={() => onChangeMode('holistic')}
              title="Combined weighted score: 50% scroll reading + 50% comprehension tasks"
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 hidden sm:flex ${
                activeMode === 'holistic'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Holistic</span>
            </button>
          </div>

          {/* Toggle Checklist Dropdown */}
          <button
            id="toggle-milestones-checklist-btn"
            onClick={() => setIsChecklistOpen(!isChecklistOpen)}
            className={`px-2.5 py-1 rounded-xl border flex items-center gap-1 text-[11px] font-semibold transition-colors ${
              isChecklistOpen 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5 text-emerald-600" />
            <span>Checklist</span>
            {isChecklistOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

        </div>

      </div>

      {/* Visual Progress Bar Track */}
      <div className="mt-2.5 relative">
        <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden relative shadow-inner">
          <div 
            id="reading-progress-fill-bar"
            className={`h-full transition-all duration-300 ease-out rounded-full ${
              isCompleted
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-sm'
                : currentDisplayPercent > 60
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500'
                  : 'bg-gradient-to-r from-cyan-500 to-teal-500'
            }`}
            style={{ width: `${Math.max(2, currentDisplayPercent)}%` }}
          />
        </div>

        {/* Milestone Tick Marks (25%, 50%, 75%, 100%) */}
        <div className="absolute top-0 left-0 w-full h-2 pointer-events-none flex justify-between px-0.5">
          <span className="w-0.5 h-2 bg-white/60" style={{ marginLeft: '25%' }} />
          <span className="w-0.5 h-2 bg-white/60" style={{ marginLeft: '25%' }} />
          <span className="w-0.5 h-2 bg-white/60" style={{ marginLeft: '25%' }} />
        </div>
      </div>

      {/* Expandable Review Milestones Checklist Panel */}
      {isChecklistOpen && (
        <div 
          id="review-milestones-checklist-panel"
          className="mt-3 p-3.5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                <span>Academic Review Checklist & Tasks</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Mark items as you read and analyze the coursework summary.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={onMarkAllCompleted}
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 px-2 py-0.5 rounded hover:bg-emerald-50 transition-colors"
              >
                Mark All Done
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={onResetProgress}
                title="Reset review progress"
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Task Items List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onToggleTask(task.id)}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                  task.completed 
                    ? 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950' 
                    : 'bg-slate-50/50 border-slate-200/70 hover:bg-slate-100/70 text-slate-700'
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {task.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-400" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`font-semibold text-xs ${task.completed ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                      {task.title}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase text-slate-400 bg-white/80 border border-slate-200/60 shrink-0">
                      {task.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {task.description}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Bullet points review helper summary */}
          <div className="p-2 bg-slate-50 rounded-xl flex items-center justify-between text-[11px] text-slate-600 border border-slate-100">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Key Takeaway Bullets Reviewed:</span>
              <strong className="text-slate-800">{reviewedBulletCount} of {totalBulletCount}</strong>
            </span>
            <span className="text-[10px] text-slate-400 italic">
              Tip: Click checkmarks beside bullets in the text to review individual points.
            </span>
          </div>

        </div>
      )}

      {/* Completion Toast notification */}
      {isCompleted && (
        <div className="mt-2 py-1 px-3 bg-emerald-100/90 text-emerald-800 border border-emerald-200 rounded-xl flex items-center justify-between text-[11px] font-medium animate-in fade-in">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Document fully reviewed! Marked as mastered in your coursework tracker.</span>
          </span>
          <button 
            onClick={() => setIsChecklistOpen(false)}
            className="text-emerald-700 hover:text-emerald-950 underline font-semibold text-[10px]"
          >
            Dismiss
          </button>
        </div>
      )}

    </div>
  );
};

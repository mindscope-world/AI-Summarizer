import React from 'react';
import { FolderKanban, BookOpen, FileText, Plus, ChevronRight, GraduationCap } from 'lucide-react';
import { DocumentSummary } from '../types';

interface ProgramsViewProps {
  documents: DocumentSummary[];
  onSelectDoc: (doc: DocumentSummary) => void;
  onNewDocClick: () => void;
}

export const ProgramsView: React.FC<ProgramsViewProps> = ({
  documents,
  onSelectDoc,
  onNewDocClick,
}) => {
  const courses = [
    {
      code: 'BCSITP/0003/S24',
      name: 'Computer Science & IT Final Project',
      dept: 'Department of Computer Science and Information Technology',
      docsCount: documents.filter(d => d.category === 'Computer Science').length || 2,
      category: 'Computer Science',
      color: 'bg-blue-500',
    },
    {
      code: 'CSIT-402',
      name: 'Machine Learning & NLP Architectures',
      dept: 'Department of Computer Science',
      docsCount: 3,
      category: 'Machine Learning',
      color: 'bg-purple-500',
    },
    {
      code: 'LEAD-401',
      name: 'Leadership & Personal Development',
      dept: 'School of Humanities and Social Sciences',
      docsCount: documents.filter(d => d.category === 'Self-improvement' || d.category === 'Personal development').length || 2,
      category: 'Personal development',
      color: 'bg-emerald-500',
    },
    {
      code: 'ECON-201',
      name: 'Quantitative Economics & Development',
      dept: 'Department of Economics',
      docsCount: 1,
      category: 'Economics',
      color: 'bg-amber-500',
    },
  ];

  return (
    <div className="flex-1 max-w-6xl mx-auto space-y-6 pb-16 text-xs">
      
      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">Academic Programs & Course Modules</h1>
          <p className="text-slate-500">
            Coursework syllabi, lecture repositories, and summarized study materials organized by department.
          </p>
        </div>
        <button
          onClick={onNewDocClick}
          className="px-4 py-2.5 bg-[#1E2333] hover:bg-[#2A3147] text-white font-semibold rounded-2xl flex items-center gap-2 shadow-xs transition-all"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Upload Course Material</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((course) => (
          <div
            key={course.code}
            className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl ${course.color} text-white flex items-center justify-center font-bold text-xs shadow-xs`}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {course.code}
                  </span>
                  <h3 className="font-bold text-sm text-slate-900 mt-1">{course.name}</h3>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {course.docsCount} Summaries
              </span>
            </div>

            <p className="text-[11px] text-slate-500">{course.dept}</p>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" />
                Active Syllabus Ingested
              </span>
              <button
                onClick={() => {
                  const match = documents.find(d => d.category === course.category) || documents[0];
                  if (match) onSelectDoc(match);
                }}
                className="text-xs font-semibold text-slate-700 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>View Summaries</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

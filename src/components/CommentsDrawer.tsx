import React, { useState } from 'react';
import { X, Send, MessageSquare, Trash2 } from 'lucide-react';
import { CommentItem } from '../types';

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  comments: CommentItem[];
  onAddComment: (commentText: string) => void;
  onDeleteComment?: (id: string) => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  onClose,
  comments,
  onAddComment,
  onDeleteComment,
}) => {
  const [newComment, setNewComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    onAddComment(newComment.trim());
    setNewComment('');
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-80 lg:w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
            Comments & Supervisor Feedback ({comments.length})
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List of comments */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
        {comments.map((item) => (
          <div
            key={item.id}
            className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img
                  src={item.avatar}
                  alt={item.author}
                  className="w-6 h-6 rounded-full object-cover border border-slate-200"
                />
                <span className="font-bold text-slate-900 text-xs">{item.author}</span>
              </div>
              <span className="text-[10px] text-slate-400">{item.timestamp}</span>
            </div>
            <p className="text-slate-700 leading-relaxed pl-8">
              {item.text}
            </p>
          </div>
        ))}

        {comments.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="font-medium text-slate-600">No comments yet</p>
            <p className="text-[11px] mt-1">Leave annotations or questions for your project supervisor.</p>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100 bg-white">
        <div className="relative flex items-center">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment or question..."
            className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-400 text-slate-800"
          />
          <button
            type="submit"
            disabled={!newComment.trim()}
            className="absolute right-1.5 w-7 h-7 rounded-lg bg-[#1E2333] hover:bg-[#2A3147] disabled:opacity-40 text-white flex items-center justify-center transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

    </div>
  );
};

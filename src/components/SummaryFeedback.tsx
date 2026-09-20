import React, {useEffect, useId, useState} from 'react';
import {CheckCircle2, Send, Star} from 'lucide-react';
import type {FeedbackEntry} from '../types';

export interface FeedbackSubmission {
  rating: number;
  comment: string;
  consent: boolean;
}

interface SummaryFeedbackProps {
  /** The rating already given for this summary, if any. */
  entry: FeedbackEntry | null;
  onSubmit: (submission: FeedbackSubmission) => Promise<void>;
}

const RATING_LABELS = ['Not useful', 'Poor', 'Okay', 'Good', 'Excellent'];

/** Rate one summary, with an optional comment. Saved to the student's account when they submit. */
export const SummaryFeedback: React.FC<SummaryFeedbackProps> = ({entry, onSubmit}) => {
  const [rating, setRating] = useState(entry?.rating ?? 0);
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [consent, setConsent] = useState(entry?.consent ?? false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const commentId = useId();

  // A different summary (or a rating that just loaded) starts from what was stored for it.
  useEffect(() => {
    setRating(entry?.rating ?? 0);
    setComment(entry?.comment ?? '');
    setConsent(entry?.consent ?? false);
    setStatus('idle');
    setError(null);
  }, [entry?.id, entry?.rating, entry?.comment, entry?.consent]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || status === 'saving') return;
    setStatus('saving');
    setError(null);
    try {
      await onSubmit({rating, comment, consent});
      setStatus('saved');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Could not save your rating.');
    }
  };

  return (
    <form onSubmit={submit} aria-label="Rate this summary" className="mt-4 p-4 rounded-2xl border border-slate-200/80 bg-white space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-900">{entry ? 'Your rating of this summary' : 'How useful was this summary?'}</span>
        <div role="radiogroup" aria-label="Rating" className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} of 5: ${RATING_LABELS[n - 1]}`}
              onClick={() => {
                setRating(n);
                setStatus('idle');
              }}
              className="p-1 rounded-md hover:scale-110 transition-transform focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <Star className={`w-4 h-4 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
      </div>

      {rating > 0 && (
        <>
          <div>
            <label htmlFor={commentId} className="sr-only">
              Comment on this summary (optional)
            </label>
            <textarea
              id={commentId}
              rows={2}
              maxLength={5000}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setStatus('idle');
              }}
              placeholder="What was accurate, missing or wrong? (optional)"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs text-slate-800 resize-none focus:border-emerald-500"
            />
          </div>

          <label className="flex items-start gap-2 text-[11px] text-slate-600 leading-snug">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setStatus('idle');
              }}
              className="mt-0.5"
            />
            <span>
              Use this summary as an example to improve my future summaries. If you rate it 4 or 5, a short part of it is shown to the AI as a style guide the next time you summarise something in the same subject.
              It is not shared with other students.
            </span>
          </label>

          <div className="flex items-center justify-end gap-3">
            {error && (
              <span role="alert" className="text-[11px] text-red-700 mr-auto">
                {error}
              </span>
            )}
            {status === 'saved' && (
              <span role="status" className="text-[11px] text-emerald-700 font-semibold inline-flex items-center gap-1 mr-auto">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved. Thank you.
              </span>
            )}
            <button
              type="submit"
              disabled={status === 'saving'}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
            >
              <Send className="w-3 h-3" />
              {status === 'saving' ? 'Saving...' : entry ? 'Update rating' : 'Submit rating'}
            </button>
          </div>
        </>
      )}
    </form>
  );
};

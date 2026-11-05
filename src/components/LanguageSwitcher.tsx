import React from 'react';
import {Languages, Loader2, RefreshCw, X} from 'lucide-react';
import type {DocumentSummary} from '../types';
import {contentIn, languagesOf, originalLanguage, translationTargets} from '../lib/documentView';
import {cn} from '../lib/utils';

interface LanguageSwitcherProps {
  document: DocumentSummary;
  /** The language currently shown. */
  value: string;
  onChange: (language: string) => void;
  /** Ask for a (new) translation into this language. */
  onTranslate: (language: string) => void;
  onCancel: () => void;
  /** The language being translated right now, if any. */
  translating: string | null;
  error: string | null;
}

/** Switch a summary between its languages, or request a translation into one it does not have yet. */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({document, value, onChange, onTranslate, onCancel, translating, error}) => {
  const have = languagesOf(document);
  const original = originalLanguage(document);
  const targets = translationTargets(document);
  const shown = contentIn(document, value);

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]" role="group" aria-label="Summary language">
      <Languages className="w-3.5 h-3.5 text-slate-400" aria-hidden />
      {have.map((language) => (
        <button
          key={language}
          type="button"
          onClick={() => onChange(language)}
          aria-pressed={language === value}
          className={cn(
            'px-2.5 py-1 rounded-full border font-semibold transition-colors',
            language === value ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
          )}
        >
          {language}
          {language === original && <span className="ml-1 font-normal opacity-70">(original)</span>}
        </button>
      ))}

      {targets
        .filter((language) => !have.includes(language))
        .map((language) => (
          <button
            key={language}
            type="button"
            disabled={translating !== null}
            onClick={() => onTranslate(language)}
            className="px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-600 font-semibold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50"
          >
            Translate to {language}
          </button>
        ))}

      {translating && (
        <span role="status" className="flex items-center gap-1.5 text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          Translating to {translating}...
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-800 font-semibold">
            <X className="w-3 h-3" aria-hidden />
            Cancel
          </button>
        </span>
      )}

      {value !== original && !translating && (
        <button
          type="button"
          onClick={() => onTranslate(value)}
          title="Translate the current text again"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 font-semibold"
        >
          <RefreshCw className="w-3 h-3" aria-hidden />
          {shown.stale ? 'Update translation' : 'Re-translate'}
        </button>
      )}

      {value !== original && (
        <span className="w-full text-slate-500">
          {shown.stale
            ? 'Some points were added after this translation, so they are shown in the original language until you update it.'
            : `Translated by ${shown.model ?? 'an AI model'}. Check important wording against the original.`}
        </span>
      )}
      {error && (
        <span role="alert" className="w-full text-red-700">
          {error}
        </span>
      )}
    </div>
  );
};

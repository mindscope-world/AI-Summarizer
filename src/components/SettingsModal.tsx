import React, { useState } from 'react';
import { X, Server, Key, Cpu, Shield, Database, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:8000/api/v1');
  const [selectedModel, setSelectedModel] = useState('bert-academic-v2');
  const [useOcr, setUseOcr] = useState(true);
  const [enableSwahili, setEnableSwahili] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">System & Backend Configuration</h3>
              <p className="text-[11px] text-slate-500">Frontend hook points for developer backend integration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          
          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-blue-900 leading-relaxed text-[11px]">
            <span className="font-bold">Developer Notice:</span> The user requested frontend-only construction with backend hooks left open. Configure your server endpoints below for seamless connection with your Django / Flask API.
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Backend API Base URL
            </label>
            <input
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs"
              placeholder="https://api.eastafrica.edu/summarize"
            />
            <p className="text-[10px] text-slate-400 mt-1">Routes expected: /api/summarize, /api/documents, /api/feedback</p>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Default Transformer Checkpoint
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs"
            >
              <option value="bert-academic-v2">BERT-Academic-v2.4 (Fine-tuned for Thesis & Coursework)</option>
              <option value="t5-eastafrica">T5-EastAfrica (Abstractive & Swahili Translation)</option>
              <option value="spacy-extractive">spaCy Extractive TextRank Engine</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 block">Tesseract OCR Document Ingestion</span>
                <span className="text-[11px] text-slate-400">Extracts text from scanned PDFs and photocopied lecture handouts</span>
              </div>
              <input
                type="checkbox"
                checked={useOcr}
                onChange={(e) => setUseOcr(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 block">Multilingual Swahili Support</span>
                <span className="text-[11px] text-slate-400">Allow automatic summarization & translation into Kiswahili</span>
              </div>
              <input
                type="checkbox"
                checked={enableSwahili}
                onChange={(e) => setEnableSwahili(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#1E2333] hover:bg-[#2A3147] text-white font-semibold rounded-xl flex items-center gap-1.5 shadow-xs"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Preferences Saved!</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

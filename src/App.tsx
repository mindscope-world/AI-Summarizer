/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useEffect, useMemo, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { SidebarHistory } from './components/SidebarHistory';
import { CommentsDrawer } from './components/CommentsDrawer';
import { DocumentSummary, NavigationTab, CommentItem, ExportFormat } from './types';
import { describeApiError, exportDocument } from './lib/api';
import { toExportDocument } from './lib/documentView';
import { saveBlob } from './lib/download';
import { auth, useAuth } from './lib/auth';
import { arrivedFromAuthRedirect, supabase } from './lib/supabase';
import { createRepository, newId } from './lib/repository';
import { createFeedbackRepository } from './lib/feedback';
import { useFeedback } from './lib/useFeedback';
import type { FeedbackSubmission } from './components/SummaryFeedback';
import { useDocuments } from './lib/useDocuments';
import { useLegacyImport } from './lib/useLegacyImport';
import { useStableCallback } from './lib/useStableCallback';
import { Sparkles } from 'lucide-react';

// Each screen is its own chunk, loaded when first needed: the landing page and the editor are the
// largest, and a signed-in student never needs the landing page's artwork and vice versa.
const LandingView = lazy(() => import('./components/LandingView').then((m) => ({ default: m.LandingView })));
const MainEditorView = lazy(() => import('./components/MainEditorView').then((m) => ({ default: m.MainEditorView })));
const DashboardView = lazy(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const ProgramsView = lazy(() => import('./components/ProgramsView').then((m) => ({ default: m.ProgramsView })));
const SchedulingView = lazy(() => import('./components/SchedulingView').then((m) => ({ default: m.SchedulingView })));
const MetricsView = lazy(() => import('./components/MetricsView').then((m) => ({ default: m.MetricsView })));
const NewSummaryModal = lazy(() => import('./components/NewSummaryModal').then((m) => ({ default: m.NewSummaryModal })));
const ArchitectureModal = lazy(() => import('./components/ArchitectureModal').then((m) => ({ default: m.ArchitectureModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));

const ScreenFallback = () => (
  <div role="status" className="py-24 text-center text-sm text-slate-500">
    Loading...
  </div>
);

export default function App() {
  // Navigation tab state: the public landing page is what visitors see first.
  const [activeTab, setActiveTab] = useState<NavigationTab>('Landing');

  // Who is signed in. Everything except the Landing page needs a signed-in user.
  const authState = useAuth();
  const authUser = authState.status === 'signedIn' ? authState.user : null;

  // The signed-in user's documents live in Supabase, isolated per account by Row Level Security.
  const repo = useMemo(
    () =>
      authUser && supabase
        ? createRepository(supabase, authUser.id, { fullName: authUser.fullName, avatarUrl: authUser.avatarUrl })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authUser?.id],
  );
  const docs = useDocuments(repo);

  // Ratings the student has given their summaries (private to them, like everything else).
  const feedbackRepo = useMemo(
    () => (authUser && supabase ? createFeedbackRepository(supabase, authUser.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authUser?.id],
  );
  const feedback = useFeedback(feedbackRepo);
  const documents = docs.documents;
  const legacy = useLegacyImport(repo, authUser?.id ?? null, docs.reload);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Modals & Panels
  const [isNewSummaryOpen, setIsNewSummaryOpen] = useState(false);
  // Once opened, the summary dialog stays mounted (hidden) so a summary still being written survives closing it.
  const [newSummaryLoaded, setNewSummaryLoaded] = useState(false);
  useEffect(() => {
    if (isNewSummaryOpen) setNewSummaryLoaded(true);
  }, [isNewSummaryOpen]);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  // Active toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentDoc: DocumentSummary | null = documents.find((d) => d.id === selectedDocId) ?? documents[0] ?? null;
  const currentDocId = currentDoc?.id;

  // The workspace is only reachable while signed in; signing out (or an expired session) returns to Landing.
  const tab: NavigationTab = authUser ? activeTab : 'Landing';
  useEffect(() => {
    if (authState.status === 'signedOut') {
      setActiveTab('Landing');
      setSelectedDocId(null);
      setIsNewSummaryOpen(false);
      setIsSettingsOpen(false);
      setIsCommentsOpen(false);
    }
  }, [authState.status]);

  // Coming back from a sign-in link (email confirmation, magic link, Google) opens the workspace,
  // like signing in from the dialog does. Only once per page load, so signing out still shows Landing.
  const redirectHandled = useRef(!arrivedFromAuthRedirect);
  useEffect(() => {
    if (authState.status === 'signedIn' && !redirectHandled.current) {
      redirectHandled.current = true;
      setActiveTab('Dashboard');
    }
  }, [authState.status]);

  // The (large) source text is fetched the first time a document is opened.
  const { loadSource } = docs;
  useEffect(() => {
    if (currentDocId && tab === 'Journal') void loadSource(currentDocId);
  }, [currentDocId, tab, loadSource]);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = (msg: string, ms = 3000) => {
    setToastMessage(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), ms);
  };

  const handleUpdateDocument = docs.update;

  // Stable identities: the history list is memoised, so an edit re-renders only the card that changed.
  const handleSelectDocument = useStableCallback((doc: DocumentSummary) => {
    setSelectedDocId(doc.id);
    if (activeTab !== 'Journal') {
      setActiveTab('Journal');
    }
  });

  const handleDeleteDocument = useStableCallback(async (docId: string) => {
    if (await docs.remove(docId)) {
      if (selectedDocId === docId) setSelectedDocId(null);
      showToast('Reflection removed from history.');
    }
  });

  const handleDuplicateDocument = useStableCallback(async (doc: DocumentSummary) => {
    const sourceText = doc.sourceText ?? (await repo?.loadSourceText(doc.id)) ?? undefined;
    const now = new Date().toISOString();
    const dup: DocumentSummary = {
      ...doc,
      id: newId(),
      title: `${doc.title} (Copy)`,
      createdAt: now,
      updatedAt: now,
      sourceText,
      // Comments are rows with their own ids, so the copy gets its own.
      comments: doc.comments.map((c) => ({ ...c, id: newId() })),
    };
    await docs.add(dup);
    setSelectedDocId(dup.id);
    showToast('Reflection duplicated successfully.');
  });

  const handleNewDocumentCreated = async (newDoc: DocumentSummary, options?: { originalFile?: File | null }) => {
    setSelectedDocId(newDoc.id);
    setActiveTab('Journal');
    showToast(`Summary generated for "${newDoc.title}".`);
    const { warnings } = await docs.add(newDoc, options);
    if (warnings.length) showToast(warnings[0]);
  };

  const handleAddComment = (commentText: string) => {
    if (!currentDoc || !authUser) return;
    const newComment: CommentItem = {
      id: newId(),
      author: authUser.fullName,
      avatar: authUser.avatarUrl,
      text: commentText,
      timestamp: 'Just now',
    };
    handleUpdateDocument({ ...currentDoc, comments: [...currentDoc.comments, newComment] });
    showToast('Comment added.');
  };

  const handleSubmitFeedback = async (doc: DocumentSummary, submission: FeedbackSubmission) => {
    if (!authUser) return;
    const meta = doc.sourceMetadata;
    await feedback.submit({
      documentId: doc.id,
      rating: submission.rating,
      comment: submission.comment,
      consent: submission.consent,
      role: authUser.role,
      model: meta?.modelUsed,
      params: {
        mode: meta?.summaryMode,
        length: meta?.summaryLength,
        language: meta?.language,
        category: doc.category || undefined,
        usedExamples: (meta?.examplesUsed ?? 0) > 0,
      },
    });
  };

  const getExamples = useMemo(
    () => (feedbackRepo ? (category: string, language: string) => feedbackRepo.examples({ category, language }) : undefined),
    [feedbackRepo],
  );
  const loadAggregates = useMemo(() => (feedbackRepo ? () => feedbackRepo.aggregates() : undefined), [feedbackRepo]);

  const exporting = useRef(false);
  const handleExport = async (format: ExportFormat, language: string) => {
    if (!currentDoc || exporting.current) return;
    exporting.current = true;
    showToast(`Preparing your ${format.toUpperCase()} file...`);
    try {
      const file = await exportDocument(format, toExportDocument(currentDoc, language));
      saveBlob(file.blob, file.fileName);
      showToast(file.warning ?? `Exported ${file.fileName}.`, file.warning ? 8000 : undefined);
    } catch (err) {
      showToast(describeApiError(err), 6000);
    } finally {
      exporting.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Top Workspace Navbar (hidden when viewing the public/marketing Landing page) */}
      {tab !== 'Landing' && (
        <Navbar
          activeTab={tab}
          onTabChange={setActiveTab}
          onOpenArchitecture={() => setIsArchitectureOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSignOut={() => void auth.signOut()}
        />
      )}

      {/* Main App Container */}
      <main className={tab === 'Landing' ? 'flex-1 w-full p-0 overflow-x-hidden' : 'flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-4 lg:p-6 transition-all'}>
        <Suspense fallback={<ScreenFallback />}>
        
        {/* Tab 0: Academic System Landing Page */}
        {tab === 'Landing' && (
          <LandingView
            onLaunchApp={(tab) => setActiveTab(tab || 'Journal')}
            onOpenNewSummary={() => setIsNewSummaryOpen(true)}
            onOpenArchitecture={() => setIsArchitectureOpen(true)}
          />
        )}

        {/* Offer to bring over summaries this browser saved before accounts existed */}
        {tab !== 'Landing' && legacy.count > 0 && (
          <div role="region" aria-label="Import saved summaries" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 flex flex-wrap items-center gap-3">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="flex-1 min-w-[16rem]">
              This browser has <strong>{legacy.count}</strong> summar{legacy.count === 1 ? 'y' : 'ies'} saved from before accounts. Add {legacy.count === 1 ? 'it' : 'them'} to your account?
              {legacy.error && <span className="block text-red-700 mt-1">{legacy.error}</span>}
            </span>
            <button
              type="button"
              disabled={legacy.importing}
              onClick={() => void legacy.run().then((n) => n && showToast(`Imported ${n} summar${n === 1 ? 'y' : 'ies'}.`))}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold disabled:opacity-50"
            >
              {legacy.importing ? 'Importing...' : 'Add to my account'}
            </button>
            <button type="button" onClick={legacy.dismiss} className="px-3 py-1.5 rounded-xl text-emerald-800 hover:bg-emerald-100 font-semibold">
              Not now
            </button>
          </div>
        )}

        {/* Loading / error while the workspace data arrives */}
        {tab !== 'Landing' && docs.status === 'loading' && (
          <div role="status" className="py-24 text-center text-sm text-slate-500">Loading your summaries...</div>
        )}
        {tab !== 'Landing' && docs.status === 'error' && (
          <div role="alert" className="max-w-md mx-auto py-20 text-center space-y-3">
            <p className="text-sm text-slate-700">{docs.loadError ?? 'Could not load your summaries.'}</p>
            <button type="button" onClick={() => void docs.reload()} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold">
              Try again
            </button>
          </div>
        )}

        {/* Tab 1: Journal (Primary View matching image.png!) */}
        {tab === 'Journal' && docs.status === 'ready' && (
          <div className="flex flex-col lg:flex-row items-start gap-4 lg:gap-5 w-full">
            
            {/* Left Sidebar: History of reflection */}
            <SidebarHistory
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocument={handleSelectDocument}
              onNewReflectionClick={() => setIsNewSummaryOpen(true)}
              onDeleteDocument={handleDeleteDocument}
              onDuplicateDocument={handleDuplicateDocument}
            />

            {/* Right Main Editor Canvas */}
            {currentDoc ? (
              <MainEditorView
                document={currentDoc}
                onUpdateDocument={handleUpdateDocument}
                onToggleComments={() => setIsCommentsOpen(!isCommentsOpen)}
                isCommentsOpen={isCommentsOpen}
                onExport={handleExport}
                feedback={
                  feedbackRepo
                    ? { entry: feedback.forDocument(currentDoc.id), onSubmit: (submission) => handleSubmitFeedback(currentDoc, submission) }
                    : undefined
                }
              />
            ) : (
              <div className="flex-1 min-w-0 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-10 text-center space-y-3">
                <h2 className="text-base font-bold text-slate-900">No summaries yet</h2>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload a PDF or Word file, paste a link or some notes, and get a structured summary with discussion questions.
                </p>
                <button
                  type="button"
                  onClick={() => setIsNewSummaryOpen(true)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  Create your first summary
                </button>
              </div>
            )}

          </div>
        )}

        {/* Tab 2: Dashboard Overview */}
        {tab === 'Dashboard' && docs.status === 'ready' && (
          <DashboardView
            documents={documents}
            onSelectDoc={handleSelectDocument}
            onNewDocClick={() => setIsNewSummaryOpen(true)}
            onOpenArchitecture={() => setIsArchitectureOpen(true)}
          />
        )}

        {/* Tab 3: Programs & Coursework */}
        {tab === 'Programs' && docs.status === 'ready' && (
          <ProgramsView
            documents={documents}
            onSelectDoc={handleSelectDocument}
            onNewDocClick={() => setIsNewSummaryOpen(true)}
          />
        )}

        {/* Tab 4: Scheduling & Revision */}
        {tab === 'Scheduling' && docs.status === 'ready' && (
          <SchedulingView
            documents={documents}
            onSelectDoc={handleSelectDocument}
            onNewDocClick={() => setIsNewSummaryOpen(true)}
            onUpdateDocument={handleUpdateDocument}
          />
        )}

        {/* Tab 5: Technical Metrics & Evaluation */}
        {tab === 'Metrics' && docs.status === 'ready' && authUser && (
          <MetricsView
            documents={documents}
            feedback={{ entries: feedback.entries, status: feedback.status, error: feedback.error }}
            role={authUser.role}
            loadAggregates={loadAggregates}
          />
        )}

        </Suspense>
      </main>

      {/* Slide-over Comments Drawer */}
      <CommentsDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        comments={currentDoc?.comments ?? []}
        onAddComment={handleAddComment}
      />

      <Suspense fallback={null}>
        {/* New Summarization & Ingestion Modal */}
        {newSummaryLoaded && (
          <NewSummaryModal
            isOpen={isNewSummaryOpen}
            onClose={() => setIsNewSummaryOpen(false)}
            onCreated={handleNewDocumentCreated}
            getExamples={getExamples}
          />
        )}

        {/* How the system works */}
        {isArchitectureOpen && <ArchitectureModal isOpen onClose={() => setIsArchitectureOpen(false)} />}

        {/* Settings Modal */}
        {isSettingsOpen && <SettingsModal isOpen onClose={() => setIsSettingsOpen(false)} />}
      </Suspense>

      {/* A save that failed is never silent */}
      {docs.saveError && (
        <div role="alert" className="fixed bottom-5 left-5 z-50 max-w-sm bg-red-700 text-white text-xs py-3 px-4 rounded-2xl shadow-xl space-y-2">
          <p>{docs.saveError}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void docs.retrySave()} className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 font-semibold">
              Retry
            </button>
            <button type="button" onClick={docs.dismissSaveError} className="px-3 py-1 rounded-lg hover:bg-white/10 font-semibold">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Toast notification banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#1E2333] text-white text-xs font-semibold py-2.5 px-4 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}

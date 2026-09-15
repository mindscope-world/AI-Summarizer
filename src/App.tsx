/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SidebarHistory } from './components/SidebarHistory';
import { MainEditorView } from './components/MainEditorView';
import { DashboardView } from './components/DashboardView';
import { LandingView } from './components/LandingView';
import { ProgramsView } from './components/ProgramsView';
import { SchedulingView } from './components/SchedulingView';
import { MetricsView } from './components/MetricsView';
import { NewSummaryModal } from './components/NewSummaryModal';
import { ArchitectureModal } from './components/ArchitectureModal';
import { SettingsModal } from './components/SettingsModal';
import { CommentsDrawer } from './components/CommentsDrawer';
import { initialDocuments } from './data/mockDocuments';
import { DocumentSummary, NavigationTab, CommentItem } from './types';

export default function App() {
  // Navigation tab state (Journal is default, matching image.png)
  const [activeTab, setActiveTab] = useState<NavigationTab>('Journal');

  // Documents state with local persistence
  const [documents, setDocuments] = useState<DocumentSummary[]>(() => {
    const saved = localStorage.getItem('leaderforge_summaries');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved documents', e);
      }
    }
    return initialDocuments;
  });

  // Selected document (default to doc-1: "New horizons of confidence" matching image.png)
  const [selectedDocId, setSelectedDocId] = useState<string>('doc-1');

  // Global search query
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Panels
  const [isNewSummaryOpen, setIsNewSummaryOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  // User role
  const [userRole, setUserRole] = useState<'student' | 'researcher' | 'faculty'>('student');

  // Active toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Persist documents
  useEffect(() => {
    localStorage.setItem('leaderforge_summaries', JSON.stringify(documents));
  }, [documents]);

  const currentDoc = documents.find((d) => d.id === selectedDocId) || documents[0] || initialDocuments[0];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUpdateDocument = useCallback((updatedDoc: DocumentSummary) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === updatedDoc.id ? updatedDoc : doc))
    );
  }, []);

  const handleSelectDocument = (doc: DocumentSummary) => {
    setSelectedDocId(doc.id);
    if (activeTab !== 'Journal') {
      setActiveTab('Journal');
    }
  };

  const handleDeleteDocument = (docId: string) => {
    if (documents.length <= 1) {
      showToast('Cannot delete the last remaining document.');
      return;
    }
    const remaining = documents.filter((d) => d.id !== docId);
    setDocuments(remaining);
    if (selectedDocId === docId) {
      setSelectedDocId(remaining[0].id);
    }
    showToast('Reflection removed from history.');
  };

  const handleDuplicateDocument = (doc: DocumentSummary) => {
    const dup: DocumentSummary = {
      ...doc,
      id: `doc-${Date.now()}`,
      title: `${doc.title} (Copy)`,
      dateBadge: 'Today',
      timeAgoGroup: 'Last 7 days',
      createdDate: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: '2-digit',
        year: 'numeric',
      }) + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    setDocuments([dup, ...documents]);
    setSelectedDocId(dup.id);
    showToast('Reflection duplicated successfully.');
  };

  const handleNewDocumentCreated = (newDoc: DocumentSummary) => {
    setDocuments([newDoc, ...documents]);
    setSelectedDocId(newDoc.id);
    setActiveTab('Journal');
    showToast(`Summary generated for "${newDoc.title}".`);
  };

  const handleAddComment = (commentText: string) => {
    const newComment: CommentItem = {
      id: `c-${Date.now()}`,
      author: userRole === 'faculty' ? 'Supervisor (Faculty)' : 'Noel Juma Muhemba',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      text: commentText,
      timestamp: 'Just now',
    };
    const updated = {
      ...currentDoc,
      comments: [...currentDoc.comments, newComment],
    };
    handleUpdateDocument(updated);
    showToast('Comment added.');
  };

  const handleExport = (format: 'pdf' | 'docx' | 'txt' | 'md') => {
    const filename = `${currentDoc.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_summary.${format}`;
    const content = `# ${currentDoc.title}\n` +
      `Date: ${currentDoc.createdDate}\n` +
      `Institution: The East Africa University\n` +
      `Category: ${currentDoc.category}\n` +
      `Tags: ${currentDoc.tags.join(', ')}\n\n` +
      `## Summary\n` +
      `${currentDoc.contentParagraphs.join('\n\n')}\n\n` +
      `## Salient Takeaways\n` +
      `${currentDoc.bulletPoints.map(b => `- **${b.title}** ${b.text}`).join('\n')}\n\n` +
      `## Discussion & Revision Questions\n` +
      `${currentDoc.discussionQuestions.map((q, i) => `${i + 1}. ${q.question} (${q.context})`).join('\n')}\n\n` +
      (currentDoc.userNotes ? `## Student Notes\n${currentDoc.userNotes}\n` : '');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename} successfully!`);
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Top Workspace Navbar (hidden when viewing the public/marketing Landing page) */}
      {activeTab !== 'Landing' && (
        <Navbar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenArchitecture={() => setIsArchitectureOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          userRole={userRole}
          onRoleChange={setUserRole}
        />
      )}

      {/* Main App Container */}
      <main className={activeTab === 'Landing' ? 'flex-1 w-full p-0 overflow-x-hidden' : 'flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-4 lg:p-6 transition-all'}>
        
        {/* Tab 0: Academic System Landing Page */}
        {activeTab === 'Landing' && (
          <LandingView
            onLaunchApp={(tab) => setActiveTab(tab || 'Journal')}
            onOpenNewSummary={() => setIsNewSummaryOpen(true)}
            onOpenArchitecture={() => setIsArchitectureOpen(true)}
            onSelectDoc={handleSelectDocument}
            sampleDocs={documents}
          />
        )}

        {/* Tab 1: Journal (Primary View matching image.png!) */}
        {activeTab === 'Journal' && (
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
            <MainEditorView
              document={currentDoc}
              onUpdateDocument={handleUpdateDocument}
              onToggleComments={() => setIsCommentsOpen(!isCommentsOpen)}
              isCommentsOpen={isCommentsOpen}
              onExport={handleExport}
            />

          </div>
        )}

        {/* Tab 2: Dashboard Overview */}
        {activeTab === 'Dashboard' && (
          <DashboardView
            documents={documents}
            onSelectDoc={handleSelectDocument}
            onNewDocClick={() => setIsNewSummaryOpen(true)}
            onOpenArchitecture={() => setIsArchitectureOpen(true)}
          />
        )}

        {/* Tab 3: Programs & Coursework */}
        {activeTab === 'Programs' && (
          <ProgramsView
            documents={documents}
            onSelectDoc={handleSelectDocument}
            onNewDocClick={() => setIsNewSummaryOpen(true)}
          />
        )}

        {/* Tab 4: Scheduling & Revision */}
        {activeTab === 'Scheduling' && (
          <SchedulingView
            documents={documents}
            onSelectDoc={handleSelectDocument}
            onNewDocClick={() => setIsNewSummaryOpen(true)}
          />
        )}

        {/* Tab 5: Technical Metrics & Evaluation */}
        {activeTab === 'Metrics' && (
          <MetricsView />
        )}

      </main>

      {/* Slide-over Comments Drawer */}
      <CommentsDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        comments={currentDoc.comments}
        onAddComment={handleAddComment}
      />

      {/* New Summarization & Ingestion Modal */}
      <NewSummaryModal
        isOpen={isNewSummaryOpen}
        onClose={() => setIsNewSummaryOpen(false)}
        onCreated={handleNewDocumentCreated}
      />

      {/* System Architecture 6-Stage Workflow Modal */}
      <ArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

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

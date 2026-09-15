import React, { useState } from 'react';
import { 
  Search, 
  SlidersHorizontal, 
  Calendar, 
  MoreHorizontal, 
  Plus, 
  Trash2, 
  Copy, 
  Sparkles,
  FileText
} from 'lucide-react';
import { DocumentSummary } from '../types';
import { getCategoryBadgeStyles, cn } from '../lib/utils';

interface SidebarHistoryProps {
  documents: DocumentSummary[];
  selectedDocId: string;
  onSelectDocument: (doc: DocumentSummary) => void;
  onNewReflectionClick: () => void;
  onDeleteDocument: (docId: string) => void;
  onDuplicateDocument: (doc: DocumentSummary) => void;
}

export const SidebarHistory: React.FC<SidebarHistoryProps> = ({
  documents,
  selectedDocId,
  onSelectDocument,
  onNewReflectionClick,
  onDeleteDocument,
  onDuplicateDocument,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | 'all'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [openMenuDocId, setOpenMenuDocId] = useState<string | null>(null);

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = 
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = activeCategoryFilter === 'all' || doc.category === activeCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Group by timeAgoGroup
  const last7Days = filteredDocuments.filter(d => d.timeAgoGroup === 'Last 7 days');
  const last30Days = filteredDocuments.filter(d => d.timeAgoGroup === 'Last 30 days');
  const older = filteredDocuments.filter(d => d.timeAgoGroup === 'Older');

  const categories = Array.from(new Set(documents.map(d => d.category)));

  return (
    <aside className="w-full lg:w-[320px] xl:w-[340px] shrink-0 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col p-4 sm:p-5 h-[calc(100vh-80px)] sticky top-20 overflow-hidden">
      
      {/* Title matching image.png */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[17px] font-bold text-slate-900 tracking-tight">
          History of reflection
        </h2>
      </div>

      {/* Search and filter bar matching image.png */}
      <div className="relative mb-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            id="sidebar-history-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search"
            className="w-full pl-9.5 pr-3 py-2 text-xs bg-slate-50/80 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-slate-300 rounded-xl outline-none transition-all placeholder:text-slate-400 text-slate-800"
          />
        </div>

        {/* Filter button */}
        <div className="relative">
          <button
            id="sidebar-filter-toggle-btn"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            title="Filter by category"
            className={cn(
              "w-9 h-9 rounded-xl border flex items-center justify-center transition-colors",
              showFilterMenu || activeCategoryFilter !== 'all'
                ? "bg-slate-900 text-white border-slate-900"
                : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {showFilterMenu && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs">
              <div className="px-3 py-1 font-semibold text-slate-400 text-[10px] uppercase tracking-wider">
                Filter by Topic
              </div>
              <button
                onClick={() => {
                  setActiveCategoryFilter('all');
                  setShowFilterMenu(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs flex items-center justify-between",
                  activeCategoryFilter === 'all' ? "font-bold text-emerald-600 bg-emerald-50/50" : "text-slate-700"
                )}
              >
                <span>All Topics</span>
                <span className="text-[10px] text-slate-400">{documents.length}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategoryFilter(cat);
                    setShowFilterMenu(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs flex items-center justify-between",
                    activeCategoryFilter === cat ? "font-bold text-emerald-600 bg-emerald-50/50" : "text-slate-700"
                  )}
                >
                  <span className="truncate">{cat}</span>
                  <span className="text-[10px] text-slate-400">
                    {documents.filter(d => d.category === cat).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable list of cards */}
      <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-5 scrollbar-thin scrollbar-thumb-slate-200">
        
        {/* Section: Last 7 days */}
        {last7Days.length > 0 && (
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-2 px-1">
              Last 7 days
            </span>
            <div className="space-y-2.5">
              {last7Days.map((doc) => (
                <HistoryCard
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDocId === doc.id}
                  onSelect={() => onSelectDocument(doc)}
                  onOpenMenu={(id) => setOpenMenuDocId(openMenuDocId === id ? null : id)}
                  isMenuOpen={openMenuDocId === doc.id}
                  onDelete={() => {
                    onDeleteDocument(doc.id);
                    setOpenMenuDocId(null);
                  }}
                  onDuplicate={() => {
                    onDuplicateDocument(doc);
                    setOpenMenuDocId(null);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Section: Last 30 days */}
        {last30Days.length > 0 && (
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-2 px-1">
              Last 30 days
            </span>
            <div className="space-y-2.5">
              {last30Days.map((doc) => (
                <HistoryCard
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDocId === doc.id}
                  onSelect={() => onSelectDocument(doc)}
                  onOpenMenu={(id) => setOpenMenuDocId(openMenuDocId === id ? null : id)}
                  isMenuOpen={openMenuDocId === doc.id}
                  onDelete={() => {
                    onDeleteDocument(doc.id);
                    setOpenMenuDocId(null);
                  }}
                  onDuplicate={() => {
                    onDuplicateDocument(doc);
                    setOpenMenuDocId(null);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Section: Older */}
        {older.length > 0 && (
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-2 px-1">
              Older
            </span>
            <div className="space-y-2.5">
              {older.map((doc) => (
                <HistoryCard
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDocId === doc.id}
                  onSelect={() => onSelectDocument(doc)}
                  onOpenMenu={(id) => setOpenMenuDocId(openMenuDocId === id ? null : id)}
                  isMenuOpen={openMenuDocId === doc.id}
                  onDelete={() => {
                    onDeleteDocument(doc.id);
                    setOpenMenuDocId(null);
                  }}
                  onDuplicate={() => {
                    onDuplicateDocument(doc);
                    setOpenMenuDocId(null);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {filteredDocuments.length === 0 && (
          <div className="text-center py-8 px-4 text-slate-400 text-xs">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="font-medium text-slate-600">No reflections found</p>
            <p className="text-[11px] mt-1">Try another search term or click New reflection.</p>
          </div>
        )}
      </div>

      {/* Bottom CTA: "+ New reflection" matching image.png */}
      <div className="pt-3 mt-2 border-t border-slate-100">
        <button
          id="sidebar-new-reflection-btn"
          onClick={onNewReflectionClick}
          className="w-full py-2.5 px-4 bg-[#1E2333] hover:bg-[#2A3147] active:scale-[0.99] text-white text-xs font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all duration-150"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>New reflection</span>
        </button>
      </div>

    </aside>
  );
};

interface HistoryCardProps {
  doc: DocumentSummary;
  isSelected: boolean;
  onSelect: () => void;
  onOpenMenu: (id: string) => void;
  isMenuOpen: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
}

const HistoryCard: React.FC<HistoryCardProps> = ({
  doc,
  isSelected,
  onSelect,
  onOpenMenu,
  isMenuOpen,
  onDelete,
  onDuplicate,
}) => {
  const badgeStyles = getCategoryBadgeStyles(doc.categoryColor);

  return (
    <div
      onClick={onSelect}
      id={`history-card-${doc.id}`}
      className={cn(
        "group relative p-3.5 rounded-2xl cursor-pointer transition-all duration-150 select-none text-left",
        isSelected
          ? "border-2 border-emerald-400/80 bg-white shadow-xs"
          : "border border-slate-200/60 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs"
      )}
    >
      {/* Top row: Date badge, category badge, extra badge, more menu */}
      <div className="flex items-center justify-between gap-1 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          
          {/* Date pill with calendar icon */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100/90 text-slate-600 border border-slate-200/50">
            <Calendar className="w-3 h-3 text-slate-500" />
            <span>{doc.dateBadge}</span>
          </span>

          {/* Category badge */}
          <span className={cn(
            "inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold truncate max-w-[120px]",
            badgeStyles.bg,
            badgeStyles.text
          )}>
            {doc.category}
          </span>

          {/* Optional count pill */}
          {doc.extraCount && (
            <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200/40">
              +{doc.extraCount}
            </span>
          )}
        </div>

        {/* Three dots menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenMenu(doc.id);
            }}
            title="Options"
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30 text-xs animate-in fade-in zoom-in-95"
            >
              <button
                onClick={onDuplicate}
                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={onDelete}
                className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card Title */}
      <h3 className="font-semibold text-xs text-slate-900 line-clamp-1 mb-1 group-hover:text-slate-950">
        {doc.title}
      </h3>

      {/* Card Excerpt */}
      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
        {doc.excerpt}
      </p>

      {/* Review Progress Indicator */}
      {doc.reviewProgress && (doc.reviewProgress.maxScrollPercent > 0 || (doc.reviewProgress.completedTaskIds?.length || 0) > 0) && (
        <div className="mt-2.5 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-1">
            {doc.reviewProgress.isFullyReviewed ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Reviewed
              </span>
            ) : (
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                {Math.round(((doc.reviewProgress.completedTaskIds?.length || 0) / 5) * 100)}% Reviewed
              </span>
            )}
          </div>
          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${doc.reviewProgress.isFullyReviewed ? 'bg-emerald-500' : 'bg-teal-500'}`}
              style={{ width: `${doc.reviewProgress.isFullyReviewed ? 100 : Math.max(12, Math.round(((doc.reviewProgress.completedTaskIds?.length || 0) / 5) * 100))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

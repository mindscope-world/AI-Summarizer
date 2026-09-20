import React from 'react';
import { 
  LayoutDashboard, 
  FolderKanban, 
  SquarePen, 
  CalendarDays, 
  BarChart3, 
  Settings, 
  Sparkles,
  Layers,
  GraduationCap
} from 'lucide-react';
import { NavigationTab } from '../types';
import { useAuthUser } from '../lib/useAuthUser';

interface NavbarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onOpenArchitecture: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenArchitecture,
  onOpenSettings,
  onSignOut,
}) => {
  const authUser = useAuthUser();
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);

  const navItems: { id: NavigationTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'Landing', label: 'Overview', icon: Sparkles },
    { id: 'Journal', label: 'Journal', icon: SquarePen },
    { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'Programs', label: 'Programs', icon: FolderKanban },
    { id: 'Scheduling', label: 'Scheduling', icon: CalendarDays },
    { id: 'Metrics', label: 'Metrics', icon: BarChart3 },
  ];

  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 px-4 lg:px-6 py-2.5 transition-all">
      <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-3">
        
        {/* Left: Brand Identity matching image.png */}
        <div className="flex items-center gap-6">
          <div 
            className="flex items-center gap-2.5 cursor-pointer group select-none"
            onClick={() => onTabChange(activeTab === 'Landing' ? 'Journal' : 'Landing')}
          >
            {/* Diamond 4-point star badge */}
            <div className="w-8 h-8 rounded-xl bg-[#181E2C] flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <svg 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="w-4 h-4 text-emerald-400"
              >
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-[#111827] leading-none">
                LeaderForge
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                East Africa University
              </span>
            </div>
          </div>

          {/* Navigation Pill Tabs matching image.png */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl border border-slate-200/50">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id.toLowerCase()}`}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-slate-900' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1" />

        {/* Right Controls matching image.png */}
        <div className="flex items-center gap-2">

          {activeTab === 'Landing' && (
            <button
              onClick={() => onTabChange('Journal')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-xs transition-colors"
            >
              <SquarePen className="w-3.5 h-3.5" />
              <span>Launch Workspace</span>
            </button>
          )}
          
          {/* Architecture & Workflow Diagram button */}
          <button
            id="view-architecture-btn"
            onClick={onOpenArchitecture}
            title="How the summarizer works"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/60 rounded-lg transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden xl:inline text-[11px] font-semibold text-emerald-800">System Workflow</span>
          </button>

          {/* Settings Icon */}
          <button
            id="settings-modal-btn"
            onClick={onOpenSettings}
            title="Settings"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile Avatar with dropdown matching image.png */}
          <div className="relative ml-1">
            <button
              id="user-profile-avatar-btn"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 p-0.5 rounded-full hover:ring-2 hover:ring-emerald-400/40 transition-all"
            >
              <img
                src={authUser?.avatarUrl}
                alt={authUser?.fullName ?? 'User'}
                className="w-8 h-8 rounded-full object-cover border border-slate-300"
              />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-3 z-50 text-xs">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 mb-2">
                  <img
                    src={authUser?.avatarUrl}
                    alt={authUser?.fullName ?? 'User'}
                    className="w-10 h-10 rounded-full object-cover border"
                  />
                  <div>
                    <h4 className="font-bold text-slate-900">{authUser?.fullName ?? 'Guest'}</h4>
                    {authUser?.studentId && <p className="text-[11px] text-slate-500">{authUser.studentId}</p>}
                    <p className="text-[10px] text-emerald-600 font-medium">{authUser?.institution ?? 'The East Africa University'}</p>
                  </div>
                </div>

                {authUser && (
                  <div className="mb-2 px-2 py-1.5 rounded-lg bg-slate-50 flex items-center gap-1.5 text-slate-600">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span className="capitalize font-semibold">{authUser.role}</span>
                    <span className="text-[10px] text-slate-400 truncate">{authUser.email}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex flex-col gap-1">
                  <button 
                    onClick={() => {
                      onOpenSettings();
                      setShowProfileMenu(false);
                    }}
                    className="text-left px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 rounded-lg"
                  >
                    Settings
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onSignOut();
                    }}
                    className="text-left px-2.5 py-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};

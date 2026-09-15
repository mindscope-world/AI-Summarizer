import React, { useState } from 'react';
import { 
  X, 
  Mail, 
  Lock, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight, 
  GraduationCap, 
  Database, 
  Code2, 
  CheckCircle2, 
  AlertCircle,
  KeyRound,
  UserCheck
} from 'lucide-react';
import { supabase, DEMO_CAMPUS_ACCOUNTS, AcademicUser } from '../lib/supabaseAuth';

interface SupabaseAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialMode?: 'signin' | 'signup';
}

export const SupabaseAuthModal: React.FC<SupabaseAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'signin',
}) => {
  const [activeTab, setActiveTab] = useState<'password' | 'magiclink' | 'rls'>('password');
  const [email, setEmail] = useState('paulmwaura254@gmail.com');
  const [password, setPassword] = useState('••••••••••••');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage(null);
    try {
      await supabase.signInWithEmail(email, password);
      setStatusMessage('Authentication successful! Initializing secure session...');
      setTimeout(() => {
        setIsLoading(false);
        onSuccess();
        onClose();
      }, 500);
    } catch (err) {
      setIsLoading(false);
      setStatusMessage('Authentication failed. Please verify credentials.');
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage(null);
    setTimeout(async () => {
      await supabase.signInWithEmail(email);
      setStatusMessage(`✨ Magic link verified for ${email}! Access token granted.`);
      setTimeout(() => {
        setIsLoading(false);
        onSuccess();
        onClose();
      }, 600);
    }, 600);
  };

  const handleGoogleOAuth = async () => {
    setIsLoading(true);
    setTimeout(async () => {
      await supabase.signInWithGoogle();
      setIsLoading(false);
      onSuccess();
      onClose();
    }, 500);
  };

  const handleQuickSwitch = async (acc: AcademicUser) => {
    setIsLoading(true);
    await supabase.switchAccount(acc);
    setTimeout(() => {
      setIsLoading(false);
      onSuccess();
      onClose();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-[#181E2C] via-[#1F283D] to-[#121622] p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
              ⚡
            </div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Supabase Auth & RLS Guard
            </span>
          </div>

          <h3 className="text-xl font-extrabold text-white">
            Academic Portal Access
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            Sign in to access your synthesized papers, active recall cards, and study schedule.
          </p>

          {/* Sub tabs */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-700/80 text-xs">
            <button
              onClick={() => setActiveTab('password')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === 'password'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Email & Password
            </button>
            <button
              onClick={() => setActiveTab('magiclink')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === 'magiclink'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Magic Link
            </button>
            <button
              onClick={() => setActiveTab('rls')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === 'rls'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Postgres RLS Policy
            </button>
          </div>
        </div>

        {/* Body content */}
        <div className="p-6 space-y-5">
          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Campus Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@eau.ac.ke or gmail.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    Password
                  </label>
                  <button type="button" onClick={() => setActiveTab('magiclink')} className="text-[11px] text-emerald-600 hover:underline">
                    Use passwordless link?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <span>{isLoading ? 'Verifying Supabase Session...' : 'Sign In to Workspace'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] text-slate-400 uppercase font-medium">Or</span>
              </div>

              <button
                type="button"
                onClick={handleGoogleOAuth}
                disabled={isLoading}
                className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Campus Google Account</span>
              </button>
            </form>
          )}

          {activeTab === 'magiclink' && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Campus or Personal Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email for passwordless sign-in"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 leading-relaxed">
                We'll issue an instant passwordless session token directly to your browser for immediate dashboard verification.
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <span>{isLoading ? 'Sending Token...' : 'Send Magic Token & Sign In'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {activeTab === 'rls' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Supabase Row Level Security (RLS)
                </span>
                <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  Postgres 16
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                In Supabase, every student and faculty member's data is isolated at the database engine level via Row Level Security policies:
              </p>

              <div className="bg-slate-900 text-slate-200 p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto leading-normal border border-slate-800 space-y-1">
                <div className="text-emerald-400">-- 1. Enable RLS on summaries table</div>
                <div>ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;</div>
                <div className="text-emerald-400 pt-1">-- 2. Restrict reads to authenticated creator</div>
                <div>CREATE POLICY "Student read own papers"</div>
                <div>&nbsp;&nbsp;ON summaries FOR SELECT</div>
                <div>&nbsp;&nbsp;USING (auth.uid() = user_id);</div>
                <div className="text-emerald-400 pt-1">-- 3. Faculty review policy</div>
                <div>CREATE POLICY "Faculty supervisor audit"</div>
                <div>&nbsp;&nbsp;ON summaries FOR SELECT</div>
                <div>&nbsp;&nbsp;USING (auth.jwt() -&gt;&gt; 'role' = 'faculty');</div>
              </div>
            </div>
          )}

          {/* Quick Demo Account Switcher */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Quick Test Accounts (Click to Instant Switch):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DEMO_CAMPUS_ACCOUNTS.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => handleQuickSwitch(acc)}
                  className="p-2 rounded-xl border border-slate-200 hover:border-emerald-400 bg-slate-50/70 hover:bg-emerald-50/50 text-left transition-all text-xs flex flex-col"
                >
                  <span className="font-bold text-slate-900 truncate">{acc.fullName.split(' ')[0]}</span>
                  <span className="text-[10px] text-slate-500 capitalize">{acc.role}</span>
                  <span className="text-[9px] font-mono text-emerald-600 truncate">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

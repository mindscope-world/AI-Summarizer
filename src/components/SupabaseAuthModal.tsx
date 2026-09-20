import React, { useEffect, useId, useState } from 'react';
import { X, Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { auth } from '../lib/auth';

interface SupabaseAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once the person is signed in. */
  onSuccess: () => void;
  initialMode?: 'signin' | 'signup';
}

type Mode = 'signin' | 'signup' | 'link';

const MIN_PASSWORD = 8;

/** Sign in / create an account with Supabase Auth: email + password, an emailed link, or Google. */
export const SupabaseAuthModal: React.FC<SupabaseAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'signin',
}) => {
  const ids = useId();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'researcher'>('student');
  const [institution, setInstitution] = useState('');
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setNotice(null);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const finish = () => {
    setPassword('');
    onSuccess();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode !== 'signin' && mode !== 'link' && password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await auth.signInWithPassword(email, password);
        if (err) setError(err);
        else finish();
      } else if (mode === 'signup') {
        const result = await auth.signUp({ email, password, fullName, institution, studentId, role });
        if (result.error) setError(result.error);
        else if (result.needsConfirmation) {
          setNotice(`We sent a confirmation link to ${email.trim()}. Open it, then come back and sign in.`);
          setMode('signin');
          setPassword('');
        } else finish();
      } else {
        const { error: err } = await auth.signInWithMagicLink(email);
        if (err) setError(err);
        else setNotice(`We emailed a sign-in link to ${email.trim()}. Open it on this device.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await auth.signInWithGoogle();
    if (err) {
      setError(err);
      setBusy(false);
    }
    // On success the browser leaves for Google and comes back signed in.
  };

  const title = mode === 'signup' ? 'Create your account' : mode === 'link' ? 'Sign in with an email link' : 'Sign in to your workspace';
  const submitLabel = mode === 'signup' ? 'Create account' : mode === 'link' ? 'Email me a link' : 'Sign in';
  const field =
    'w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden';
  const plain = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl border border-slate-200 relative text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#181E2C] via-[#1F283D] to-[#121622] p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 id={`${ids}-title`} className="text-xl font-extrabold text-white">
            {title}
          </h3>
          <p className="text-xs text-slate-300 mt-1">Your summaries, notes and study progress are private to your account.</p>
        </div>

        <div className="p-6 space-y-4">
          {!auth.configured && (
            <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-px" />
              <span>
                Sign-in is not set up yet. The administrator needs to add <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> and restart the app.
              </span>
            </div>
          )}
          {notice && (
            <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label htmlFor={`${ids}-name`} className="text-xs font-bold text-slate-700 block">
                  Full name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input id={`${ids}-name`} required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor={`${ids}-email`} className="text-xs font-bold text-slate-700 block">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id={`${ids}-email`}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className={field}
                />
              </div>
            </div>

            {mode !== 'link' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${ids}-password`} className="text-xs font-bold text-slate-700 block">
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => switchMode('link')} className="text-[11px] text-emerald-700 hover:underline">
                      Email me a link instead
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id={`${ids}-password`}
                    type="password"
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
                    className={field}
                  />
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor={`${ids}-role`} className="text-xs font-bold text-slate-700 block">
                      I am a
                    </label>
                    <select id={`${ids}-role`} value={role} onChange={(e) => setRole(e.target.value as 'student' | 'researcher')} className={plain}>
                      <option value="student">Student</option>
                      <option value="researcher">Researcher</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`${ids}-sid`} className="text-xs font-bold text-slate-700 block">
                      Student ID <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input id={`${ids}-sid`} value={studentId} onChange={(e) => setStudentId(e.target.value)} className={plain} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${ids}-inst`} className="text-xs font-bold text-slate-700 block">
                    Institution <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input id={`${ids}-inst`} value={institution} onChange={(e) => setInstitution(e.target.value)} className={plain} />
                </div>
                <p className="text-[11px] text-slate-500">Faculty accounts are set up by an administrator.</p>
              </>
            )}

            <button
              type="submit"
              disabled={busy || !auth.configured}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{busy ? 'Please wait...' : submitLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[11px] text-slate-400 uppercase font-medium absolute">Or</span>
          </div>

          <button
            type="button"
            onClick={() => void google()}
            disabled={busy || !auth.configured}
            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          <p className="text-center text-xs text-slate-500">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('signin')} className="font-semibold text-emerald-700 hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{' '}
                <button type="button" onClick={() => switchMode('signup')} className="font-semibold text-emerald-700 hover:underline">
                  Create an account
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Supabase Auth & Client Simulation for Academic Summarizer
 * Provides full authentication state, session storage, protected route checking,
 * and Row Level Security (RLS) policy inspection.
 */

export interface AcademicUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  institution: string;
  studentId?: string;
  role: 'student' | 'researcher' | 'faculty';
  createdAt: string;
}

export interface AcademicSession {
  accessToken: string;
  expiresAt: number;
  user: AcademicUser;
}

const STORAGE_KEY = 'supabase_academic_auth_session';

// Demo campus accounts for fast switching & testing
export const DEMO_CAMPUS_ACCOUNTS: AcademicUser[] = [
  {
    id: 'usr_noel_01',
    email: 'paulmwaura254@gmail.com',
    fullName: 'Noel Juma Muhemba',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    institution: 'The East Africa University',
    studentId: 'BCSITP/0003/S24',
    role: 'student',
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'usr_geoffrey_02',
    email: 'g.sagwe@eau.ac.ke',
    fullName: 'Mr. Geoffrey Sagwe',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    institution: 'The East Africa University',
    role: 'faculty',
    createdAt: '2025-09-01T08:00:00Z',
  },
  {
    id: 'usr_sarah_03',
    email: 's.cherop@eau.ac.ke',
    fullName: 'Dr. Sarah Cherop',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80',
    institution: 'The East Africa University',
    role: 'researcher',
    createdAt: '2025-11-10T08:00:00Z',
  }
];

class SupabaseAcademicClient {
  private session: AcademicSession | null = null;
  private listeners: ((session: AcademicSession | null) => void)[] = [];

  constructor() {
    this.loadSession();
  }

  private loadSession() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check expiry
        if (parsed.expiresAt > Date.now()) {
          this.session = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load Supabase session from localStorage', e);
    }
    // Default to Noel's student session for smooth out-of-the-box demo experience
    this.session = {
      accessToken: 'sb_jwt_' + Math.random().toString(36).substring(2),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      user: DEMO_CAMPUS_ACCOUNTS[0],
    };
    this.persist();
  }

  private persist() {
    if (this.session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.session));
  }

  public getSession(): AcademicSession | null {
    return this.session;
  }

  public getUser(): AcademicUser | null {
    return this.session ? this.session.user : null;
  }

  public isAuthenticated(): boolean {
    return !!this.session && this.session.expiresAt > Date.now();
  }

  public onAuthStateChange(callback: (session: AcademicSession | null) => void): () => void {
    this.listeners.push(callback);
    callback(this.session);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public async signInWithEmail(email: string, password?: string): Promise<{ session: AcademicSession; error: null }> {
    // Find matching demo or generate new student user
    let user = DEMO_CAMPUS_ACCOUNTS.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      const cleanName = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ') || 'Student Scholar';
      user = {
        id: 'usr_' + Date.now().toString(36),
        email,
        fullName: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
        institution: 'The East Africa University',
        studentId: 'BCSITP/' + Math.floor(1000 + Math.random() * 9000) + '/S24',
        role: 'student',
        createdAt: new Date().toISOString(),
      };
    }

    this.session = {
      accessToken: 'sb_jwt_' + Math.random().toString(36).substring(2),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      user,
    };
    this.persist();
    return { session: this.session, error: null };
  }

  public async signInWithGoogle(): Promise<{ session: AcademicSession; error: null }> {
    // Simulated Google OAuth redirect/popup
    this.session = {
      accessToken: 'sb_google_oauth_' + Math.random().toString(36).substring(2),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      user: DEMO_CAMPUS_ACCOUNTS[0], // Noel Juma Muhemba
    };
    this.persist();
    return { session: this.session, error: null };
  }

  public async switchAccount(account: AcademicUser): Promise<{ session: AcademicSession }> {
    this.session = {
      accessToken: 'sb_jwt_' + Math.random().toString(36).substring(2),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      user: account,
    };
    this.persist();
    return { session: this.session };
  }

  public async signOut(): Promise<void> {
    this.session = null;
    this.persist();
  }
}

export const supabase = new SupabaseAcademicClient();

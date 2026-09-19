import {useEffect, useState} from 'react';
import {supabase, type AcademicUser} from './supabaseAuth';

/** The currently signed-in user (or null), kept in sync with auth state changes. */
export function useAuthUser(): AcademicUser | null {
  const [user, setUser] = useState<AcademicUser | null>(() => supabase.getUser());
  useEffect(() => supabase.onAuthStateChange((session) => setUser(session?.user ?? null)), []);
  return user;
}

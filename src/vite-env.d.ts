/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Your Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string;
  /** Your Supabase anon/publishable key (public by design; Row Level Security is what protects data). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

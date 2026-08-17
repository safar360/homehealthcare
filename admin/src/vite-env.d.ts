/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // Phase 2 screens, off unless switched on. See lib/features.ts.
  readonly VITE_FEATURE_PATIENTS?: string;
  readonly VITE_FEATURE_DAY_SHEET?: string;
  readonly VITE_FEATURE_MONTHLY_BILLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

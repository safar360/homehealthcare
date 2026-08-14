import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Missing credentials used to fall back to 'https://your-project-ref.supabase.co',
 * which turns every failure into a confusing network error instead of an obvious
 * configuration problem. Surface it as configuration instead.
 */
export const configError: string | null = (() => {
  if (!url || !anonKey) {
    return 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set. Copy admin/.env.example to admin/.env.local and fill them in.';
  }
  if (/\/rest\/v1\/?$/.test(url)) {
    return 'VITE_SUPABASE_URL must be the bare project URL. Remove the /rest/v1 suffix — supabase-js appends it itself.';
  }
  return null;
})();

// The ops portal is a signed-in application, so unlike the patient app the
// session must survive a page reload and refresh itself.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

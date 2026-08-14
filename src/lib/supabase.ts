import { createClient } from '@supabase/supabase-js';

// A /rest/v1 suffix here is a common copy-paste from the Supabase dashboard, but
// supabase-js appends that path itself, so leaving it on makes every request 404.
const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-ref.supabase.co';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// The patient app is anonymous: it reads public content and inserts orders, and
// falls back to bundled demo content when the credentials are absent.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

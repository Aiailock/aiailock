import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev rather than silently rendering a broken page.
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in — see README.',
  );
}

// This client is used by BOTH the reader and the admin UI. It only ever
// carries the anon key — admin capability comes from an authenticated
// Supabase Auth session (see src/lib/auth.ts, added in the admin stage),
// not from a separate privileged key. The service_role key is NEVER used
// in frontend code; it only lives server-side (edge functions / import worker).
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

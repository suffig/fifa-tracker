import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabase = createClient(
  'https://buduldeczjwnjvsckqat.supabase.co',
  'sb_publishable_wcOHaKNEW9rQ3anrRNlEpA_r1_wGda3',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'supabase.auth.token'
    }
  }
);
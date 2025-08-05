import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

alert("main.js geladen!");
console.log("main.js geladen!");

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

// Am Ende von supabaseClient.js
window.supabase = supabase;
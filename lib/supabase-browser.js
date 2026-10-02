import { createClient } from '@supabase/supabase-js';

// Browser client. Only used to push files to Supabase Storage through
// one-time signed upload URLs that the server hands out.
let client = null;

export function supabaseBrowser() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
  }
  return client;
}

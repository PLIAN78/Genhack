import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Module-level singleton — only one client instance is created per browser tab.
let _client: SupabaseClient | null = null;
let _warned = false;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (!_warned) {
      _warned = true;
      console.warn(
        "[Registry] Supabase is not configured. " +
          "Copy apps/dashboard/.env.local.example to .env.local and fill in " +
          "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
          "to enable the high-risk person registry."
      );
    }
    return null;
  }

  if (!_client) {
    _client = createClient(url, key, {
      auth: {
        // This app has no user authentication.
        // Disable auto-refresh and session persistence to keep the client
        // stateless; access is controlled by Supabase RLS policies.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return _client;
}

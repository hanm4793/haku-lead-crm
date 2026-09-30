/** Read Supabase public URL/key — support Vercel Marketplace `SB_` aliases. */
export function supabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SB_SUPABASE_URL?.trim() ||
    process.env.SB_SUPABASE_URL?.trim() ||
    ""
  );
}

export function supabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SB_SUPABASE_ANON_KEY?.trim() ||
    process.env.SB_SUPABASE_ANON_KEY?.trim() ||
    ""
  );
}

export function supabaseServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SB_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SB_SUPABASE_SECRET_KEY?.trim() ||
    ""
  );
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

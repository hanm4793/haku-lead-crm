import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          // Server Component không được ghi cookie. Middleware đã làm việc làm
          // mới session nên bỏ qua ở đây là an toàn.
          try {
            for (const { name, value, options } of list) cookieStore.set(name, value, options);
          } catch {
            /* no-op */
          }
        },
      },
    },
  );
}

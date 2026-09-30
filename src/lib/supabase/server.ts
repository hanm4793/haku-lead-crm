import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export { isSupabaseConfigured };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
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

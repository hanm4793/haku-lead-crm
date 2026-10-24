import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login", "/auth", "/api/cron/"];

/**
 * Làm mới access token của Supabase trên mỗi request và chặn người chưa đăng
 * nhập. Ưu tiên đọc session từ cookie (getSession) để tránh tốn 150-250ms gọi
 * mạng sang Supabase Auth trên từng API request; chỉ gọi getUser() khi cần.
 */
export async function middleware(request: NextRequest) {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();

  // Chưa cấu hình Supabase Auth thì app chạy chế độ demo, không chặn gì.
  if (!url || !anonKey) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  if (isPublic) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? (await supabase.auth.getUser()).data.user;

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && pathname === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/leads";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { eq, isNull, or } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import type { ViewerScope } from "@/lib/db/leads-repo";
import { appUsers } from "@/lib/db/schema";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export interface Viewer extends ViewerScope {
  fullName: string;
  email: string | null;
  /** Chưa bật Supabase Auth — đang chạy chế độ demo quyền admin. */
  isDemo: boolean;
}

const DEMO_VIEWER: Viewer = {
  role: "ADMIN",
  showroomId: null,
  appUserId: null,
  fullName: "Chế độ demo",
  email: null,
  isDemo: true,
};

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Lấy phạm vi quyền của người đang đăng nhập.
 *
 * Trả về `null` nghĩa là đã bật auth nhưng chưa đăng nhập — caller cần chuyển
 * hướng sang /login. Khi chưa cấu hình Supabase Auth thì chạy chế độ demo với
 * quyền admin để dự án vẫn mở được ngay sau khi clone.
 */
export async function getViewer(): Promise<Viewer | null> {
  if (!isSupabaseConfigured() || !isDatabaseConfigured()) return DEMO_VIEWER;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const fullNameFromMeta =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;

  const viewer = await provisionViewer(user.id, user.email ?? null, fullNameFromMeta);
  if (!viewer) {
    // Tài khoản bị tắt trong CRM — buộc đăng xuất để tránh vòng redirect login ↔ app.
    await supabase.auth.signOut();
    return null;
  }
  return viewer;
}

/** Alias theo tên trong kế hoạch migration — cùng nghĩa với `getViewer`. */
export const getViewerScope = getViewer;

/**
 * Nhân sự được seed trước khi có tài khoản, nên lần đăng nhập đầu tiên phải nối
 * `auth.users` với dòng `app_users` tương ứng: ưu tiên khớp theo email, không có
 * thì tạo mới.
 */
async function provisionViewer(
  authUserId: string,
  email: string | null,
  fullNameHint: string | null = null,
): Promise<Viewer | null> {
  const db = getDb();
  const normalizedEmail = email?.toLowerCase() ?? null;

  const existing = await db
    .select()
    .from(appUsers)
    .where(
      normalizedEmail
        ? or(eq(appUsers.authUserId, authUserId), eq(appUsers.email, normalizedEmail))
        : eq(appUsers.authUserId, authUserId),
    )
    .limit(1);

  let row = existing[0];

  if (row && !row.authUserId) {
    [row] = await db
      .update(appUsers)
      .set({ authUserId, email: normalizedEmail ?? row.email })
      .where(eq(appUsers.id, row.id))
      .returning();
  }

  if (!row) {
    const isAdmin = normalizedEmail !== null && adminEmails().includes(normalizedEmail);
    [row] = await db
      .insert(appUsers)
      .values({
        authUserId,
        email: normalizedEmail,
        fullName: fullNameHint?.trim() || normalizedEmail?.split("@")[0] || "Người dùng mới",
        role: isAdmin ? "ADMIN" : "SALES",
      })
      .returning();
  } else if (normalizedEmail && adminEmails().includes(normalizedEmail) && row.role !== "ADMIN") {
    [row] = await db.update(appUsers).set({ role: "ADMIN" }).where(eq(appUsers.id, row.id)).returning();
  }

  if (!row.active) return null;

  return {
    role: row.role,
    showroomId: row.showroomId,
    appUserId: row.id,
    fullName: row.fullName,
    email: row.email,
    isDemo: false,
  };
}

/** Nhân sự chưa gắn tài khoản — hiển thị ở trang cài đặt để quản trị mời vào. */
export async function listUnlinkedUsers() {
  if (!isDatabaseConfigured()) return [];
  return getDb().select().from(appUsers).where(isNull(appUsers.authUserId));
}

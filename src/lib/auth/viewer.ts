import { and, count, eq, isNull } from "drizzle-orm";

import { pageGrantUserId } from "@/lib/auth/roles";

import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import type { ViewerScope } from "@/lib/db/leads-repo";
import {
  listProjectIdsForViewer,
  resolveActiveProject,
  toProjectViewer,
} from "@/lib/db/project-repo";
import { appUsers, facebookPages, userFacebookPages } from "@/lib/db/schema";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export interface Viewer extends ViewerScope {
  fullName: string;
  email: string | null;
  /** Chưa bật Supabase Auth — đang chạy chế độ demo quyền admin. */
  isDemo: boolean;
  /** Project được phép (membership). */
  projectIds: string[];
  partnerId?: string | null;
}

const DEMO_VIEWER: Viewer = {
  role: "SUPER_ADMIN",
  locationId: null,
  appUserId: null,
  projectId: null,
  projectIds: [],
  partnerId: null,
  pageIds: [],
  aiEnabled: true,
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
    // Tài khoản bị tắt hoặc chưa được cấp quyền trong CRM — buộc đăng xuất để tránh vòng redirect login ↔ app.
    await supabase.auth.signOut();
    return null;
  }
  return viewer;
}

/** Gắn `activeProjectId` để lọc lead, báo cáo, marketing và catalog. */
export async function getScopedViewer(): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (!isDatabaseConfigured()) return viewer;
  try {
    const active = await resolveActiveProject(toProjectViewer(viewer));
    return { ...viewer, activeProjectId: active.id };
  } catch {
    return viewer;
  }
}

/** Alias theo tên trong kế hoạch migration — cùng nghĩa với `getViewer`. */
export const getViewerScope = getViewer;

/**
 * Nhân sự được seed trước khi có tài khoản, nên lần đăng nhập đầu tiên phải nối
 * `auth.users` với dòng `app_users` tương ứng: ưu tiên khớp theo `authUserId`, sau đó
 * mới khớp theo `email` chưa gắn `authUserId`. Không tự tạo nhân viên mới cho email lạ
 * trừ khi bật `ENABLE_PUBLIC_SIGNUP=true` hoặc bootstrap super admin đầu tiên.
 */
async function provisionViewer(
  authUserId: string,
  email: string | null,
  fullNameHint: string | null = null,
): Promise<Viewer | null> {
  const db = getDb();
  const normalizedEmail = email?.trim().toLowerCase() || null;

  const byAuth = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, authUserId))
    .limit(1);

  let row = byAuth[0];

  if (!row && normalizedEmail) {
    const byUnlinkedEmail = await db
      .select()
      .from(appUsers)
      .where(and(eq(appUsers.email, normalizedEmail), isNull(appUsers.authUserId)))
      .limit(1);
    row = byUnlinkedEmail[0];
  }

  if (row && !row.authUserId) {
    [row] = await db
      .update(appUsers)
      .set({ authUserId, email: normalizedEmail ?? row.email })
      .where(eq(appUsers.id, row.id))
      .returning();
  }

  if (!row) {
    const [{ total }] = await db.select({ total: count() }).from(appUsers);
    const isFirstBootstrap = Number(total ?? 0) === 0;
    const isAdmin = normalizedEmail !== null && adminEmails().includes(normalizedEmail);
    const allowPublicSignup = process.env.ENABLE_PUBLIC_SIGNUP === "true";

    if (!isFirstBootstrap && !isAdmin && !allowPublicSignup) {
      return null;
    }

    [row] = await db
      .insert(appUsers)
      .values({
        authUserId,
        email: normalizedEmail,
        fullName: fullNameHint?.trim() || normalizedEmail?.split("@")[0] || "Người dùng mới",
        role: isFirstBootstrap || isAdmin ? "SUPER_ADMIN" : "STAFF",
      })
      .returning();
  } else if (normalizedEmail && adminEmails().includes(normalizedEmail) && row.role !== "SUPER_ADMIN") {
    [row] = await db.update(appUsers).set({ role: "SUPER_ADMIN" }).where(eq(appUsers.id, row.id)).returning();
  }

  if (!row || !row.active) return null;

  let projectId = row.projectId;
  if (row.role === "STAFF" && !projectId && row.partnerId) {
    const [partner] = await db
      .select({ projectId: appUsers.projectId })
      .from(appUsers)
      .where(eq(appUsers.id, row.partnerId))
      .limit(1);
    projectId = partner?.projectId ?? null;
  }

  const pageOwnerId = pageGrantUserId({ role: row.role, id: row.id, partnerId: row.partnerId });
  const pageIds = pageOwnerId ? await listGrantedPageIds(pageOwnerId) : [];

  const projectViewer = toProjectViewer({
    role: row.role,
    appUserId: row.id,
    projectId,
    partnerId: row.partnerId,
  });
  const projectIds = await listProjectIdsForViewer(projectViewer);

  return {
    role: row.role,
    locationId: row.locationId,
    appUserId: row.id,
    projectId,
    projectIds,
    partnerId: row.partnerId,
    pageIds,
    aiEnabled: row.role === "SUPER_ADMIN" || row.aiEnabled,
    fullName: row.fullName,
    email: row.email,
    isDemo: false,
  };
}

async function listGrantedPageIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ facebookPageId: userFacebookPages.facebookPageId })
    .from(userFacebookPages)
    .innerJoin(facebookPages, eq(facebookPages.facebookPageId, userFacebookPages.facebookPageId))
    .where(and(eq(userFacebookPages.userId, userId), eq(facebookPages.active, true)));
  return rows.map((row) => row.facebookPageId);
}

/** Nhân sự chưa gắn tài khoản — hiển thị ở trang cài đặt để quản trị mời vào. */
export async function listUnlinkedUsers() {
  if (!isDatabaseConfigured()) return [];
  return getDb().select().from(appUsers).where(isNull(appUsers.authUserId));
}

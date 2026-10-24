import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, count, eq, isNull } from "drizzle-orm";

import { pageGrantUserId } from "@/lib/auth/roles";
import { DEFAULT_PROJECT_SLUG } from "@/lib/constants";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import type { ViewerScope } from "@/lib/db/leads-repo";
import {
  ACTIVE_PROJECT_COOKIE,
  listProjectIdsForUser,
  resolveActiveProject,
  toProjectViewer,
} from "@/lib/db/project-repo";
import { appUsers, facebookPages, projects, userFacebookPages } from "@/lib/db/schema";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

export interface Viewer extends ViewerScope {
  fullName: string;
  email: string | null;
  /** Chưa bật Supabase Auth — đang chạy chế độ demo quyền admin. */
  isDemo: boolean;
  /** Project được phép (membership). */
  projectIds: string[];
  /** Project mặc định (ưu tiên slug mặc định) để chọn nhanh không cần query lại DB. */
  defaultProjectId?: string | null;
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
 * Lấy phạm vi quyền của người đang đăng nhập (memoize trong cùng một request
 * giữa RootLayout và Page).
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured() || !isDatabaseConfigured()) return DEMO_VIEWER;

  const supabase = await createSupabaseServerClient();
  // Middleware đã xác thực token với Supabase Auth ở đầu request; ưu tiên đọc
  // session từ cookie để tránh gọi mạng lần 2–3 tới Supabase Auth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user =
    session?.user ??
    (
      await supabase.auth.getUser()
    ).data.user;

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
});

/** Gắn `activeProjectId` để lọc lead, báo cáo, marketing và catalog. */
export const getScopedViewer = cache(async (): Promise<Viewer | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (!isDatabaseConfigured()) return viewer;
  try {
    const jar = await cookies();
    const cookieId = jar.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
    if (cookieId && viewer.projectIds.includes(cookieId)) {
      return { ...viewer, activeProjectId: cookieId };
    }
    if (viewer.role === "SUPER_ADMIN" && viewer.defaultProjectId) {
      return { ...viewer, activeProjectId: viewer.defaultProjectId };
    }
    if (viewer.projectIds.length > 0) {
      return { ...viewer, activeProjectId: viewer.projectIds[0] };
    }
    const active = await resolveActiveProject(toProjectViewer(viewer));
    return { ...viewer, activeProjectId: active.id };
  } catch {
    return viewer;
  }
});

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

  // Chạy song song truy vấn app_users và danh sách projects active để tiết kiệm 1-2 round-trip DB
  const [byAuth, activeProjects] = await Promise.all([
    db
      .select()
      .from(appUsers)
      .where(eq(appUsers.authUserId, authUserId))
      .limit(1),
    db
      .select({ id: projects.id, slug: projects.slug })
      .from(projects)
      .where(eq(projects.active, true))
      .orderBy(asc(projects.name)),
  ]);

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

  const activeProjectIdSet = new Set(activeProjects.map((p) => p.id));
  const defaultProject =
    activeProjects.find((p) => p.slug === DEFAULT_PROJECT_SLUG) ?? activeProjects[0] ?? null;

  // Nhánh nhanh cho SUPER_ADMIN: đã có sẵn toàn bộ projectIds từ bước Promise.all đầu tiên (0 query phát sinh)
  if (row.role === "SUPER_ADMIN") {
    return {
      role: row.role,
      locationId: row.locationId,
      appUserId: row.id,
      projectId: row.projectId,
      projectIds: activeProjects.map((p) => p.id),
      defaultProjectId: defaultProject?.id ?? null,
      partnerId: row.partnerId,
      pageIds: [],
      aiEnabled: true,
      fullName: row.fullName,
      email: row.email,
      isDemo: false,
    };
  }

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

  const [pageIds, userProjIds, partnerProjIds] = await Promise.all([
    pageOwnerId ? listGrantedPageIds(pageOwnerId) : Promise.resolve([]),
    listProjectIdsForUser(row.id),
    row.role === "STAFF" && row.partnerId ? listProjectIdsForUser(row.partnerId) : Promise.resolve([]),
  ]);

  let rawIds = [...new Set([...userProjIds, ...partnerProjIds])];
  if (rawIds.length === 0 && projectId) {
    rawIds = [projectId];
  }
  const projectIds = rawIds.filter((id) => activeProjectIdSet.has(id));

  return {
    role: row.role,
    locationId: row.locationId,
    appUserId: row.id,
    projectId,
    projectIds,
    defaultProjectId: projectIds[0] ?? null,
    partnerId: row.partnerId,
    pageIds,
    aiEnabled: row.aiEnabled,
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

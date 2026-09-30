export const USER_ROLES = ["SUPER_ADMIN", "PARTNER_ADMIN", "STAFF"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super admin",
  PARTNER_ADMIN: "Partner admin",
  STAFF: "Nhân viên",
};

export const ROLE_HINTS: Record<UserRole, string> = {
  SUPER_ADMIN: "Toàn quyền trên mọi fanpage",
  PARTNER_ADMIN: "Lead và marketing của các fanpage được gán",
  STAFF: "Xem lead của fanpage được gán, chỉ sửa lead của mình",
};

export function canUseAi(viewer: { role: UserRole; aiEnabled?: boolean }): boolean {
  if (viewer.role === "SUPER_ADMIN") return true;
  return viewer.role === "PARTNER_ADMIN" && Boolean(viewer.aiEnabled);
}

export function canManageUsers(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "PARTNER_ADMIN";
}

export function canViewMarketing(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "PARTNER_ADMIN";
}

export function canViewReports(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "PARTNER_ADMIN";
}

/** Cài đặt app và đồng bộ Facebook. */
export function canManageSettings(role: UserRole): boolean {
  return role === "SUPER_ADMIN";
}

/** Thêm / sửa / tắt danh mục trên trang Cài đặt (legacy) — chỉ super admin. */
export function canManageCatalogs(role: UserRole): boolean {
  return canManageSettings(role);
}

/** Định nghĩa field phụ trên Cài đặt (legacy) — chỉ super admin. */
export function canManageAttrFields(role: UserRole): boolean {
  return canManageCatalogs(role);
}

/** Màn Dự án — danh sách và chi tiết project được phép. */
export function canViewProjects(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "PARTNER_ADMIN";
}

export function canManageCatalogsInProject(
  viewer: { role: UserRole; projectIds?: readonly string[] },
  projectId: string,
): boolean {
  if (viewer.role === "SUPER_ADMIN") return true;
  if (viewer.role !== "PARTNER_ADMIN") return false;
  return viewer.projectIds?.includes(projectId) ?? false;
}

export function canManageAttrFieldsInProject(
  viewer: { role: UserRole; projectIds?: readonly string[] },
  projectId: string,
): boolean {
  return canManageCatalogsInProject(viewer, projectId);
}

/** Tạo/sửa project, gán fanpage / partner / tài khoản ads. */
export function canManageProjects(role: UserRole): boolean {
  return role === "SUPER_ADMIN";
}

export type NavGate = "all" | "reports" | "marketing" | "users" | "projects" | "settings";

export function canSeeNav(role: UserRole, gate: NavGate): boolean {
  switch (gate) {
    case "all":
      return true;
    case "reports":
      return canViewReports(role);
    case "marketing":
      return canViewMarketing(role);
    case "users":
      return canManageUsers(role);
    case "projects":
      return canViewProjects(role);
    case "settings":
      return canManageSettings(role);
  }
}

/** Phạm vi fanpage của dữ liệu lead, báo cáo, marketing và AI. */
export type DataScope = "all" | "granted-pages" | "none";

export function dataScope(viewer: { role: UserRole; pageIds: readonly string[] }): DataScope {
  if (viewer.role === "SUPER_ADMIN") return "all";
  if (viewer.pageIds.length === 0) return "none";
  return "granted-pages";
}

/** Super admin thấy mọi fanpage, kể cả dòng chưa gắn page. Các role khác chỉ thấy id đã gán. */
export function isPageVisible(
  viewer: { role: UserRole; pageIds: readonly string[] },
  pageId: string | null | undefined,
): boolean {
  if (dataScope(viewer) === "all") return true;
  return Boolean(pageId && viewer.pageIds.includes(pageId));
}

/**
 * Khi đang xem một project (`projectPageIds` từ fanpage gắn project): chỉ page thuộc list đó.
 * `null` = không lọc thêm theo project.
 */
export function isPageInProjectScope(
  pageId: string | null | undefined,
  projectPageIds: readonly string[] | null,
): boolean {
  if (projectPageIds === null) return true;
  return Boolean(pageId && projectPageIds.includes(pageId));
}

/** Marketing / ads: grant fanpage ∩ fanpage của project đang xem. */
export function isMarketingRowVisible(
  viewer: { role: UserRole; pageIds: readonly string[] },
  pageId: string | null | undefined,
  projectPageIds: readonly string[] | null,
): boolean {
  return isPageVisible(viewer, pageId) && isPageInProjectScope(pageId, projectPageIds);
}

/** Ai đang giữ grant fanpage. Staff dùng grant của partner. Super admin không cần grant. */
export function pageGrantUserId(row: {
  role: UserRole;
  id: string;
  partnerId: string | null;
}): string | null {
  if (row.role === "SUPER_ADMIN") return null;
  if (row.role === "STAFF") return row.partnerId;
  return row.id;
}

export interface AccountActor {
  role: UserRole;
  appUserId?: string | null;
}

export function assertCanManageAccount(
  actor: AccountActor,
  target: { role: UserRole; partnerId: string | null },
): void {
  if (actor.role === "SUPER_ADMIN") return;
  if (actor.role !== "PARTNER_ADMIN" || !actor.appUserId) {
    throw new Error("Bạn không có quyền quản lý tài khoản.");
  }
  if (target.role !== "STAFF" || target.partnerId !== actor.appUserId) {
    throw new Error("Chỉ quản lý được nhân viên của bạn.");
  }
}

export function canEmailAccount(
  actor: AccountActor,
  target: { role: UserRole; partnerId: string | null },
): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  return (
    actor.role === "PARTNER_ADMIN" &&
    Boolean(actor.appUserId) &&
    target.role === "STAFF" &&
    target.partnerId === actor.appUserId
  );
}

export interface PreparedAccount {
  role: UserRole;
  partnerId: string | null;
  projectId: string | null;
  aiEnabled: boolean;
  pageIds: string[];
}

/** Quyết định role, partner, project, cờ AI và grant trước khi ghi database. */
export function prepareCreateAccount(
  actor: AccountActor & { projectId?: string | null },
  input: {
    role: UserRole;
    partnerId?: string | null;
    projectId?: string | null;
    aiEnabled?: boolean;
    pageIds?: string[];
  },
): PreparedAccount {
  if (!actor.appUserId && actor.role !== "SUPER_ADMIN") {
    throw new Error("Bạn không có quyền quản lý tài khoản.");
  }
  if (actor.role === "PARTNER_ADMIN") {
    if (input.role !== "STAFF") throw new Error("Partner admin chỉ tạo được nhân viên.");
    return {
      role: "STAFF",
      partnerId: actor.appUserId ?? null,
      projectId: actor.projectId ?? null,
      aiEnabled: false,
      pageIds: [],
    };
  }
  if (actor.role === "SUPER_ADMIN") {
    if (input.role === "SUPER_ADMIN") throw new Error("Không tạo super admin từ màn này.");
    if (input.role === "STAFF") {
      if (!input.partnerId) throw new Error("Nhân viên phải thuộc một partner admin.");
      return {
        role: "STAFF",
        partnerId: input.partnerId,
        projectId: input.projectId ?? null,
        aiEnabled: false,
        pageIds: [],
      };
    }
    if (!input.projectId) throw new Error("Partner admin phải thuộc một project.");
    return {
      role: "PARTNER_ADMIN",
      partnerId: null,
      projectId: input.projectId,
      aiEnabled: Boolean(input.aiEnabled),
      pageIds: input.pageIds ?? [],
    };
  }
  throw new Error("Bạn không có quyền quản lý tài khoản.");
}

export function rejectNewSuperAdmin(current: UserRole, next: UserRole): void {
  if (next === "SUPER_ADMIN" && current !== "SUPER_ADMIN") {
    throw new Error("Không tạo super admin từ màn này.");
  }
}

export function guardAccountUpdate(input: {
  isSelf: boolean;
  wasSuperAdmin: boolean;
  wasActive: boolean;
  nextRole: UserRole;
  nextActive: boolean;
  otherActiveSuperAdmins: number;
}): void {
  if (input.isSelf && input.nextActive === false) {
    throw new Error("Không thể tự vô hiệu hóa tài khoản của mình.");
  }
  if (input.isSelf && input.nextRole !== "SUPER_ADMIN" && input.wasSuperAdmin) {
    throw new Error("Không thể tự hạ quyền super admin của mình.");
  }
  const staysActiveAdmin = input.nextRole === "SUPER_ADMIN" && input.nextActive;
  if (input.wasSuperAdmin && input.wasActive && !staysActiveAdmin && input.otherActiveSuperAdmins === 0) {
    throw new Error("Phải còn ít nhất một super admin đang hoạt động.");
  }
}

/** Staff chỉ sửa lead đang được giao cho mình. Super admin và partner-admin sửa mọi lead trong phạm vi xem. */
export function canEditLead(
  viewer: { role: UserRole; appUserId?: string | null },
  lead: { assigneeId?: string | null },
): boolean {
  if (viewer.role === "STAFF") {
    return Boolean(viewer.appUserId && lead.assigneeId && lead.assigneeId === viewer.appUserId);
  }
  return viewer.role === "SUPER_ADMIN" || viewer.role === "PARTNER_ADMIN";
}

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authRedirectOrigin, sendPasswordSetupEmail } from "@/lib/auth/password-mail";
import { canEmailAccount, canManageUsers, USER_ROLES } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema";
import { createManagedUser, updateManagedUser, type ManagedUser } from "@/lib/db/users-repo";

const roleSchema = z.enum(USER_ROLES);
const emailField = z.union([z.string().trim().email().max(200), z.literal(""), z.null()]).optional();

const createSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: emailField,
  role: roleSchema,
  active: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  partnerId: z.string().uuid().nullable().optional(),
  pageIds: z.array(z.string().min(1)).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
});

export type UserActionResult = { ok: true; user: ManagedUser; notice?: string } | { ok: false; error: string };
export type MailActionResult = { ok: true; notice: string } | { ok: false; error: string };

async function mailNotice(email: string | null, fullName: string): Promise<string | undefined> {
  if (!email) return undefined;
  const sent = await sendPasswordSetupEmail(email, fullName, await authRedirectOrigin());
  if (!sent.ok) return `Không gửi được email: ${sent.error}`;
  return sent.sent === "invite"
    ? "Đã gửi email mời. Người dùng mở link để đặt mật khẩu."
    : "Email đã có tài khoản. Đã gửi link đặt lại mật khẩu.";
}

function normalizeOptionalEmail(email: string | null | undefined) {
  if (email === undefined) return undefined;
  if (email === null || email === "") return null;
  return email;
}

export async function createUserAction(input: unknown): Promise<UserActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canManageUsers(viewer.role)) return { ok: false, error: "Bạn không có quyền quản lý tài khoản." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu tạo tài khoản không hợp lệ." };

  try {
    const user = await createManagedUser(
      {
        fullName: parsed.data.fullName,
        email: normalizeOptionalEmail(parsed.data.email) ?? null,
        role: parsed.data.role,
        active: parsed.data.active,
        aiEnabled: parsed.data.aiEnabled,
        partnerId: parsed.data.partnerId ?? null,
        pageIds: parsed.data.pageIds,
      },
      viewer,
    );
    revalidatePath("/users");
    const notice = await mailNotice(user.email, user.fullName);
    return { ok: true, user, notice };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tạo thất bại." };
  }
}

export async function resendPasswordEmailAction(userId: string): Promise<MailActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canManageUsers(viewer.role)) return { ok: false, error: "Bạn không có quyền quản lý tài khoản." };

  const [target] = await getDb()
    .select({
      id: appUsers.id,
      email: appUsers.email,
      fullName: appUsers.fullName,
      role: appUsers.role,
      partnerId: appUsers.partnerId,
    })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  if (!target?.email) return { ok: false, error: "Tài khoản này chưa có email." };
  if (!canEmailAccount(viewer, target)) {
    return { ok: false, error: "Chỉ gửi được email cho nhân viên của bạn." };
  }

  const sent = await sendPasswordSetupEmail(target.email, target.fullName, await authRedirectOrigin());
  if (!sent.ok) return { ok: false, error: sent.error };
  return {
    ok: true,
    notice:
      sent.sent === "invite"
        ? "Đã gửi email mời. Người dùng mở link để đặt mật khẩu."
        : "Đã gửi link đặt lại mật khẩu.",
  };
}

export async function updateUserAction(input: unknown): Promise<UserActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canManageUsers(viewer.role)) return { ok: false, error: "Bạn không có quyền quản lý tài khoản." };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu cập nhật không hợp lệ." };

  try {
    const user = await updateManagedUser(
      {
        id: parsed.data.id,
        fullName: parsed.data.fullName,
        email: normalizeOptionalEmail(parsed.data.email),
        role: parsed.data.role,
        active: parsed.data.active,
        aiEnabled: parsed.data.aiEnabled,
        partnerId: parsed.data.partnerId,
        pageIds: parsed.data.pageIds,
      },
      viewer,
    );
    revalidatePath("/users");
    return { ok: true, user };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cập nhật thất bại." };
  }
}

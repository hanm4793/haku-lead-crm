"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { USER_ROLES } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import {
  createManagedUser,
  updateManagedUser,
  type ManagedUser,
} from "@/lib/db/users-repo";

const roleSchema = z.enum(USER_ROLES);
const emailField = z.union([z.string().trim().email().max(200), z.literal(""), z.null()]).optional();

const createSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: emailField,
  role: roleSchema,
  showroomId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(1).max(120).optional(),
  email: emailField,
  role: roleSchema.optional(),
  showroomId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

export type UserActionResult = { ok: true; user: ManagedUser } | { ok: false; error: string };

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer) return { error: "Phiên đăng nhập đã hết hạn." as const, viewer: null };
  if (viewer.role !== "ADMIN") return { error: "Chỉ ADMIN mới quản lý tài khoản." as const, viewer: null };
  return { error: null, viewer };
}

function normalizeOptionalEmail(email: string | null | undefined) {
  if (email === undefined) return undefined;
  if (email === null || email === "") return null;
  return email;
}

export async function createUserAction(input: unknown): Promise<UserActionResult> {
  const gate = await requireAdmin();
  if (gate.error || !gate.viewer) return { ok: false, error: gate.error ?? "Không có quyền." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu tạo tài khoản không hợp lệ." };

  try {
    const user = await createManagedUser({
      fullName: parsed.data.fullName,
      email: normalizeOptionalEmail(parsed.data.email) ?? null,
      role: parsed.data.role,
      showroomId: parsed.data.showroomId ?? null,
      active: parsed.data.active,
    });
    revalidatePath("/users");
    revalidatePath("/settings");
    return { ok: true, user };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tạo thất bại." };
  }
}

export async function updateUserAction(input: unknown): Promise<UserActionResult> {
  const gate = await requireAdmin();
  if (gate.error || !gate.viewer) return { ok: false, error: gate.error ?? "Không có quyền." };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu cập nhật không hợp lệ." };

  try {
    const user = await updateManagedUser(
      {
        id: parsed.data.id,
        fullName: parsed.data.fullName,
        email: normalizeOptionalEmail(parsed.data.email),
        role: parsed.data.role,
        showroomId: parsed.data.showroomId,
        active: parsed.data.active,
      },
      gate.viewer.appUserId ?? null,
    );
    revalidatePath("/users");
    revalidatePath("/settings");
    return { ok: true, user };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cập nhật thất bại." };
  }
}

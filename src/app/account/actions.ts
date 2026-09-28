"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Họ tên không được để trống.").max(120),
});

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

/** Người dùng tự cập nhật hồ sơ của mình (không đổi email / vai trò). */
export async function updateOwnProfileAction(input: unknown): Promise<ProfileActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (viewer.isDemo) return { ok: false, error: "Chế độ demo không lưu hồ sơ." };
  if (!viewer.appUserId) return { ok: false, error: "Không tìm thấy hồ sơ người dùng." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const fullName = parsed.data.fullName;

  try {
    await getDb()
      .update(appUsers)
      .set({ fullName })
      .where(eq(appUsers.id, viewer.appUserId));

    const supabase = await createSupabaseServerClient();
    await supabase.auth.updateUser({ data: { full_name: fullName } });

    revalidatePath("/account");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cập nhật thất bại." };
  }
}

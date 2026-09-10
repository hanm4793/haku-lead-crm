"use server";

import { z } from "zod";

import { getViewer } from "@/lib/auth/viewer";
import { appendActivityLog, updateLead } from "@/lib/db/leads-repo";
import type { ActivityLog } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  CHANNEL_DETAIL_OPTIONS,
  FAIL_REASON_OPTIONS,
  SOURCE_OPTIONS,
} from "@/lib/constants";
import type { Lead } from "@/lib/types";

const enumOf = <T extends string>(values: T[]) => z.enum(values as [T, ...T[]]);

const ACTIVITY_KINDS = [
  "CALL",
  "STATUS_CHANGE",
  "CATEGORY_CHANGE",
  "ASSIGN_CHANGE",
  "MISSED_CALL",
  "B10_SYNC",
  "NOTE",
  "CREATE",
] as const;

const patchSchema = z.object({
  contactStatus: z.enum(["CHUA_LIEN_HE", "DA_LIEN_HE"]).optional(),
  category: enumOf([...CATEGORY_OPTIONS.map((o) => o.value), "CHUA_PHAN_LOAI"]).optional(),
  failReason: enumOf(FAIL_REASON_OPTIONS.map((o) => o.value)).nullable().optional(),
  source: enumOf(SOURCE_OPTIONS.map((o) => o.value)).optional(),
  channelDetail: enumOf(CHANNEL_DETAIL_OPTIONS.map((o) => o.value)).optional(),
  assignee: z.string().max(120).nullable().optional(),
  carModel: z.string().max(80).nullable().optional(),
  careNote: z.string().max(4000).nullable().optional(),
  callbackAt: z.string().nullable().optional(),
});

const logSchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  message: z.string().max(2000),
  byAi: z.boolean().optional(),
});

const inputSchema = z.object({
  id: z.string().uuid(),
  patch: patchSchema,
  logs: z.array(logSchema).max(20).default([]),
});

export type UpdateLeadResult = { ok: true; lead: Lead } | { ok: false; error: string };
export type AppendLogResult = { ok: true; logs: ActivityLog[] } | { ok: false; error: string };

export async function updateLeadAction(input: unknown): Promise<UpdateLeadResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu cập nhật không hợp lệ." };

  const { id, patch, logs } = parsed.data;

  try {
    const lead = await updateLead(id, patch, logs, viewer, {
      appUserId: viewer.appUserId,
      fullName: viewer.fullName,
    });
    if (!lead) return { ok: false, error: "Không tìm thấy lead hoặc bạn không có quyền sửa." };
    return { ok: true, lead };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lưu thất bại." };
  }
}

const appendLogSchema = z.object({
  id: z.string().uuid(),
  logs: z.array(logSchema).min(1).max(20),
});

export async function appendActivityLogAction(input: unknown): Promise<AppendLogResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  const parsed = appendLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu nhật ký không hợp lệ." };

  try {
    const logs = await appendActivityLog(parsed.data.id, parsed.data.logs, viewer, {
      appUserId: viewer.appUserId,
      fullName: viewer.fullName,
    });
    if (!logs) return { ok: false, error: "Không tìm thấy lead hoặc bạn không có quyền ghi." };
    return { ok: true, logs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Ghi nhật ký thất bại." };
  }
}

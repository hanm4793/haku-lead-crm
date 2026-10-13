"use server";

import { z } from "zod";

import { canCreateLead, canImportLeads } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { catalogOptionsFromReference, DEFAULT_LEAD_CATALOG } from "@/lib/catalog";
import { listAttrFields } from "@/lib/db/attr-fields-repo";
import { createLeadComment } from "@/lib/db/lead-comments-repo";
import {
  appendActivityLog,
  createManualLead,
  getReferenceData,
  insertImportedLeads,
  listExistingPhonesAndEmails,
  updateLead,
} from "@/lib/db/leads-repo";
import { getDefaultProject } from "@/lib/db/project-repo";
import { listAssignableStaff } from "@/lib/db/users-repo";
import {
  parseAndValidateImportWorkbook,
  type ImportValidationReport,
} from "@/lib/leads/import-leads";
import type { ActivityLog, LeadComment } from "@/lib/types";
import {
  CATEGORY_OPTIONS,
  CHANNEL_DETAIL_OPTIONS,
  FAIL_REASON_OPTIONS,
  SOURCE_OPTIONS,
  UNASSIGNED_ASSIGNMENT_LABEL,
} from "@/lib/constants";
import type { Lead } from "@/lib/types";

const enumOf = <T extends string>(values: T[]) => z.enum(values as [T, ...T[]]);

const ACTIVITY_KINDS = [
  "CALL",
  "STATUS_CHANGE",
  "CATEGORY_CHANGE",
  "ASSIGN_CHANGE",
  "MISSED_CALL",
  "NOTE",
  "CREATE",
] as const;

const patchSchema = z.object({
  name: z.string().max(120, "Họ tên tối đa 120 ký tự.").nullable().optional(),
  phone: z.string().max(30, "Số điện thoại quá dài.").optional(),
  contactStatus: z.enum(["CHUA_LIEN_HE", "DA_LIEN_HE"]).optional(),
  category: enumOf([...CATEGORY_OPTIONS.map((o) => o.value), "CHUA_PHAN_LOAI"]).optional(),
  failReason: enumOf(FAIL_REASON_OPTIONS.map((o) => o.value)).nullable().optional(),
  source: enumOf(SOURCE_OPTIONS.map((o) => o.value)).optional(),
  channelDetail: enumOf(CHANNEL_DETAIL_OPTIONS.map((o) => o.value)).optional(),
  assignee: z.string().max(120).nullable().optional(),
  /** Mã brand trong danh mục. */
  brand: z.string().max(40).nullable().optional(),
  /** Tên sản phẩm trong danh mục. */
  product: z.string().max(80).nullable().optional(),
  /** Tên location; chuỗi rỗng hoặc nhãn "Chưa phân bổ" nghĩa là bỏ gán. */
  location: z
    .string()
    .max(120)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim() ?? "";
      return trimmed && trimmed !== UNASSIGNED_ASSIGNMENT_LABEL ? trimmed : null;
    }),
  careNote: z.string().max(4000).nullable().optional(),
  callbackAt: z.string().nullable().optional(),
  contactCount: z.number().int().min(0).max(9999).optional(),
  attrs: z.record(z.string().max(200), z.string().max(4000)).optional(),
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
  const viewer = await getScopedViewer();
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
  const viewer = await getScopedViewer();
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

const addCommentSchema = z.object({
  leadId: z.string().uuid(),
  content: z
    .string()
    .trim()
    .min(1, "Nội dung bình luận không được để trống.")
    .max(3000, "Nội dung tối đa 3.000 ký tự."),
  parentId: z.string().uuid().nullable().optional(),
});

export type AddLeadCommentResult = { ok: true; comment: LeadComment } | { ok: false; error: string };

export async function addLeadCommentAction(input: unknown): Promise<AddLeadCommentResult> {
  const viewer = await getScopedViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  const parsed = addCommentSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.";
    return { ok: false, error: errorMsg };
  }

  try {
    const comment = await createLeadComment(parsed.data, viewer);
    return { ok: true, comment };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Thêm bình luận thất bại." };
  }
}

const createManualLeadSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập họ tên khách hàng.").max(120, "Họ tên tối đa 120 ký tự."),
  phone: z.string().trim().min(1, "Vui lòng nhập số điện thoại.").max(30, "Số điện thoại quá dài."),
  email: z.string().max(160).nullable().optional(),
  brand: z.string().max(40).nullable().optional(),
  product: z.string().max(80).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  channelDetail: enumOf(CHANNEL_DETAIL_OPTIONS.map((o) => o.value)).optional(),
  category: enumOf([...CATEGORY_OPTIONS.map((o) => o.value), "CHUA_PHAN_LOAI"]).optional(),
  failReason: enumOf(FAIL_REASON_OPTIONS.map((o) => o.value)).nullable().optional(),
  assignee: z.string().max(120).nullable().optional(),
  careNote: z.string().max(4000).nullable().optional(),
  callbackAt: z.string().nullable().optional(),
  attrs: z.record(z.string().max(200), z.string().max(4000)).optional(),
});

export type CreateManualLeadResult = { ok: true; lead: Lead } | { ok: false; error: string };

export async function createManualLeadAction(input: unknown): Promise<CreateManualLeadResult> {
  const viewer = await getScopedViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canCreateLead(viewer.role)) {
    return { ok: false, error: "Bạn không có quyền tạo lead." };
  }

  const parsed = createManualLeadSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message ?? "Dữ liệu tạo lead không hợp lệ.";
    return { ok: false, error: errorMsg };
  }

  try {
    const lead = await createManualLead(parsed.data, viewer, {
      appUserId: viewer.appUserId,
      fullName: viewer.fullName,
    });
    return { ok: true, lead };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tạo lead thất bại." };
  }
}

export type ValidateLeadImportResult =
  | { ok: true; report: ImportValidationReport }
  | { ok: false; error: string };

export async function validateLeadImportAction(formData: FormData): Promise<ValidateLeadImportResult> {
  const viewer = await getScopedViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canImportLeads(viewer.role)) {
    return { ok: false, error: "Bạn không có quyền import lead." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Vui lòng chọn file Excel (.xlsx) để kiểm tra." };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Chỉ hỗ trợ định dạng file Excel (.xlsx)." };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const projectId = viewer.activeProjectId ?? (await getDefaultProject())?.id ?? null;

    const [reference, attrFields, assignees, existingLeads] = await Promise.all([
      getReferenceData(projectId ?? undefined).catch(() => null),
      projectId ? listAttrFields(projectId, { activeOnly: true }).catch(() => []) : Promise.resolve([]),
      listAssignableStaff(viewer).catch(() => []),
      listExistingPhonesAndEmails(projectId),
    ]);

    const catalog = reference ? catalogOptionsFromReference(reference) : DEFAULT_LEAD_CATALOG;
    const report = await parseAndValidateImportWorkbook(arrayBuffer, {
      catalog,
      attrFields,
      assignees,
      existingLeads,
      viewer: {
        role: viewer.role,
        appUserId: viewer.appUserId,
        fullName: viewer.fullName,
      },
    });

    return { ok: true, report };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không đọc được file Excel.",
    };
  }
}

const commitImportSchema = z.object({
  rows: z.array(createManualLeadSchema).min(1).max(2000),
});

export type CommitLeadImportResult =
  | { ok: true; importedCount: number }
  | { ok: false; error: string };

export async function commitLeadImportAction(input: unknown): Promise<CommitLeadImportResult> {
  const viewer = await getScopedViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canImportLeads(viewer.role)) {
    return { ok: false, error: "Bạn không có quyền import lead." };
  }

  const parsed = commitImportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Danh sách lead cần import không hợp lệ." };
  }

  try {
    const res = await insertImportedLeads(parsed.data.rows, viewer, {
      appUserId: viewer.appUserId,
      fullName: viewer.fullName,
    });
    return { ok: true, importedCount: res.importedCount };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Import lead thất bại.",
    };
  }
}


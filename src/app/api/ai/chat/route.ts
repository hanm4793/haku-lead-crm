import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { exportSpecSchema, type ExportSpec } from "@/lib/ai/export-spec";
import { parseExportRequestLocally } from "@/lib/ai/fallback-parser";
import type { ExportPreview } from "@/lib/ai/export-preview";
import { estimateCostUsd, resolveModel } from "@/lib/ai/model";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { refineSpec } from "@/lib/ai/refine-spec";
import { getViewer } from "@/lib/auth/viewer";
import type { ViewerScope } from "@/lib/db/leads-repo";
import { queryReportKpis, querySheetCounts } from "@/lib/db/report-queries";
import { exportSpecToFilters } from "@/lib/export/to-filters";
import type { PivotDimension } from "@/lib/metrics";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
});

const responseSchema = z.object({
  action: z.enum(["EXPORT", "ANSWER", "CLARIFY"]),
  reply: z.string(),
  spec: exportSpecSchema.nullable().optional(),
});

async function buildPreview(spec: ExportSpec, viewer: ViewerScope, now: Date): Promise<ExportPreview> {
  // Preview chỉ cần số liệu — dùng SQL aggregation, không kéo từng dòng lead.
  const filters = exportSpecToFilters(spec);
  if (spec.filters?.overdueOnly) filters.tab = "QUA_HAN";

  const [kpis, sheets] = await Promise.all([
    queryReportKpis(filters, viewer, now),
    spec.splitSheetsBy
      ? querySheetCounts(filters, viewer, now, spec.splitSheetsBy as PivotDimension)
      : Promise.resolve([] as { name: string; count: number }[]),
  ]);

  return {
    total: kpis.total,
    sheets,
    kpis: [
      { label: "Đã liên hệ", value: String(kpis.contacted) },
      { label: "KHQT trở lên", value: String(kpis.khqt) },
      { label: "Bị loại", value: String(kpis.failed) },
      { label: "Quá hạn", value: String(kpis.overdue) },
    ],
  };
}

async function fallbackResponse(text: string, viewer: ViewerScope, now: Date, note?: string) {
  const local = parseExportRequestLocally(text, now);
  const spec = local.spec ? refineSpec(local.spec, text) : null;
  return NextResponse.json({
    mode: "fallback",
    action: spec ? "EXPORT" : "ANSWER",
    reply: note ? `${note}\n\n${local.reply}` : local.reply,
    spec,
    preview: spec ? await buildPreview(spec, viewer, now) : null,
  });
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
  }

  const { messages } = parsed.data;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const now = new Date();

  const resolved = resolveModel();
  if (!resolved) return fallbackResponse(lastUserMessage, viewer, now);

  // Thử lại một lần: lỗi thoáng qua và lỗi schema đều thường qua ở lần hai.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await generateObject({
        model: resolved.model,
        schema: responseSchema,
        system: buildSystemPrompt(now),
        messages,
        temperature: 0,
      });

      const object = result.object;
      const validated = object.spec ? exportSpecSchema.safeParse(object.spec) : null;

      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;
      const usage = {
        provider: resolved.provider,
        model: resolved.modelId,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(resolved.modelId, inputTokens, outputTokens),
      };
      console.log("[ai/chat]", JSON.stringify(usage));

      if (object.action === "EXPORT" && validated?.success) {
        const spec = refineSpec(validated.data, lastUserMessage);
        return NextResponse.json({
          mode: "ai",
          action: "EXPORT",
          reply: object.reply,
          spec,
          preview: await buildPreview(spec, viewer, now),
          usage,
        });
      }

      if (validated && !validated.success && attempt === 0) {
        lastError = validated.error;
        continue;
      }

      return NextResponse.json({
        mode: "ai",
        action: validated && !validated.success ? "CLARIFY" : object.action,
        reply:
          validated && !validated.success
            ? `${object.reply}\n\n(Mình tạo cấu hình chưa hợp lệ, bạn mô tả rõ hơn giúp mình nhé.)`
            : object.reply,
        spec: null,
        preview: null,
        usage,
      });
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "lỗi không xác định";
  return fallbackResponse(
    lastUserMessage,
    viewer,
    now,
    `Không gọi được ${resolved.providerLabel} (${detail}). Mình tạm hiểu theo từ khóa:`,
  );
}

import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { answerFromStats } from "@/lib/ai/answer-stats";
import { catalogFromReference, DEFAULT_AI_CATALOG, type AiCatalog } from "@/lib/ai/catalog-context";
import { exportSpecSchema, type ExportSpec } from "@/lib/ai/export-spec";
import { parseExportRequestLocally } from "@/lib/ai/fallback-parser";
import type { ExportPreview } from "@/lib/ai/export-preview";
import { estimateCostUsd, resolveModel } from "@/lib/ai/model";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { refineSpec } from "@/lib/ai/refine-spec";
import { parseStatsQuestion, mergeStats, applyMentions, blankStats, statsFromModel, statsQuerySchema, type ChatMention } from "@/lib/ai/stats-query";
import { canUseAi } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { getReferenceData, type ViewerScope } from "@/lib/db/leads-repo";
import { queryReportKpis, querySheetCounts } from "@/lib/db/report-queries";
import { exportSpecToFilters } from "@/lib/export/to-filters";
import type { PivotDimension } from "@/lib/metrics";

export const runtime = "nodejs";
export const maxDuration = 30;

const mentionSchema = z.object({
  type: z.enum(["fanpage", "campaign", "ad", "lead", "assignee", "product", "brand", "location"]),
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
});

const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
  mentions: z.array(mentionSchema).max(8).optional(),
  lastSpec: exportSpecSchema.nullable().optional(),
  lastStats: statsQuerySchema.nullable().optional(),
});

const responseSchema = z.object({
  action: z.enum(["STATS", "EXPORT", "ANSWER", "CLARIFY"]),
  reply: z.string(),
  spec: exportSpecSchema.nullable().optional(),
  stats: statsQuerySchema.nullable().optional(),
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

/** Danh mục brand / sản phẩm / location đọc từ DB để prompt và bộ dò từ khóa dùng đúng tên. */
async function loadCatalog(projectId?: string): Promise<AiCatalog> {
  try {
    return catalogFromReference(await getReferenceData(projectId));
  } catch {
    return DEFAULT_AI_CATALOG;
  }
}

async function fallbackResponse(
  text: string,
  viewer: ViewerScope,
  now: Date,
  catalog: AiCatalog,
  mentions: ChatMention[] = [],
  note?: string,
) {
  const parsedQuestion = parseStatsQuestion(text, now);
  const base = parsedQuestion ?? (mentions.length ? blankStats() : null);
  if (base && (parsedQuestion || mentions.length)) {
    const stats = applyMentions(base, mentions);
    const statsRes = await answerFromStats(stats, viewer, now, text, catalog);
    return NextResponse.json({
      mode: "fallback",
      action: "STATS",
      reply: note ? `${note}\n\n${statsRes.reply}` : statsRes.reply,
      spec: null,
      preview: null,
      breakdown: statsRes.leadBreakdown ?? null,
      marketingRows: statsRes.marketingRows ?? null,
      suggestions: statsRes.suggestions,
    });
  }

  const local = parseExportRequestLocally(text, now, catalog);
  const spec = local.spec ? refineSpec(local.spec, text, catalog) : null;
  return NextResponse.json({
    mode: "fallback",
    action: spec ? "EXPORT" : "ANSWER",
    reply: note ? `${note}\n\n${local.reply}` : local.reply,
    spec,
    preview: spec ? await buildPreview(spec, viewer, now) : null,
    suggestions: spec
      ? ["Tải file Excel (.xlsx)", "Tải file CSV", "Áp dụng vào bộ lọc danh sách lead"]
      : ["Tháng này có bao nhiêu lead?", "Chi tiêu và CPL theo fanpage", "Xuất file Excel tháng này"],
  });
}

export async function POST(request: Request) {
  const viewer = await getScopedViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canUseAi(viewer)) {
    return NextResponse.json({ error: "Tài khoản này chưa được bật trợ lý AI." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
  }

  const { messages, mentions = [], lastSpec, lastStats } = parsed.data;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const now = new Date();
  const catalog = await loadCatalog(viewer.activeProjectId ?? undefined);

  const resolved = resolveModel();
  if (!resolved) return fallbackResponse(lastUserMessage, viewer, now, catalog, mentions);

  // Thử lại một lần: lỗi thoáng qua và lỗi schema đều thường qua ở lần hai.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await generateObject({
        model: resolved.model,
        schema: responseSchema,
        system: buildSystemPrompt(now, catalog, { lastSpec, lastStats }),
        messages,
        temperature: 0,
      });

      const object = result.object;
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

      const modelStats = statsFromModel(object.stats);
      const localStats = parseStatsQuestion(lastUserMessage, now);
      const asksForNumbers = object.action === "STATS" || (object.action !== "EXPORT" && (localStats !== null || mentions.length > 0));

      if (asksForNumbers) {
        const stats = applyMentions(mergeStats(modelStats, localStats) ?? blankStats(), mentions);
        if (stats) {
          const statsRes = await answerFromStats(stats, viewer, now, lastUserMessage, catalog);
          return NextResponse.json({
            mode: "ai",
            action: "STATS",
            reply: statsRes.reply,
            spec: null,
            preview: null,
            breakdown: statsRes.leadBreakdown ?? null,
            marketingRows: statsRes.marketingRows ?? null,
            suggestions: statsRes.suggestions,
            usage,
          });
        }
      }

      const validated = object.spec ? exportSpecSchema.safeParse(object.spec) : null;

      if (object.action === "EXPORT" && validated?.success) {
        const spec = refineSpec(validated.data, lastUserMessage, catalog);
        return NextResponse.json({
          mode: "ai",
          action: "EXPORT",
          reply: object.reply,
          spec,
          preview: await buildPreview(spec, viewer, now),
          suggestions: ["Tải file Excel (.xlsx)", "Tải file CSV", "Áp dụng vào bộ lọc danh sách lead"],
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
        suggestions: ["Tháng này có bao nhiêu lead?", "Chi tiêu và CPL theo fanpage", "Xuất file Excel tháng này"],
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
    catalog,
    mentions,
    `Không gọi được ${resolved.providerLabel} (${detail}). Mình tạm hiểu theo từ khóa:`,
  );
}

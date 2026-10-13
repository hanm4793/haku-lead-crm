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
import {
  applyMentions,
  blankStats,
  fold,
  inheritStatsQuery,
  lastStatsSchema,
  mergeContextMentions,
  mergeStats,
  parseStatsQuestion,
  statsFromLastStats,
  statsFromModel,
  statsQuerySchema,
  stripMentionLabels,
  type ChatMention,
  type StatsQuery,
} from "@/lib/ai/stats-query";
import { canUseAi, canViewMarketing } from "@/lib/auth/roles";
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
  lastStats: lastStatsSchema.nullable().optional(),
  lastMentions: z.array(mentionSchema).max(8).optional(),
});

const responseSchema = z.object({
  action: z.enum(["STATS", "EXPORT", "ANSWER", "CLARIFY"]),
  reply: z.string(),
  spec: exportSpecSchema.nullable().optional(),
  stats: statsQuerySchema.nullable().optional(),
});

function defaultSuggestions(viewer: ViewerScope, mentions: ChatMention[] = []) {
  const allowMarketing = canViewMarketing(viewer.role);
  return [
    { label: "Tháng này có bao nhiêu lead?", prompt: "Tháng này có bao nhiêu lead?", mentions },
    allowMarketing
      ? { label: "Chi tiêu và CPL theo fanpage", prompt: "Chi tiêu và CPL theo fanpage tháng này", mentions }
      : { label: "Tỷ lệ liên hệ và KHQT theo nhân viên", prompt: "Tỷ lệ liên hệ và KHQT theo nhân viên tháng này", mentions },
    { label: "Xuất file Excel tháng này", prompt: "Xuất lead tháng này ra excel", mentions },
  ];
}

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
  lastStats: StatsQuery | null = null,
  lastSpec: ExportSpec | null = null,
  note?: string,
) {
  const cleanText = stripMentionLabels(text, mentions);
  const isExportIntent = /(xuat|export|tai ve|file excel|excel|csv)/.test(fold(cleanText));

  if (!isExportIntent) {
    const parsedQuestion = parseStatsQuestion(cleanText, now, { lastStats, mentions });
    const base =
      parsedQuestion ??
      (mentions.length > 0 ? inheritStatsQuery(blankStats(), lastStats, cleanText, now) : null);

    if (base && (parsedQuestion || mentions.length > 0)) {
      const stats = applyMentions(base, mentions);
      const statsRes = await answerFromStats(stats, viewer, now, cleanText, catalog, mentions);
      return NextResponse.json({
        mode: "fallback",
        action: "STATS",
        reply: note ? `${note}\n\n${statsRes.reply}` : statsRes.reply,
        spec: null,
        stats: statsRes.resolvedQuery,
        preview: null,
        breakdown: statsRes.leadBreakdown ?? null,
        marketingRows: statsRes.marketingRows ?? null,
        suggestions: statsRes.suggestions,
        activeMentions: statsRes.resolvedMentions,
      });
    }
  }

  const local = parseExportRequestLocally(text, now, catalog, { mentions, lastStats, lastSpec });
  const spec = local.spec
    ? refineSpec(local.spec, text, catalog, { mentions, lastStats, lastSpec, now })
    : null;
  return NextResponse.json({
    mode: "fallback",
    action: spec ? "EXPORT" : "ANSWER",
    reply: note ? `${note}\n\n${local.reply}` : local.reply,
    spec,
    stats: lastStats,
    preview: spec ? await buildPreview(spec, viewer, now) : null,
    suggestions: spec
      ? [
          { label: "Tải file Excel (.xlsx)", prompt: "Xuất file Excel", mentions },
          { label: "Tải file CSV", prompt: "Xuất file CSV", mentions },
          { label: "Áp dụng vào bộ lọc danh sách lead", prompt: "Xem trên danh sách lead", mentions },
        ]
      : defaultSuggestions(viewer, mentions),
    activeMentions: mentions,
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

  const { messages, mentions = [], lastSpec = null, lastStats = null, lastMentions = [] } = parsed.data;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const now = new Date();
  const catalog = await loadCatalog(viewer.activeProjectId ?? undefined);

  // Hợp nhất @mentions của lượt hiện tại với @mentions đang ghim từ lượt trước
  const effectiveMentions = mergeContextMentions(mentions, lastMentions, lastUserMessage);
  const previousStats = statsFromLastStats(lastStats);
  const cleanUserMessage = stripMentionLabels(lastUserMessage, effectiveMentions);

  const resolved = resolveModel();
  if (!resolved) {
    return fallbackResponse(lastUserMessage, viewer, now, catalog, effectiveMentions, previousStats, lastSpec);
  }

  // Thử lại một lần: lỗi thoáng qua và lỗi schema đều thường qua ở lần hai.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await generateObject({
        model: resolved.model,
        schema: responseSchema,
        system: buildSystemPrompt(now, catalog, {
          lastSpec,
          lastStats: previousStats,
          activeMentions: effectiveMentions,
        }),
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

      const isExportIntent =
        object.action === "EXPORT" || /(xuat|export|tai ve|file excel|excel|csv)/.test(fold(cleanUserMessage));
      const modelStats = statsFromModel(object.stats);
      const localStats = parseStatsQuestion(cleanUserMessage, now, {
        lastStats: previousStats,
        mentions: effectiveMentions,
      });
      const asksForNumbers =
        !isExportIntent &&
        (object.action === "STATS" || localStats !== null || effectiveMentions.length > 0);

      if (asksForNumbers) {
        const merged =
          mergeStats(modelStats, localStats, previousStats, cleanUserMessage, now) ??
          inheritStatsQuery(blankStats(), previousStats, cleanUserMessage, now);
        const stats = applyMentions(merged, effectiveMentions);
        if (stats) {
          const statsRes = await answerFromStats(
            stats,
            viewer,
            now,
            cleanUserMessage,
            catalog,
            effectiveMentions,
          );
          return NextResponse.json({
            mode: "ai",
            action: "STATS",
            reply: statsRes.reply,
            spec: null,
            stats: statsRes.resolvedQuery,
            preview: null,
            breakdown: statsRes.leadBreakdown ?? null,
            marketingRows: statsRes.marketingRows ?? null,
            suggestions: statsRes.suggestions,
            activeMentions: statsRes.resolvedMentions,
            usage,
          });
        }
      }

      const validated = object.spec ? exportSpecSchema.safeParse(object.spec) : null;

      if (isExportIntent) {
        const baseSpec = validated?.success
          ? validated.data
          : parseExportRequestLocally(lastUserMessage, now, catalog, {
              mentions: effectiveMentions,
              lastStats: previousStats,
              lastSpec,
            }).spec;

        if (baseSpec) {
          const spec = refineSpec(baseSpec, lastUserMessage, catalog, {
            mentions: effectiveMentions,
            lastStats: previousStats,
            lastSpec,
            now,
          });
          return NextResponse.json({
            mode: "ai",
            action: "EXPORT",
            reply: object.reply || spec.summary,
            spec,
            stats: previousStats,
            preview: await buildPreview(spec, viewer, now),
            suggestions: [
              { label: "Tải file Excel (.xlsx)", prompt: "Xuất file Excel", mentions: effectiveMentions },
              { label: "Tải file CSV", prompt: "Xuất file CSV", mentions: effectiveMentions },
              { label: "Áp dụng vào bộ lọc danh sách lead", prompt: "Xem trên danh sách lead", mentions: effectiveMentions },
            ],
            activeMentions: effectiveMentions,
            usage,
          });
        }
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
        stats: previousStats,
        preview: null,
        suggestions: defaultSuggestions(viewer, effectiveMentions),
        activeMentions: effectiveMentions,
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
    effectiveMentions,
    previousStats,
    lastSpec,
    `Không gọi được ${resolved.providerLabel} (${detail}). Mình tạm hiểu theo từ khóa:`,
  );
}


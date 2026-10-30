import { CHANNEL_DETAIL_OPTIONS, SOURCE_OPTIONS } from "@/lib/constants";

import { DEFAULT_AI_CATALOG, type AiCatalog } from "./catalog-context";
import { DEFAULT_EXPORT_COLUMNS, type ExportSpec } from "./export-spec";
import {
  parseTimeRange,
  periodLabel,
  stripMentionLabels,
  type ChatMention,
  type StatsQuery,
} from "./stats-query";

function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export interface LocalExportContext {
  mentions?: ChatMention[];
  lastStats?: StatsQuery | null;
  lastSpec?: ExportSpec | null;
}

/**
 * Bộ phân tích theo luật, dùng khi chưa cấu hình GOOGLE_GENERATIVE_AI_API_KEY.
 * Bao phủ các mẫu câu phổ biến nhất để demo chạy được mà không cần API key.
 */
export function parseExportRequestLocally(
  text: string,
  now: Date = new Date(),
  catalog: AiCatalog = DEFAULT_AI_CATALOG,
  context?: LocalExportContext,
): { reply: string; spec: ExportSpec | null } {
  const mentions = context?.mentions ?? [];
  const raw = (mentions.length ? stripMentionLabels(text, mentions) : text).trim();
  const q = fold(raw);
  const { labels } = catalog;

  const wantsExport = /(xuat|export|tai ve|file|excel|csv|danh sach)/.test(q);
  if (!wantsExport) {
    return {
      reply:
        "Bạn có thể hỏi số liệu theo thời gian hoặc đối tượng (ví dụ: \"dữ liệu tháng 9\", \"chi tiêu và CPL theo fanpage tháng này\", \"dữ liệu của @Fanpage vào tháng 9\") hoặc yêu cầu xuất dữ liệu (\"xuất lead tháng 9 ra excel\").",
      spec: null,
    };
  }

  const filters: ExportSpec["filters"] = {};
  const described: string[] = [];

  const time = parseTimeRange(raw, now);
  if (time.hasExplicitTime && !time.clearsDate) {
    filters.dateFrom = time.dateFrom;
    filters.dateTo = time.dateTo;
    if (time.label) described.push(time.label);
  } else if (!time.clearsDate && (context?.lastStats?.dateFrom || context?.lastStats?.dateTo)) {
    filters.dateFrom = context.lastStats.dateFrom;
    filters.dateTo = context.lastStats.dateTo;
    described.push(periodLabel(filters.dateFrom ?? null, filters.dateTo ?? null).toLowerCase());
  } else if (!time.clearsDate && (context?.lastSpec?.filters?.dateFrom || context?.lastSpec?.filters?.dateTo)) {
    filters.dateFrom = context.lastSpec.filters.dateFrom;
    filters.dateTo = context.lastSpec.filters.dateTo;
    described.push(periodLabel(filters.dateFrom ?? null, filters.dateTo ?? null).toLowerCase());
  }

  if (mentions.length > 0) {
    described.push(mentions.map((m) => `@${m.label}`).join(", "));
  }

  const sources = SOURCE_OPTIONS.filter((o) => q.includes(fold(o.label)) || q.includes(fold(o.value))).map(
    (o) => o.value,
  );
  if (sources.length) {
    filters.sources = sources;
    described.push(`nguồn ${sources.join(", ")}`);
  }

  const channelDetails: NonNullable<ExportSpec["filters"]["channelDetails"]> = [];
  if (/tin nhan|messenger|\binbox\b/.test(q)) channelDetails.push("TIN_NHAN");
  if (/comment|binh luan/.test(q)) channelDetails.push("COMMENT");
  if (/\bform\b|dien form/.test(q)) channelDetails.push("FORM");
  if (/cuoc goi/.test(q)) channelDetails.push("CUOC_GOI");
  if (/chat web/.test(q)) channelDetails.push("CHAT_WEB");
  if (channelDetails.length) {
    filters.channelDetails = channelDetails;
    const labelsText = channelDetails
      .map((c) => CHANNEL_DETAIL_OPTIONS.find((o) => o.value === c)?.label ?? c)
      .join(", ");
    described.push(`chi tiết kênh ${labelsText}`);
  }

  if (/khqt|quan tam/.test(q)) {
    filters.categories = /tro len/.test(q) ? ["KHQT", "GDTD", "KHD"] : ["KHQT"];
    described.push("khách quan tâm");
  } else if (/fail|mat khach|bi loai|\bloai\b/.test(q)) {
    filters.categories = ["FAIL"];
    described.push("khách bị loại");
  } else if (/ky hop dong|khd/.test(q)) {
    filters.categories = ["KHD"];
    described.push("khách ký hợp đồng");
  }

  if (/qua han/.test(q)) {
    filters.overdueOnly = true;
    described.push("quá hạn gọi lại");
  }

  if (/chua lien he/.test(q)) {
    filters.contactStatus = "CHUA_LIEN_HE";
    described.push("chưa liên hệ");
  } else if (/da lien he/.test(q)) {
    filters.contactStatus = "DA_LIEN_HE";
    described.push("đã liên hệ");
  }

  const locations = catalog.locations.filter((s) => q.includes(fold(s)));
  if (locations.length) {
    filters.locations = [...locations];
    described.push(`${labels.location.toLowerCase()} ${locations.join(", ")}`);
  }

  const assignees = catalog.assignees.filter((s) => q.includes(fold(s)));
  if (assignees.length) {
    filters.assignees = [...assignees];
    described.push(`phụ trách ${assignees.join(", ")}`);
  }

  const products = catalog.products.filter((m) => q.includes(fold(m)));
  if (products.length) {
    filters.products = products;
    described.push(`${labels.product.toLowerCase()} ${products.join(", ")}`);
  }

  const productWord = fold(labels.product);
  const locationWord = fold(labels.location);

  let splitSheetsBy: ExportSpec["splitSheetsBy"] = null;
  if (/tach.*(sheet|cot)|moi .* mot sheet/.test(q)) {
    if (/phu trach|nhan vien|sale/.test(q)) splitSheetsBy = "assignee";
    else if (/dong xe|san pham|loai san pham/.test(q) || q.includes(productWord)) splitSheetsBy = "product";
    else if (/chi tiet kenh|hinh thuc/.test(q)) splitSheetsBy = "channelDetail";
    else if (/nguon|kenh/.test(q)) splitSheetsBy = "source";
    else if (/dai ly|showroom|dia diem|dia chi|chi nhanh|khu vuc/.test(q) || q.includes(locationWord)) splitSheetsBy = "location";
    else if (/trang thai|phan loai/.test(q)) splitSheetsBy = "category";
  }

  const summary = described.length
    ? `Xuất danh sách lead ${described.join(", ")}.`
    : "Xuất toàn bộ danh sách lead.";

  return {
    reply: `${summary} Bạn kiểm tra lại bộ lọc bên dưới rồi bấm tải nhé.`,
    spec: {
      title: "danh-sach-lead",
      summary,
      filters,
      columns: DEFAULT_EXPORT_COLUMNS,
      splitSheetsBy,
      sortBy: "createdAt",
      sortOrder: "desc",
      includeSummarySheet: true,
      format: /csv/.test(q) ? "csv" : "xlsx",
    },
  };
}

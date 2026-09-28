import { SOURCE_OPTIONS } from "@/lib/constants";
import { toDateInputValue } from "@/lib/utils";

import { DEFAULT_AI_CATALOG, type AiCatalog } from "./catalog-context";
import { DEFAULT_EXPORT_COLUMNS, type ExportSpec } from "./export-spec";

function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

/**
 * Bộ phân tích theo luật, dùng khi chưa cấu hình GOOGLE_GENERATIVE_AI_API_KEY.
 * Bao phủ các mẫu câu phổ biến nhất để demo chạy được mà không cần API key.
 */
export function parseExportRequestLocally(
  text: string,
  now: Date = new Date(),
  catalog: AiCatalog = DEFAULT_AI_CATALOG,
): { reply: string; spec: ExportSpec | null } {
  const raw = text.trim();
  const q = fold(raw);
  const { labels } = catalog;

  const wantsExport = /(xuat|export|tai ve|file|excel|csv|danh sach)/.test(q);
  if (!wantsExport) {
    return {
      reply:
        "Mình hiện chạy ở chế độ không có API key nên chỉ xử lý được yêu cầu xuất dữ liệu. Bạn thử: \"xuất lead Facebook tháng này, tách sheet theo phụ trách\".",
      spec: null,
    };
  }

  const filters: ExportSpec["filters"] = {};
  const described: string[] = [];

  const iso = (d: Date) => toDateInputValue(d.toISOString());

  if (/thang nay/.test(q)) {
    filters.dateFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    filters.dateTo = iso(now);
    described.push("tháng này");
  } else if (/thang truoc/.test(q)) {
    filters.dateFrom = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    filters.dateTo = iso(new Date(now.getFullYear(), now.getMonth(), 0));
    described.push("tháng trước");
  } else if (/hom nay/.test(q)) {
    filters.dateFrom = iso(now);
    filters.dateTo = iso(now);
    described.push("hôm nay");
  } else {
    const days = /(\d+)\s*ngay/.exec(q);
    if (days) {
      const from = new Date(now);
      from.setDate(from.getDate() - (Number(days[1]) - 1));
      filters.dateFrom = iso(from);
      filters.dateTo = iso(now);
      described.push(`${days[1]} ngày gần nhất`);
    }
    const month = /thang\s*(\d{1,2})/.exec(q);
    if (month) {
      const m = Number(month[1]) - 1;
      filters.dateFrom = iso(new Date(now.getFullYear(), m, 1));
      filters.dateTo = iso(new Date(now.getFullYear(), m + 1, 0));
      described.push(`tháng ${month[1]}`);
    }
  }

  const sources = SOURCE_OPTIONS.filter((o) => q.includes(o.label.toLowerCase())).map((o) => o.value);
  if (sources.length) {
    filters.sources = sources;
    described.push(`nguồn ${sources.join(", ")}`);
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
    else if (/dong xe|san pham/.test(q) || q.includes(productWord)) splitSheetsBy = "product";
    else if (/nguon|kenh/.test(q)) splitSheetsBy = "source";
    else if (/showroom|dia diem|chi nhanh/.test(q) || q.includes(locationWord)) splitSheetsBy = "location";
    else if (/trang thai|phan loai/.test(q)) splitSheetsBy = "category";
  }

  const summary = described.length
    ? `Xuất danh sách lead ${described.join(", ")}.`
    : "Xuất toàn bộ danh sách lead.";

  return {
    reply: `Mình đang chạy chế độ không có API key nên hiểu theo từ khóa. ${summary} Bạn kiểm tra lại bộ lọc bên dưới rồi bấm tải nhé.`,
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

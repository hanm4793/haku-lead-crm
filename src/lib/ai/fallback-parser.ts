import {
  ALL_CAR_MODELS,
  ASSIGNEES,
  SHOWROOMS,
  SOURCE_OPTIONS,
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/utils";

import { DEFAULT_EXPORT_COLUMNS, type ExportSpec } from "./export-spec";

/**
 * Bộ phân tích theo luật, dùng khi chưa cấu hình GOOGLE_GENERATIVE_AI_API_KEY.
 * Bao phủ các mẫu câu phổ biến nhất để demo chạy được mà không cần API key.
 */
export function parseExportRequestLocally(
  text: string,
  now: Date = new Date(),
): { reply: string; spec: ExportSpec | null } {
  const raw = text.trim();
  const q = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();

  const wantsExport = /(xuat|export|tai ve|file|excel|csv|danh sach)/.test(q);
  if (!wantsExport) {
    return {
      reply:
        "Mình hiện chạy ở chế độ không có API key nên chỉ xử lý được yêu cầu xuất dữ liệu. Bạn thử: \"xuất lead Facebook tháng này chưa lên B10, tách sheet theo phụ trách\".",
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

  if (/chua len b10|chua doi soat/.test(q)) {
    filters.b10 = "NOT_PUSHED";
    described.push("chưa lên B10");
  } else if (/da len b10|da doi soat/.test(q)) {
    filters.b10 = "PUSHED";
    described.push("đã lên B10");
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

  const showrooms = SHOWROOMS.filter((s) =>
    q.includes(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase()),
  );
  if (showrooms.length) {
    filters.showrooms = [...showrooms];
    described.push(`showroom ${showrooms.join(", ")}`);
  }

  const assignees = ASSIGNEES.filter((s) =>
    q.includes(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase()),
  );
  if (assignees.length) {
    filters.assignees = [...assignees];
    described.push(`phụ trách ${assignees.join(", ")}`);
  }

  const models = ALL_CAR_MODELS.filter((m) => q.includes(m.toLowerCase()));
  if (models.length) {
    filters.carModels = models;
    described.push(`dòng xe ${models.join(", ")}`);
  }

  let splitSheetsBy: ExportSpec["splitSheetsBy"] = null;
  if (/tach.*(sheet|cot)|moi .* mot sheet/.test(q)) {
    if (/phu trach|nhan vien|sale/.test(q)) splitSheetsBy = "assignee";
    else if (/dong xe/.test(q)) splitSheetsBy = "carModel";
    else if (/nguon|kenh/.test(q)) splitSheetsBy = "source";
    else if (/showroom/.test(q)) splitSheetsBy = "showroom";
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

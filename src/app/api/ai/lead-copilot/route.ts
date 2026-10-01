import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveModel } from "@/lib/ai/model";
import { canUseAi } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { getActivityLogs, getLeadById, getReferenceData } from "@/lib/db/leads-repo";
import { DEFAULT_CATALOG_LABELS } from "@/lib/constants";
import type { ActivityLog, CatalogLabels, Lead } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  leadId: z.string().uuid(),
  action: z.enum(["summarize", "suggest_action", "polish_note"]),
  draftNote: z.string().optional(),
});

function fallbackCopilot(
  action: "summarize" | "suggest_action" | "polish_note",
  lead: Lead,
  logs: ActivityLog[],
  labels: CatalogLabels = DEFAULT_CATALOG_LABELS,
  draftNote?: string,
) {
  if (action === "summarize") {
    const lines = [
      `• Khách hàng: ${lead.name || "Chưa có tên"} (${lead.phone}) — Quan tâm: ${lead.product || lead.brand || "Chưa rõ"}.`,
      `• Trạng thái: ${lead.category} (${lead.contactStatus === "DA_LIEN_HE" ? "Đã liên hệ" : "Chưa liên hệ"}), ghi chú: ${lead.careNote || "Chưa có ghi chú"}.`,
      `• Lịch sử: Đã có ${logs.length} lượt tương tác ghi nhận trên hệ thống.`,
    ];
    return lines.join("\n");
  }

  if (action === "suggest_action") {
    const itemLabel = lead.product || lead.brand || labels.product.toLowerCase();
    const locationLabel = lead.location || labels.location.toLowerCase();
    if (lead.contactStatus === "CHUA_LIEN_HE") {
      return `Gợi ý: Khách hàng mới chưa liên hệ. Hãy gọi điện ngay trong khung giờ vàng để tăng tỷ lệ kết nối.
Mẫu tin nhắn Zalo gửi trước:
"Chào anh/chị ${lead.name || ""}, em là tư vấn viên từ SEMTOP. Em thấy anh/chị đang quan tâm đến ${itemLabel} bên em. Em xin phép liên hệ hỗ trợ gửi thông tin và báo giá chi tiết ạ."`;
    }
    if (lead.category === "CHUA_LH_DUOC") {
      return `Gợi ý: Đã thử liên hệ nhưng chưa gặp khách. Hãy gửi tin nhắn Zalo/SMS hẹn khung giờ thuận tiện:
"Chào anh/chị ${lead.name || ""}, em gọi hỗ trợ thông tin về ${itemLabel} nhưng chưa gặp được anh/chị. Em xin phép gửi thông tin ưu đãi qua Zalo, anh/chị tiện vào khung giờ nào nhắn lại giúp em nhé!"`;
    }
    if (lead.category === "KHQT" || lead.category === "GDTD") {
      return `Gợi ý: Khách hàng đang có nhu cầu cao. Hãy gửi bảng chi phí chi tiết hoặc mời trải nghiệm trực tiếp:
"Chào anh/chị ${lead.name || ""}, bên em đang có chính sách ưu đãi đặc biệt cho ${itemLabel} trong tuần này. Anh/chị có thể ghé ${locationLabel} vào sáng hay chiều để em hỗ trợ tư vấn trực tiếp cho mình ạ?"`;
    }
    return `Gợi ý: Cập nhật nhu cầu và hẹn lịch chăm sóc định kỳ hoặc gửi thông tin ưu đãi mới.`;
  }

  // polish_note
  const raw = draftNote?.trim() || "";
  if (!raw) return "Khách hàng trao đổi thông tin nhu cầu, hẹn trao đổi thêm.";
  return `Ghi chú chuẩn hóa: Khách hàng trao đổi về nhu cầu (${raw}). Đã cập nhật trạng thái và lưu lịch theo dõi.`;
}

export async function POST(request: Request) {
  const viewer = await getScopedViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canUseAi(viewer)) {
    return NextResponse.json({ error: "Tài khoản này chưa được bật tính năng AI." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
  }

  const { leadId, action, draftNote } = parsed.data;
  const lead = await getLeadById(leadId, viewer);
  if (!lead) {
    return NextResponse.json({ error: "Không tìm thấy lead hoặc bạn không có quyền xem." }, { status: 404 });
  }

  const [logs, reference] = await Promise.all([
    getActivityLogs(leadId),
    getReferenceData(viewer.activeProjectId ?? undefined).catch(() => null),
  ]);
  const labels = reference?.labels ?? DEFAULT_CATALOG_LABELS;
  const resolved = resolveModel();

  if (!resolved) {
    const text = fallbackCopilot(action, lead, logs, labels, draftNote);
    return NextResponse.json({ result: text, mode: "fallback" });
  }

  const recentLogsText = logs
    .slice(0, 8)
    .map((l) => `- [${l.at.slice(0, 10)}] ${l.actor}: ${l.message}`)
    .join("\n");

  const leadContext = `
Hồ sơ Lead:
- Tên: ${lead.name || "Chưa có"} | SĐT: ${lead.phone}
- Phân loại: ${lead.category} | Trạng thái: ${lead.contactStatus}
- ${labels.brand} / ${labels.product}: ${lead.brand || ""} - ${lead.product || "Chưa chọn"}
- ${labels.location}: ${lead.location || "Chưa chọn"}
- Người phụ trách: ${lead.assignee || "Chưa giao"}
- Ghi chú hiện tại: ${lead.careNote || "Không có"}
- Số lần liên hệ: ${lead.contactCount} | Lần liên hệ gần nhất: ${lead.lastContactAt || "Chưa có"}
- Hẹn gọi lại: ${lead.callbackAt || "Không có"}
${lead.attrs && Object.keys(lead.attrs).length ? `- Thuộc tính bổ sung: ${JSON.stringify(lead.attrs)}` : ""}

Lịch sử hoạt động gần đây:
${recentLogsText || "Chưa có nhật ký hoạt động"}
`;

  let prompt = "";
  if (action === "summarize") {
    prompt = `Bạn là trợ lý AI chuyên nghiệp của SEMTOP CRM. Hãy đọc thông tin và tóm tắt ngắn gọn hồ sơ khách hàng này trong 2-3 gạch đầu dòng súc tích, làm nổi bật:
1. Nhu cầu cốt lõi và sản phẩm quan tâm.
2. Diễn biến và trạng thái chăm sóc hiện tại.
3. Việc cần làm tiếp theo hoặc lưu ý quan trọng.
Chỉ trả lời tiếng Việt, ngắn gọn, đi thẳng vào ý.`;
  } else if (action === "suggest_action") {
    prompt = `Bạn là chuyên gia tư vấn bán hàng của SEMTOP CRM. Dựa vào hồ sơ khách hàng này, hãy đưa ra:
1. Gợi ý hành động tiếp theo hiệu quả nhất (Next Best Action).
2. Một mẫu tin nhắn Zalo/SMS chuyên nghiệp hoặc lời mở đầu cuộc gọi phù hợp với ngữ cảnh hiện tại để nhân viên kinh doanh có thể copy gửi ngay.
Không dài dòng, trả lời thực tế, lịch sự, đúng trọng tâm.`;
  } else {
    prompt = `Bạn là trợ lý CRM. Hãy chuẩn hóa ghi chú chăm sóc khách hàng sau đây thành một đoạn ghi chú chuyên nghiệp, rõ ràng và đầy đủ ý tứ để lưu vào hồ sơ CRM:
"${draftNote || ""}"
Chỉ trả lời nội dung ghi chú đã được chuẩn hóa, không thêm lời chào hay giải thích.`;
  }

  try {
    const result = await generateText({
      model: resolved.model,
      system: leadContext,
      prompt,
      temperature: 0.2,
    });
    return NextResponse.json({ result: result.text.trim(), mode: "ai" });
  } catch {
    const text = fallbackCopilot(action, lead, logs, labels, draftNote);
    return NextResponse.json({
      result: `${text}\n\n(Lưu ý: Không gọi được mô hình AI thật, đây là phản hồi tự động dự phòng.)`,
      mode: "fallback",
    });
  }
}

# Thiết kế nâng cấp Trợ lý AI & AI Lead Copilot (2026-09-30)

## Mục tiêu
Nâng cấp toàn diện luồng AI của SEMTOP Marketing CRM:
1. **Khắc phục lỗi nền tảng & cô lập đa dự án (Multi-project Isolation)**: Đảm bảo dữ liệu Marketing Ads và tìm kiếm @mentions luôn bị giới hạn trong `activeProjectId` và quyền fanpage của người dùng.
2. **Loại bỏ hardcode Brand**: Hỗ trợ nhận diện thương hiệu động từ cơ sở dữ liệu (thay vì cố định KIA/MAZDA/PEUGEOT/BMW).
3. **Tích hợp Dynamic Attr Fields**: Đưa trường mở rộng theo project vào AI Catalog, cho phép AI hiểu và xuất file kèm các trường động (`leads.attrs`).
4. **Hội thoại đa lượt (Multi-turn Context) & Thống kê sâu**: Duy trì spec/stats gần nhất để xử lý các câu yêu cầu tiếp nối ("chỉ lấy ở Hà Nội", "thêm cột SĐT"). Bổ sung tỷ lệ chuyển đổi (`% liên hệ`, `% KHQT`, `% rớt`) trong kết quả thống kê.
5. **Giao diện Chat trực quan**: Hiển thị mini breakdown visualization (thanh tỷ lệ trực quan), các chip gợi ý câu hỏi tiếp theo (Follow-up suggestions), và mở rộng menu `@mention` thêm `@product`, `@brand`, `@location`.
6. **AI Lead Copilot trong chi tiết Lead (`LeadDetailDialog`)**: Hỗ trợ 3 tính năng trợ lực cho nhân viên: Tóm tắt lịch sử chăm sóc, Gợi ý kịch bản phản hồi (Next Best Action), và Chuẩn hóa ghi chú chăm sóc nhanh (ghi nhận log `byAi: true`).

## 1. Kiến trúc & Phân quyền (RBAC)
- Tiếp tục tuân thủ nghiêm ngặt `src/lib/auth/roles.ts` và `docs/permissions.md`:
  - `canUseAi(viewer)`: Super admin luôn dùng được; Partner admin chỉ dùng khi `aiEnabled = true`; Staff không có quyền.
  - Mọi endpoint AI (`/api/ai/chat`, `/api/ai/mentions`, `/api/ai/lead-copilot`) đều phải kiểm tra quyền qua `getScopedViewer()` và `canUseAi(viewer)`.
  - Phân quyền dữ liệu: Lọc qua `isPageVisible` và `isMarketingRowVisible` hoặc giao thoa tập page: `allowedPages = pageIdsInScope(viewer, activeProjectId)`.
  - Bổ sung kiểm tra quyền nếu có hàm mới và cập nhật `roles.ts` / `roles.test.ts`.

## 2. Multi-project Isolation & Dynamic Brands
- **Fanpage & Ads Scope**:
  - Khi truy vấn `marketingSection` trong `answer-stats.ts`:
    - Lấy danh sách fanpage của project đang xem (`activeProjectId`).
    - Nếu viewer là Partner admin: Lọc các page thuộc `viewer.pageIds ∩ projectPageIds`.
    - Nếu viewer là Super admin: Nếu có `activeProjectId`, giới hạn trong các page của project đó (chỉ xem all khi không chọn project nào).
  - Tương tự trong `src/lib/ai/mention-search.ts`: Các hàm tìm campaign, ads, lead, staff phải tôn trọng `activeProjectId`.
- **Dynamic Brand Matching**:
  - `insights-repo.ts`: Thay vì enum cứng `"KIA" | "MAZDA" | "PEUGEOT" | "BMW"`, hàm `queryMarketingSnapshot` nhận `brands?: string[]`.
  - Đối chiếu tên campaign theo regex case-insensitive từ danh sách mã/tên brand trong database (`catalog.brands`).

## 3. Dynamic Attr Fields trong AI
- `AiCatalog`: Bổ sung `attrFields: { key: string; label: string; fieldType: string; options: string[] }[]`.
- `buildSystemPrompt`: Liệt kê các trường mở rộng của project để LLM nắm được.
- `exportSpecSchema`: Cho phép cột xuất (`columns`) chứa cả các trường động `attr:<key>` bên cạnh `LEAD_COLUMNS`.
- `downloadExport` & `queryLeads`: Đọc giá trị từ `lead.attrs[key]` để ghi vào file Excel/CSV.

## 4. Multi-turn Context & Breakdown nâng cao
- Trả về `lastQuery` / `spec` trong response và client gửi kèm state gần nhất trong request body.
- Trong `answer-stats.ts`: Bổ sung tính toán tỷ lệ chuyển đổi cho từng dòng breakdown:
  - Tỷ lệ liên hệ = `contacted / leads`
  - Tỷ lệ KHQT = `khqt / (contacted || leads)`
  - Tỷ lệ loại = `failed / leads`
  - Format văn bản chỉn chu và sinh kèm cấu trúc dữ liệu `breakdownData` phục vụ UI render chart.

## 5. Cải tiến giao diện AI Chat Panel
- **Mini Breakdown Widget**: Render visual cards / bars cho dữ liệu nhóm (`groupBy`).
- **Follow-up Suggestions**: Sau câu trả lời, trả về danh sách 2-3 gợi ý hành động tiếp theo (ví dụ: *"So sánh với tháng trước"*, *"Xem chi tiết theo nhân viên"*, *"Xuất danh sách ra Excel"*).
- **Mở rộng @mention**: Bổ sung `product`, `brand`, `location`.

## 6. AI Lead Copilot trong LeadDetailDialog
- Endpoint `/api/ai/lead-copilot`:
  - `action: "summarize"`: Đọc thông tin lead và danh sách `activity_logs` -> Trả về tóm tắt 2-3 gạch đầu dòng.
  - `action: "suggest_action"`: Đưa ra gợi ý bước chăm sóc tiếp theo và mẫu tin nhắn/cuộc gọi phù hợp.
  - `action: "polish_note"`: Nhận ghi chú thô của nhân viên -> Định dạng thành nội dung chăm sóc chuyên nghiệp. Khi lưu, tạo dòng `activity_logs` với `byAi: true`.

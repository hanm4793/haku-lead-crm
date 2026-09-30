# Báo cáo — việc còn lại

Sau đợt sửa logic màn Báo cáo (bỏ tab Loss, chỉnh KPI / call list / pivot). Các mục dưới **chưa làm**, giữ để làm sau.

## Nghiệp vụ / product

1. **Chuẩn hóa phễu chuyển đổi** — bắt buộc `DA_LIEN_HE` trước khi gắn KHQT+, hoặc tách 2 phễu (liên hệ vs phân loại). Hiện chỉ ghi chú trên UI.
2. **True column pivot** — “Chi tiết theo” vẫn là hàng con lồng nhau, chưa phải cột ngang kiểu Excel.
3. **Nối Marketing ↔ CRM** — CPL/spend theo page-campaign đối chiếu outcome (KHQT/KHD/FAIL) khi data đã gắn đủ.
4. **Tab / widget “Lead bị loại”** — chỉ mở lại khi `fail_reason` fill-rate đủ (governance sale).
5. **Giảm trùng Tổng quan ↔ Pivot** — chart nguồn/model có thể thu gọn nếu Pivot là nơi đào sâu chính.

## Kỹ thuật

6. **Call list phân trang / “xem thêm”** — hiện hard-limit 25.
7. **Fanpage trên pivot client** — `dimensionValue(facebookPage)` chỉ hiện page id (SQL đã dùng tên page).
8. **Export mọi chiều** — hiện precompute groupBy + source/facebookPage/category/product; assignee/campaign/… chưa luôn có sheet riêng.
9. **KPI “chưa phân loại”** — chưa thêm card riêng (có thể lấy từ distribution).
10. **Timezone call list “hôm nay”** — `dueTodaySql` theo giờ máy/server `now`; chưa khóa Asia/Ho_Chi_Minh như daily series.

## Data / vận hành

11. Lead Meta thiếu brand/product/assignee — chart “dòng xe hút khách” và vài chiều pivot vẫn nông cho đến khi sale gán tay (hoặc map từ tên campaign sau này).

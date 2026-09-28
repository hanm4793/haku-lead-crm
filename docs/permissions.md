# Phân quyền

Ba vai trò: **Super admin**, **Partner admin**, **Nhân viên**.

Quyền nằm ở `src/lib/auth/roles.ts`. Menu, trang, API và server action phải gọi các hàm đó. Test khóa từng ô ở `src/lib/auth/roles.test.ts`.

Super admin bỏ qua danh sách fanpage. Partner admin dùng fanpage được gán cho chính mình. Nhân viên dùng fanpage của partner. Danh sách grant rỗng nghĩa là không thấy lead, báo cáo hay ads nào.

## Menu

| Hạng mục | Super admin | Partner admin | Nhân viên |
| --- | --- | --- | --- |
| Lead | Có | Có | Có |
| Báo cáo | Có | Có | Không, chuyển về Lead. API trả 403 |
| Marketing | Có | Có | Không, chuyển về Lead |
| Tài khoản | Có | Có. Chỉ nhân viên của mình | Không, chuyển về Lead |
| Cài đặt và đồng bộ Facebook | Có | Không | Không |
| Đổi mật khẩu khi đã đăng nhập | Có | Có | Có |

## Dữ liệu

| Hạng mục | Super admin | Partner admin | Nhân viên |
| --- | --- | --- | --- |
| Xem lead | Mọi fanpage | Fanpage được gán | Fanpage của partner |
| Không có grant | Vẫn thấy hết | Không thấy lead | Không thấy lead |
| Sửa lead, ghi chú, nhật ký | Mọi lead đang xem | Mọi lead đang xem | Chỉ lead được giao cho mình |
| Lead chưa giao | Sửa được | Sửa được | Chỉ xem |
| Bộ lọc fanpage trên Lead và Báo cáo | Mọi fanpage đang bật | Fanpage được gán | Fanpage của partner |
| Số liệu báo cáo | Mọi fanpage | Cùng phạm vi lead | Không vào màn |
| Ads và chiến dịch marketing | Mọi dòng, kể cả dòng chưa gắn page | Chỉ ad có page được gán. Chiến dịch lấy từ các ad đó | Không vào màn |
| Người được giao lead | Mọi nhân viên đang hoạt động | Nhân viên cùng partner | Nhân viên cùng partner |

## Tài khoản

| Hạng mục | Super admin | Partner admin | Nhân viên |
| --- | --- | --- | --- |
| Tạo partner admin | Có. Gán fanpage và cờ AI | Không | Không |
| Tạo nhân viên | Có. Bắt buộc chọn partner. Không grant riêng | Có. Gắn vào mình. Tắt AI. Không grant riêng | Không |
| Tạo super admin từ màn Tài khoản | Không | Không | Không |
| Sửa tài khoản | Mọi tài khoản | Chỉ nhân viên của mình. Không đổi role, AI, grant | Không |
| Gửi email đặt mật khẩu | Mọi tài khoản có email | Chỉ nhân viên của mình | Không |
| Tự vô hiệu hóa hoặc tự hạ quyền | Không | Không | Không |
| Super admin đang hoạt động cuối cùng | Không được tắt hoặc hạ | — | — |

## Trợ lý AI

| Hạng mục | Super admin | Partner admin | Nhân viên |
| --- | --- | --- | --- |
| Mở trợ lý và gọi `/api/ai/chat`, `/api/ai/mentions` | Luôn bật | Chỉ khi super admin bật cờ AI | Không. API trả 403 |
| Số liệu AI đọc | Mọi fanpage | Fanpage được gán. Hết grant thì không có số | Không gọi được |

Lead CRM và số lead trên ads là hai tập khác nhau. Câu trả lời AI phải giữ đúng phạm vi fanpage của người hỏi.

## Ngoài bảng

- Chưa cấu hình Supabase Auth thì app chạy demo với quyền super admin.
- Email nằm trong `ADMIN_EMAILS` được nâng super admin ở lần đăng nhập.
- Đăng ký công khai tạo nhân viên chưa có partner, nên không thấy lead cho đến khi được gán.
- Tài khoản bị tắt thì bị đăng xuất.

## Tính năng mới

Một tính năng chưa xong nếu mới hiện trên UI mà chưa gắn quyền. Làm đủ các bước sau:

1. Thêm hoặc dùng lại một hàm trong `src/lib/auth/roles.ts`. Không so sánh `role` rải trong component.
2. Chặn ở server: page, route handler, server action. Ẩn menu chỉ là lớp hiển thị.
3. Dữ liệu lead, báo cáo, marketing và AI đi qua `dataScope` / `isPageVisible`. Không nhận danh sách fanpage từ client.
4. Thêm một dòng vào bảng trong file này.
5. Thêm một case vào `src/lib/auth/roles.test.ts` cho đúng dòng đó.

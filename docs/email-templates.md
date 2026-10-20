# Mẫu Email & Cấu hình URL trên Supabase Auth

Hệ thống sử dụng **Supabase Auth (`nvopyhmwdlzgbadcjjid.supabase.co`)** để gửi 2 luồng email tự động:
1. **Mời tạo tài khoản & đặt mật khẩu lần đầu (`Invite user`)**: Kích hoạt khi Admin tạo tài khoản mới hoặc bấm **"Gửi lại email đặt mật khẩu"** ở màn `/users` (qua [`sendPasswordSetupEmail`](../src/lib/auth/password-mail.ts)).
2. **Đặt lại mật khẩu (`Reset password`)**: Kích hoạt khi tài khoản đã tồn tại bấm **"Quên mật khẩu?"** ở màn `/login` hoặc Admin gửi lại link đặt mật khẩu ở màn `/users`.

---

## Bước 1: Đổi Site URL về Production trên Supabase Dashboard

Mặc định lúc khởi tạo qua Vercel Marketplace, `Site URL` trên Supabase đang trỏ về link preview cũ (`https://haku-lead-9531jvxrv-haku-dev.vercel.app`). Cần đổi về tên miền chính thức:

1. Mở [Supabase Dashboard — URL Configuration](https://supabase.com/dashboard/project/nvopyhmwdlzgbadcjjid/auth/url-configuration) (hoặc từ Vercel → tab **Storage / Integrations** → chọn **Supabase** → **Open in Supabase** → **Authentication** → **URL Configuration**).
2. **Site URL**: Đổi thành:
   ```text
   https://crm.semtop.vn
   ```
3. **Redirect URLs**: Bấm **Add URL** và thêm:
   ```text
   https://crm.semtop.vn/**
   ```
4. Bấm **Save**.

---

## Bước 2: Cập nhật Email Template Tiếng Việt (Trỏ thẳng về `https://crm.semtop.vn`)

Mở [Supabase Dashboard — Email Templates](https://supabase.com/dashboard/project/nvopyhmwdlzgbadcjjid/auth/templates) (**Authentication** → **Email Templates**):

> **Ưu điểm của template bên dưới**: Sử dụng trực tiếp `https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&type=...` (đã được [`ResetPasswordForm`](../src/components/auth/reset-password-form.tsx) và [`readResetLink`](../src/lib/auth/reset-link.ts) hỗ trợ). Khi người dùng bấm nút trong email, trình duyệt sẽ **mở thẳng `https://crm.semtop.vn/login/reset`**, không bao giờ bị nhảy sang link dev `.vercel.app` và không bị lỗi hết hạn sớm khi mở khác trình duyệt/thiết bị.

### 1. Tab **"Invite user"** (Thư mời cấp tài khoản mới)

- **Subject heading (Tiêu đề thư)**:
  ```text
  [SEMTOP CRM] Mời bạn kích hoạt tài khoản & đặt mật khẩu đăng nhập
  ```

- **Message body (Nội dung HTML — chọn tab Source)**`:
  ```html
  <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 32px 16px; color: #0f172a;">
    <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);">
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px 28px; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9;">
          SEMTOP Marketing CRM
        </div>
        <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 700;">
          Kích hoạt tài khoản của bạn
        </h1>
      </div>

      <div style="padding: 28px; font-size: 14px; line-height: 1.6; color: #334155;">
        <p style="margin: 0 0 14px;">
          Xin chào <strong>{{ if .Data.full_name }}{{ .Data.full_name }}{{ else }}{{ .Email }}{{ end }}</strong>,
        </p>
        <p style="margin: 0 0 16px;">
          Quản trị viên đã tạo cho bạn một tài khoản trên hệ thống <strong>SEMTOP Marketing CRM</strong> với địa chỉ email <strong>{{ .Email }}</strong>.
        </p>
        <p style="margin: 0 0 24px;">
          Vui lòng nhấn vào nút bên dưới để thiết lập mật khẩu và bắt đầu sử dụng hệ thống:
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a
            href="https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&type=invite"
            style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px;"
          >
            Thiết lập mật khẩu &amp; Đăng nhập
          </a>
        </div>

        <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">
          Nếu nút trên không hoạt động, hãy sao chép đường dẫn sau và dán vào trình duyệt:
        </p>
        <p style="margin: 0 0 20px; font-size: 12px; word-break: break-all; color: #2563eb;">
          https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&amp;type=invite
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
          Email này được gửi tự động từ hệ thống SEMTOP Marketing CRM (<a href="https://crm.semtop.vn" style="color: #64748b;">crm.semtop.vn</a>).
        </p>
      </div>
    </div>
  </div>
  ```

---

### 2. Tab **"Reset password"** (Thư đặt lại mật khẩu)

- **Subject heading (Tiêu đề thư)**:
  ```text
  [SEMTOP CRM] Yêu cầu đặt lại mật khẩu đăng nhập
  ```

- **Message body (Nội dung HTML — chọn tab Source)**:
  ```html
  <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 32px 16px; color: #0f172a;">
    <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);">
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px 28px; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9;">
          SEMTOP Marketing CRM
        </div>
        <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 700;">
          Đặt lại mật khẩu đăng nhập
        </h1>
      </div>

      <div style="padding: 28px; font-size: 14px; line-height: 1.6; color: #334155;">
        <p style="margin: 0 0 14px;">
          Xin chào <strong>{{ if .Data.full_name }}{{ .Data.full_name }}{{ else }}{{ .Email }}{{ end }}</strong>,
        </p>
        <p style="margin: 0 0 16px;">
          Hệ thống <strong>SEMTOP Marketing CRM</strong> nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>{{ .Email }}</strong>.
        </p>
        <p style="margin: 0 0 24px;">
          Nhấn vào nút bên dưới để tạo mật khẩu mới:
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a
            href="https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&type=recovery"
            style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px;"
          >
            Đặt mật khẩu mới
          </a>
        </div>

        <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">
          Nếu nút trên không hoạt động, hãy sao chép đường dẫn sau và dán vào trình duyệt:
        </p>
        <p style="margin: 0 0 20px; font-size: 12px; word-break: break-all; color: #2563eb;">
          https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&amp;type=recovery
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
          Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Hệ thống SEMTOP Marketing CRM (<a href="https://crm.semtop.vn" style="color: #64748b;">crm.semtop.vn</a>).
        </p>
      </div>
    </div>
  </div>
  ```

# Mẫu Email & Cấu hình URL trên Supabase Auth

Hệ thống sử dụng **Supabase Auth (`nvopyhmwdlzgbadcjjid.supabase.co`)** kết hợp **Custom SMTP (`crm@semtop.vn`)** để gửi 2 luồng email tự động:
1. **Mời tạo tài khoản & đặt mật khẩu lần đầu (`Invite user`)**: Kích hoạt khi Admin tạo tài khoản mới hoặc bấm **"Gửi lại email đặt mật khẩu"** ở màn `/users` (qua [`sendPasswordSetupEmail`](../src/lib/auth/password-mail.ts)).
2. **Đặt lại mật khẩu (`Reset password`)**: Kích hoạt khi tài khoản đã tồn tại bấm **"Quên mật khẩu?"** ở màn `/login` hoặc Admin gửi lại link đặt mật khẩu ở màn `/users`.

---

## Thông số nhận diện & Footer Responsive (Fluid-Hybrid) chuẩn Website `semtop.vn`
- **Logo chính thức**: `https://crm.semtop.vn/brand/logo-white.png`
- **Đơn vị chủ quản**: Công ty cổ phần truyền thông SEMTOP
- **Địa chỉ**: Tầng 14 - Intracom 2, 33 Cầu Diễn - Bắc Từ Liêm, Hà Nội
- **Hotline**: `0938 859 555`
- **Email liên hệ**: `hoitv@semtop.vn`
- **Website**: `https://semtop.vn/` (`Facebook`, `Zalo`, `TikTok`)

---

## 1. Mẫu **"Invite user"** (Thư mời cấp tài khoản mới)

- **Subject heading**:
  ```text
  [SEMTOP CRM] Kích hoạt tài khoản đăng nhập
  ```

- **Message body (HTML)**:
  ```html
<div style="margin: 0; padding: 16px 10px; background-color: #f3f5f9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0c1222; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #dfe5ef; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(16, 42, 107, 0.06);">
    <!-- Top Brand Accent Bar (SEMTOP Blue + SEMTOP Red) -->
    <tr>
      <td style="padding: 0; height: 5px; background: linear-gradient(90deg, #1a4db8 0%, #1a4db8 62%, #e11d2e 62%, #e11d2e 100%); background-color: #1a4db8; font-size: 0; line-height: 0;">&nbsp;</td>
    </tr>

    <!-- Clean White Brand Header -->
    <tr>
      <td style="padding: 18px 24px 16px; background-color: #ffffff; border-bottom: 1px solid #eef1f6;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" valign="middle">
              <a href="https://crm.semtop.vn" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP" width="142" style="display: block; height: auto; width: 142px; border: 0;" />
              </a>
            </td>
            <td align="right" valign="middle">
              <span style="display: inline-block; background-color: #e8eef9; color: #143a8c; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 5px 10px; border-radius: 999px; border: 1px solid #d5e2f9; white-space: nowrap;">
                CRM System
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Deep Navy Hero Banner (#102a6b) -->
    <tr>
      <td style="padding: 20px 24px; background-color: #102a6b; background-image: linear-gradient(135deg, #102a6b 0%, #1a4db8 100%); color: #ffffff;">
        <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #93c5fd; margin-bottom: 4px;">
          SEMTOP MARKETING CRM
        </div>
        <h1 style="margin: 0; font-size: 19px; font-weight: 700; line-height: 1.35; color: #ffffff;">
          Kích hoạt tài khoản &amp; Đặt mật khẩu
        </h1>
      </td>
    </tr>

    <!-- Main Content Body -->
    <tr>
      <td style="padding: 24px; font-size: 14px; line-height: 1.6; color: #1e293b;">
        <p style="margin: 0 0 12px; font-size: 15px; color: #0c1222;">
          Xin chào <strong>{{ if .Data.full_name }}{{ .Data.full_name }}{{ else }}{{ .Email }}{{ end }}</strong>,
        </p>
        <p style="margin: 0 0 18px; color: #334155;">
          Quản trị viên đã khởi tạo tài khoản cho bạn trên hệ thống <strong>SEMTOP Marketing CRM</strong>.
        </p>

        <!-- Account Info Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 22px; background-color: #f3f5f9; border-left: 4px solid #1a4db8; border-radius: 8px;">
          <tr>
            <td style="padding: 12px 16px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6b84; margin-bottom: 4px;">
                Thông tin tài khoản
              </div>
              <div style="font-size: 13px; color: #0c1222; word-break: break-all; margin-bottom: 2px;">
                Tài khoản: <strong style="color: #1a4db8;">{{ .Email }}</strong>
              </div>
              <div style="font-size: 12px; color: #5b6b84;">
                Hệ thống: <a href="https://crm.semtop.vn" style="color: #1a4db8; text-decoration: none; font-weight: 600;">crm.semtop.vn</a>
              </div>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 20px; color: #334155;">
          Nhấn vào nút bên dưới để thiết lập mật khẩu và bắt đầu làm việc:
        </p>

        <!-- Mobile-friendly CTA Button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px;">
          <tr>
            <td align="center">
              <a
                href="https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&type=invite"
                target="_blank"
                style="display: block; max-width: 260px; margin: 0 auto; background-color: #1a4db8; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 20px; border-radius: 8px; border-bottom: 3px solid #102a6b; text-align: center;"
              >
                Thiết lập mật khẩu &rarr;
              </a>
            </td>
          </tr>
        </table>

        <!-- Compact Fallback Link Box -->
        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 12px;">
          <div style="font-size: 11px; color: #5b6b84; margin-bottom: 4px;">
            Hoặc mở trực tiếp đường dẫn sau trên trình duyệt:
          </div>
          <div style="font-size: 11px; line-height: 1.4; word-break: break-all; color: #1a4db8; font-family: Consolas, Monaco, monospace;">
            https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&amp;type=invite
          </div>
        </div>
      </td>
    </tr>

    <!-- Responsive Fluid-Hybrid SEMTOP Footer (Stacks on Mobile, 2 Columns on Desktop) -->
    <tr>
      <td style="padding: 22px 24px 18px; background-color: #ffffff; border-top: 2px solid #e11d2e; font-size: 0; text-align: left;">
        <!--[if mso]>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="210" valign="top">
        <![endif]-->
        <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 205px; font-size: 12px; padding-bottom: 14px;">
          <a href="https://semtop.vn/" target="_blank" style="text-decoration: none; display: inline-block; margin-bottom: 12px;">
            <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP" width="132" style="display: block; height: auto; width: 132px; border: 0;" />
          </a>
          <div style="white-space: nowrap;">
            <a href="https://www.facebook.com/profile.php?id=61574693681120" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 5px 10px; border-radius: 4px; margin-right: 4px;">Facebook</a>
            <a href="https://zalo.me/0938859555" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 5px 10px; border-radius: 4px; margin-right: 4px;">Zalo</a>
            <a href="https://www.tiktok.com/@semtop38" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 5px 10px; border-radius: 4px;">TikTok</a>
          </div>
        </div>
        <!--[if mso]>
        </td><td width="302" valign="top">
        <![endif]-->
        <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 305px; font-size: 12px; line-height: 1.6; color: #334155; padding-bottom: 6px;">
          <div style="font-size: 13px; font-weight: 700; color: #0c1222; margin-bottom: 4px;">
            Công ty cổ phần truyền thông SEMTOP
          </div>
          <div style="color: #475569; margin-bottom: 6px;">
            Tầng 14 - Intracom 2, 33 Cầu Diễn - Bắc Từ Liêm, Hà Nội
          </div>
          <div style="margin-bottom: 2px;">
            Hotline: <a href="tel:0938859555" style="color: #0c1222; font-weight: 700; text-decoration: none;">0938 859 555</a>
            &nbsp;&bull;&nbsp;
            Email: <a href="mailto:hoitv@semtop.vn" style="color: #0c1222; text-decoration: underline;">hoitv@semtop.vn</a>
          </div>
          <div>
            Website: <a href="https://semtop.vn/" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">semtop.vn</a>
            &nbsp;|&nbsp;
            CRM: <a href="https://crm.semtop.vn" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">crm.semtop.vn</a>
          </div>
        </div>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</div>
  ```

---

## 2. Mẫu **"Reset password"** (Thư đặt lại mật khẩu)

- **Subject heading**:
  ```text
  [SEMTOP CRM] Đặt lại mật khẩu của bạn
  ```

- **Message body (HTML)**:
  ```html
<div style="margin: 0; padding: 16px 10px; background-color: #f3f5f9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0c1222; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #dfe5ef; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(16, 42, 107, 0.06);">
    <!-- Top Brand Accent Bar (SEMTOP Blue + SEMTOP Red) -->
    <tr>
      <td style="padding: 0; height: 5px; background: linear-gradient(90deg, #1a4db8 0%, #1a4db8 62%, #e11d2e 62%, #e11d2e 100%); background-color: #1a4db8; font-size: 0; line-height: 0;">&nbsp;</td>
    </tr>

    <!-- Clean White Brand Header -->
    <tr>
      <td style="padding: 18px 24px 16px; background-color: #ffffff; border-bottom: 1px solid #eef1f6;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" valign="middle">
              <a href="https://crm.semtop.vn" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP" width="142" style="display: block; height: auto; width: 142px; border: 0;" />
              </a>
            </td>
            <td align="right" valign="middle">
              <span style="display: inline-block; background-color: #e8eef9; color: #143a8c; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 5px 10px; border-radius: 999px; border: 1px solid #d5e2f9; white-space: nowrap;">
                CRM System
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Deep Navy Hero Banner (#102a6b) -->
    <tr>
      <td style="padding: 20px 24px; background-color: #102a6b; background-image: linear-gradient(135deg, #102a6b 0%, #1a4db8 100%); color: #ffffff;">
        <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #93c5fd; margin-bottom: 4px;">
          BẢO MẬT &amp; KHÔI PHỤC TÀI KHOẢN
        </div>
        <h1 style="margin: 0; font-size: 19px; font-weight: 700; line-height: 1.35; color: #ffffff;">
          Đặt lại mật khẩu đăng nhập
        </h1>
      </td>
    </tr>

    <!-- Main Content Body -->
    <tr>
      <td style="padding: 24px; font-size: 14px; line-height: 1.6; color: #1e293b;">
        <p style="margin: 0 0 12px; font-size: 15px; color: #0c1222;">
          Xin chào <strong>{{ if .Data.full_name }}{{ .Data.full_name }}{{ else }}{{ .Email }}{{ end }}</strong>,
        </p>
        <p style="margin: 0 0 18px; color: #334155;">
          Hệ thống <strong>SEMTOP Marketing CRM</strong> nhận được yêu cầu cấp lại mật khẩu mới cho tài khoản của bạn.
        </p>

        <!-- Account Info Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 22px; background-color: #f3f5f9; border-left: 4px solid #e11d2e; border-radius: 8px;">
          <tr>
            <td style="padding: 12px 16px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6b84; margin-bottom: 4px;">
                Tài khoản khôi phục
              </div>
              <div style="font-size: 13px; color: #0c1222; word-break: break-all; margin-bottom: 2px;">
                Tài khoản: <strong style="color: #1a4db8;">{{ .Email }}</strong>
              </div>
              <div style="font-size: 12px; color: #5b6b84;">
                Hệ thống: <a href="https://crm.semtop.vn" style="color: #1a4db8; text-decoration: none; font-weight: 600;">crm.semtop.vn</a>
              </div>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 20px; color: #334155;">
          Nhấn vào nút bên dưới để tạo mật khẩu mới (liên kết chỉ sử dụng 1 lần):
        </p>

        <!-- Mobile-friendly CTA Button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px;">
          <tr>
            <td align="center">
              <a
                href="https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&type=recovery"
                target="_blank"
                style="display: block; max-width: 260px; margin: 0 auto; background-color: #1a4db8; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 20px; border-radius: 8px; border-bottom: 3px solid #102a6b; text-align: center;"
              >
                Đặt mật khẩu mới &rarr;
              </a>
            </td>
          </tr>
        </table>

        <!-- Compact Fallback Link Box -->
        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px;">
          <div style="font-size: 11px; color: #5b6b84; margin-bottom: 4px;">
            Hoặc mở trực tiếp đường dẫn sau trên trình duyệt:
          </div>
          <div style="font-size: 11px; line-height: 1.4; word-break: break-all; color: #1a4db8; font-family: Consolas, Monaco, monospace;">
            https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&amp;type=recovery
          </div>
        </div>

        <p style="margin: 0; font-size: 12px; color: #64748b;">
          * Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
        </p>
      </td>
    </tr>

    <!-- Responsive Fluid-Hybrid SEMTOP Footer (Stacks on Mobile, 2 Columns on Desktop) -->
    <tr>
      <td style="padding: 22px 24px 18px; background-color: #ffffff; border-top: 2px solid #e11d2e; font-size: 0; text-align: left;">
        <!--[if mso]>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="210" valign="top">
        <![endif]-->
        <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 205px; font-size: 12px; padding-bottom: 14px;">
          <a href="https://semtop.vn/" target="_blank" style="text-decoration: none; display: inline-block; margin-bottom: 12px;">
            <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP" width="132" style="display: block; height: auto; width: 132px; border: 0;" />
          </a>
          <div style="white-space: nowrap;">
            <a href="https://www.facebook.com/profile.php?id=61574693681120" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 5px 10px; border-radius: 4px; margin-right: 4px;">Facebook</a>
            <a href="https://zalo.me/0938859555" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 5px 10px; border-radius: 4px; margin-right: 4px;">Zalo</a>
            <a href="https://www.tiktok.com/@semtop38" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 5px 10px; border-radius: 4px;">TikTok</a>
          </div>
        </div>
        <!--[if mso]>
        </td><td width="302" valign="top">
        <![endif]-->
        <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 305px; font-size: 12px; line-height: 1.6; color: #334155; padding-bottom: 6px;">
          <div style="font-size: 13px; font-weight: 700; color: #0c1222; margin-bottom: 4px;">
            Công ty cổ phần truyền thông SEMTOP
          </div>
          <div style="color: #475569; margin-bottom: 6px;">
            Tầng 14 - Intracom 2, 33 Cầu Diễn - Bắc Từ Liêm, Hà Nội
          </div>
          <div style="margin-bottom: 2px;">
            Hotline: <a href="tel:0938859555" style="color: #0c1222; font-weight: 700; text-decoration: none;">0938 859 555</a>
            &nbsp;&bull;&nbsp;
            Email: <a href="mailto:hoitv@semtop.vn" style="color: #0c1222; text-decoration: underline;">hoitv@semtop.vn</a>
          </div>
          <div>
            Website: <a href="https://semtop.vn/" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">semtop.vn</a>
            &nbsp;|&nbsp;
            CRM: <a href="https://crm.semtop.vn" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">crm.semtop.vn</a>
          </div>
        </div>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</div>
  ```

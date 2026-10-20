# Mẫu Email & Cấu hình URL trên Supabase Auth

Hệ thống sử dụng **Supabase Auth (`nvopyhmwdlzgbadcjjid.supabase.co`)** kết hợp **Custom SMTP (`crm@semtop.vn`)** để gửi 2 luồng email tự động:
1. **Mời tạo tài khoản & đặt mật khẩu lần đầu (`Invite user`)**: Kích hoạt khi Admin tạo tài khoản mới hoặc bấm **"Gửi lại email đặt mật khẩu"** ở màn `/users` (qua [`sendPasswordSetupEmail`](../src/lib/auth/password-mail.ts)).
2. **Đặt lại mật khẩu (`Reset password`)**: Kích hoạt khi tài khoản đã tồn tại bấm **"Quên mật khẩu?"** ở màn `/login` hoặc Admin gửi lại link đặt mật khẩu ở màn `/users`.

---

## Thông số nhận diện & Footer chuẩn Website `semtop.vn`
- **Logo chính thức**: `https://crm.semtop.vn/brand/logo-white.png`
- **Đơn vị chủ quản**: Công ty cổ phần truyền thông SEMTOP
- **Địa chỉ**: Tầng 14 - Intracom 2, 33 Cầu Diễn - Bắc Từ Liêm, Hà Nội
- **Hotline**: `0938 859 555`
- **Email liên hệ**: `hoitv@semtop.vn`
- **Website**: `https://semtop.vn/` (`Giới thiệu`, `Dịch vụ`, `Tin tức`, `Facebook`, `Zalo`, `TikTok`)

---

## 1. Mẫu **"Invite user"** (Thư mời cấp tài khoản mới)

- **Subject heading**:
  ```text
  [SEMTOP CRM] Mời bạn kích hoạt tài khoản & đặt mật khẩu đăng nhập
  ```

- **Message body (HTML)**:
  ```html
<div style="margin: 0; padding: 36px 16px; background-color: #f3f5f9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0c1222; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #dfe5ef; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(16, 42, 107, 0.08);">
    <!-- Top Brand Accent Bar (SEMTOP Blue + SEMTOP Red) -->
    <tr>
      <td style="padding: 0; height: 5px; background: linear-gradient(90deg, #1a4db8 0%, #1a4db8 62%, #e11d2e 62%, #e11d2e 100%); background-color: #1a4db8; font-size: 0; line-height: 0;">&nbsp;</td>
    </tr>

    <!-- White Brand Header with Official SEMTOP Logo -->
    <tr>
      <td style="padding: 24px 32px 20px; background-color: #ffffff; border-bottom: 1px solid #eef1f6;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" valign="middle">
              <a href="https://crm.semtop.vn" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP - Cầu nối cho sự phát triển" width="165" style="display: block; height: auto; max-height: 44px; width: auto; border: 0;" />
              </a>
            </td>
            <td align="right" valign="middle">
              <span style="display: inline-block; background-color: #e8eef9; color: #143a8c; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 12px; border-radius: 999px; border: 1px solid #d5e2f9;">
                Marketing CRM
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Deep Navy Hero Banner (#102a6b) -->
    <tr>
      <td style="padding: 26px 32px; background-color: #102a6b; background-image: linear-gradient(135deg, #102a6b 0%, #1a4db8 100%); color: #ffffff;">
        <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #93c5fd; margin-bottom: 6px;">
          THƯ MỜI CẤP TÀI KHOẢN HỆ THỐNG
        </div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; line-height: 1.3; color: #ffffff;">
          Kích hoạt tài khoản &amp; Đặt mật khẩu
        </h1>
      </td>
    </tr>

    <!-- Main Content Body -->
    <tr>
      <td style="padding: 32px; font-size: 14px; line-height: 1.65; color: #1e293b;">
        <p style="margin: 0 0 16px; font-size: 15px; color: #0c1222;">
          Xin chào <strong>{{ if .Data.full_name }}{{ .Data.full_name }}{{ else }}{{ .Email }}{{ end }}</strong>,
        </p>
        <p style="margin: 0 0 20px; color: #334155;">
          Quản trị viên vừa khởi tạo tài khoản cho bạn trên hệ thống <strong>SEMTOP Marketing CRM</strong> — nền tảng quản trị Lead đa kênh, đồng bộ Meta Ads và vận hành Sale.
        </p>

        <!-- Account Info Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 26px; background-color: #f3f5f9; border-left: 4px solid #1a4db8; border-radius: 8px;">
          <tr>
            <td style="padding: 14px 18px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #5b6b84; margin-bottom: 4px;">
                Thông tin tài khoản của bạn
              </div>
              <div style="font-size: 14px; color: #0c1222; margin-bottom: 2px;">
                Email đăng nhập: <strong style="color: #1a4db8;">{{ .Email }}</strong>
              </div>
              <div style="font-size: 13px; color: #5b6b84;">
                Địa chỉ hệ thống: <a href="https://crm.semtop.vn" style="color: #1a4db8; text-decoration: none; font-weight: 600;">https://crm.semtop.vn</a>
              </div>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 24px; color: #334155;">
          Vui lòng nhấn vào nút bên dưới để thiết lập mật khẩu cá nhân và bắt đầu làm việc:
        </p>

        <!-- Primary CTA Button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 28px;">
          <tr>
            <td align="center">
              <a
                href="https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&type=invite"
                target="_blank"
                style="display: inline-block; background-color: #1a4db8; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 34px; border-radius: 8px; border-bottom: 3px solid #102a6b; box-shadow: 0 2px 6px rgba(26, 77, 184, 0.25);"
              >
                Thiết lập mật khẩu &amp; Đăng nhập ngay &rarr;
              </a>
            </td>
          </tr>
        </table>

        <!-- Fallback Link Box -->
        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 14px; margin-bottom: 4px;">
          <div style="font-size: 12px; color: #5b6b84; margin-bottom: 4px;">
            Nếu nút bấm trên không mở được, hãy sao chép đường dẫn sau và dán vào trình duyệt:
          </div>
          <div style="font-size: 12px; word-break: break-all; color: #1a4db8; font-family: Consolas, Monaco, monospace;">
            https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&amp;type=invite
          </div>
        </div>
      </td>
    </tr>

    <!-- Website-style SEMTOP Footer (Red top border + Full Company Contact Info) -->
    <tr>
      <td style="padding: 28px 32px 22px; background-color: #ffffff; border-top: 2px solid #e11d2e;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <!-- Left Column: Logo + Web Menu + Social Links -->
            <td valign="top" width="44%" style="padding-right: 16px;">
              <a href="https://semtop.vn/" target="_blank" style="text-decoration: none; display: inline-block; margin-bottom: 12px;">
                <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP - Cầu nối cho sự phát triển" width="135" style="display: block; height: auto; width: 135px; border: 0;" />
              </a>
              <div style="font-size: 12px; font-weight: 700; color: #0c1222; margin-bottom: 12px; line-height: 1.8;">
                <a href="https://semtop.vn/gioi-thieu" target="_blank" style="color: #0c1222; text-decoration: underline;">Giới thiệu<sup>&reg;</sup></a>
                &nbsp;&bull;&nbsp;
                <a href="https://semtop.vn/dich-vu" target="_blank" style="color: #0c1222; text-decoration: underline;">Dịch vụ</a>
                &nbsp;&bull;&nbsp;
                <a href="https://semtop.vn/tin-tuc" target="_blank" style="color: #0c1222; text-decoration: underline;">Tin tức</a>
              </div>
              <div>
                <a href="https://www.facebook.com/profile.php?id=61574693681120" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 4px 9px; border-radius: 4px; margin-right: 4px;">Facebook</a>
                <a href="https://zalo.me/0938859555" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 4px 9px; border-radius: 4px; margin-right: 4px;">Zalo</a>
                <a href="https://www.tiktok.com/@semtop38" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 4px 9px; border-radius: 4px;">TikTok</a>
              </div>
            </td>

            <!-- Right Column: Company Name, Address, Hotline, Email -->
            <td valign="top" width="56%" style="font-size: 12px; line-height: 1.65; color: #334155;">
              <div style="font-size: 13px; font-weight: 700; color: #0c1222; margin-bottom: 6px;">
                Công ty cổ phần truyền thông SEMTOP
              </div>
              <div style="color: #475569; margin-bottom: 8px;">
                Tầng 14 - Intracom 2,<br />
                33 Cầu Diễn - Bắc Từ Liêm, Hà Nội
              </div>
              <div style="margin-bottom: 3px;">
                Hotline: <a href="tel:0938859555" style="color: #0c1222; font-weight: 700; text-decoration: none;">0938 859 555</a>
              </div>
              <div style="margin-bottom: 3px;">
                Email: <a href="mailto:hoitv@semtop.vn" style="color: #0c1222; text-decoration: underline;">hoitv@semtop.vn</a>
              </div>
              <div>
                Website: <a href="https://semtop.vn/" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">semtop.vn</a>
                &nbsp;|&nbsp;
                CRM: <a href="https://crm.semtop.vn" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">crm.semtop.vn</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Copyright Sub-footer -->
    <tr>
      <td style="padding: 12px 32px; background-color: #f8fafc; border-top: 1px solid #eef1f6; font-size: 11px; color: #64748b;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left">&copy; SEMTOP 2025 all rights reserved</td>
            <td align="right" style="color: #e11d2e; font-weight: 600;">Cầu nối cho sự phát triển</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
  ```

---

## 2. Mẫu **"Reset password"** (Thư đặt lại mật khẩu)

- **Subject heading**:
  ```text
  [SEMTOP CRM] Yêu cầu đặt lại mật khẩu đăng nhập
  ```

- **Message body (HTML)**:
  ```html
<div style="margin: 0; padding: 36px 16px; background-color: #f3f5f9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0c1222; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #dfe5ef; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(16, 42, 107, 0.08);">
    <!-- Top Brand Accent Bar (SEMTOP Blue + SEMTOP Red) -->
    <tr>
      <td style="padding: 0; height: 5px; background: linear-gradient(90deg, #1a4db8 0%, #1a4db8 62%, #e11d2e 62%, #e11d2e 100%); background-color: #1a4db8; font-size: 0; line-height: 0;">&nbsp;</td>
    </tr>

    <!-- White Brand Header with Official SEMTOP Logo -->
    <tr>
      <td style="padding: 24px 32px 20px; background-color: #ffffff; border-bottom: 1px solid #eef1f6;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" valign="middle">
              <a href="https://crm.semtop.vn" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP - Cầu nối cho sự phát triển" width="165" style="display: block; height: auto; max-height: 44px; width: auto; border: 0;" />
              </a>
            </td>
            <td align="right" valign="middle">
              <span style="display: inline-block; background-color: #e8eef9; color: #143a8c; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 12px; border-radius: 999px; border: 1px solid #d5e2f9;">
                Marketing CRM
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Deep Navy Hero Banner (#102a6b) -->
    <tr>
      <td style="padding: 26px 32px; background-color: #102a6b; background-image: linear-gradient(135deg, #102a6b 0%, #1a4db8 100%); color: #ffffff;">
        <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #93c5fd; margin-bottom: 6px;">
          BẢO MẬT &amp; KHÔI PHỤC TÀI KHOẢN
        </div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; line-height: 1.3; color: #ffffff;">
          Yêu cầu đặt lại mật khẩu đăng nhập
        </h1>
      </td>
    </tr>

    <!-- Main Content Body -->
    <tr>
      <td style="padding: 32px; font-size: 14px; line-height: 1.65; color: #1e293b;">
        <p style="margin: 0 0 16px; font-size: 15px; color: #0c1222;">
          Xin chào <strong>{{ if .Data.full_name }}{{ .Data.full_name }}{{ else }}{{ .Email }}{{ end }}</strong>,
        </p>
        <p style="margin: 0 0 20px; color: #334155;">
          Hệ thống <strong>SEMTOP Marketing CRM</strong> nhận được yêu cầu cấp lại mật khẩu mới cho tài khoản của bạn.
        </p>

        <!-- Account Info Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 26px; background-color: #f3f5f9; border-left: 4px solid #e11d2e; border-radius: 8px;">
          <tr>
            <td style="padding: 14px 18px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #5b6b84; margin-bottom: 4px;">
                Tài khoản yêu cầu khôi phục
              </div>
              <div style="font-size: 14px; color: #0c1222; margin-bottom: 2px;">
                Email đăng nhập: <strong style="color: #1a4db8;">{{ .Email }}</strong>
              </div>
              <div style="font-size: 13px; color: #5b6b84;">
                Địa chỉ hệ thống: <a href="https://crm.semtop.vn" style="color: #1a4db8; text-decoration: none; font-weight: 600;">https://crm.semtop.vn</a>
              </div>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 24px; color: #334155;">
          Nhấn vào nút bên dưới để tạo mật khẩu mới (liên kết chỉ sử dụng 1 lần):
        </p>

        <!-- Primary CTA Button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 28px;">
          <tr>
            <td align="center">
              <a
                href="https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&type=recovery"
                target="_blank"
                style="display: inline-block; background-color: #1a4db8; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 34px; border-radius: 8px; border-bottom: 3px solid #102a6b; box-shadow: 0 2px 6px rgba(26, 77, 184, 0.25);"
              >
                Đặt mật khẩu mới ngay &rarr;
              </a>
            </td>
          </tr>
        </table>

        <!-- Fallback Link Box -->
        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #5b6b84; margin-bottom: 4px;">
            Nếu nút bấm trên không mở được, hãy sao chép đường dẫn sau và dán vào trình duyệt:
          </div>
          <div style="font-size: 12px; word-break: break-all; color: #1a4db8; font-family: Consolas, Monaco, monospace;">
            https://crm.semtop.vn/login/reset?token_hash={{ .TokenHash }}&amp;type=recovery
          </div>
        </div>

        <p style="margin: 0; font-size: 12px; color: #64748b;">
          * Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email — mật khẩu hiện tại của bạn vẫn được giữ nguyên an toàn.
        </p>
      </td>
    </tr>

    <!-- Website-style SEMTOP Footer (Red top border + Full Company Contact Info) -->
    <tr>
      <td style="padding: 28px 32px 22px; background-color: #ffffff; border-top: 2px solid #e11d2e;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <!-- Left Column: Logo + Web Menu + Social Links -->
            <td valign="top" width="44%" style="padding-right: 16px;">
              <a href="https://semtop.vn/" target="_blank" style="text-decoration: none; display: inline-block; margin-bottom: 12px;">
                <img src="https://crm.semtop.vn/brand/logo-white.png" alt="SEMTOP - Cầu nối cho sự phát triển" width="135" style="display: block; height: auto; width: 135px; border: 0;" />
              </a>
              <div style="font-size: 12px; font-weight: 700; color: #0c1222; margin-bottom: 12px; line-height: 1.8;">
                <a href="https://semtop.vn/gioi-thieu" target="_blank" style="color: #0c1222; text-decoration: underline;">Giới thiệu<sup>&reg;</sup></a>
                &nbsp;&bull;&nbsp;
                <a href="https://semtop.vn/dich-vu" target="_blank" style="color: #0c1222; text-decoration: underline;">Dịch vụ</a>
                &nbsp;&bull;&nbsp;
                <a href="https://semtop.vn/tin-tuc" target="_blank" style="color: #0c1222; text-decoration: underline;">Tin tức</a>
              </div>
              <div>
                <a href="https://www.facebook.com/profile.php?id=61574693681120" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 4px 9px; border-radius: 4px; margin-right: 4px;">Facebook</a>
                <a href="https://zalo.me/0938859555" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 4px 9px; border-radius: 4px; margin-right: 4px;">Zalo</a>
                <a href="https://www.tiktok.com/@semtop38" target="_blank" style="display: inline-block; background-color: #0c1222; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none; padding: 4px 9px; border-radius: 4px;">TikTok</a>
              </div>
            </td>

            <!-- Right Column: Company Name, Address, Hotline, Email -->
            <td valign="top" width="56%" style="font-size: 12px; line-height: 1.65; color: #334155;">
              <div style="font-size: 13px; font-weight: 700; color: #0c1222; margin-bottom: 6px;">
                Công ty cổ phần truyền thông SEMTOP
              </div>
              <div style="color: #475569; margin-bottom: 8px;">
                Tầng 14 - Intracom 2,<br />
                33 Cầu Diễn - Bắc Từ Liêm, Hà Nội
              </div>
              <div style="margin-bottom: 3px;">
                Hotline: <a href="tel:0938859555" style="color: #0c1222; font-weight: 700; text-decoration: none;">0938 859 555</a>
              </div>
              <div style="margin-bottom: 3px;">
                Email: <a href="mailto:hoitv@semtop.vn" style="color: #0c1222; text-decoration: underline;">hoitv@semtop.vn</a>
              </div>
              <div>
                Website: <a href="https://semtop.vn/" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">semtop.vn</a>
                &nbsp;|&nbsp;
                CRM: <a href="https://crm.semtop.vn" target="_blank" style="color: #1a4db8; font-weight: 600; text-decoration: none;">crm.semtop.vn</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Copyright Sub-footer -->
    <tr>
      <td style="padding: 12px 32px; background-color: #f8fafc; border-top: 1px solid #eef1f6; font-size: 11px; color: #64748b;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left">&copy; SEMTOP 2025 all rights reserved</td>
            <td align="right" style="color: #e11d2e; font-weight: 600;">Cầu nối cho sự phát triển</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
  ```

import { describe, expect, it } from "vitest";
import { mapFacebookLeadFields } from "./map-lead";

describe("mapFacebookLeadFields", () => {
  it("maps phone and name", () => {
    const r = mapFacebookLeadFields([
      { name: "full_name", values: ["Nguyen A"] },
      { name: "phone_number", values: ["0901234567"] },
    ]);
    expect(r).toEqual({
      phone: "0901234567",
      name: "Nguyen A",
      campaign: null,
      adContent: null,
      attrs: {},
    });
  });

  it("imports with empty phone when missing", () => {
    const r = mapFacebookLeadFields([{ name: "full_name", values: ["X"] }]);
    expect(r).toEqual({
      phone: "",
      name: "X",
      campaign: null,
      adContent: null,
      attrs: {},
    });
  });

  it("keeps unmapped form fields in attrs", () => {
    const r = mapFacebookLeadFields([
      { name: "full_name", values: ["Nguyen A"] },
      { name: "phone_number", values: ["0901234567"] },
      { name: "email", values: ["a@example.com"] },
      { name: "Thành phố", values: [" Hà Nội "] },
      { name: "xe_quan_tam", values: ["CX-5", "CX-8"] },
      { name: "ghi_chu", values: [""] },
      { name: "lead_id", values: ["123"] },
    ]);
    expect(r.attrs).toEqual({
      email: "a@example.com",
      "thành phố": "Hà Nội",
      xe_quan_tam: "CX-5, CX-8",
    });
  });

  it("accepts alternate phone keys and normalizes +84 VN prefix to 0", () => {
    const r = mapFacebookLeadFields([{ name: "phone", values: ["+84901234567"] }]);
    expect(r.phone).toBe("0901234567");
  });

  it("preserves foreign international phone numbers on Lead Forms", () => {
    const r = mapFacebookLeadFields([
      { name: "full_name", values: ["Kim Minjun"] },
      { name: "phone_number", values: ["+82 10-3516-6618"] },
    ]);
    expect(r.phone).toBe("+821035166618");
  });

  it("normalizes Vietnamese and custom Lead Form question keys for name and phone", () => {
    const r1 = mapFacebookLeadFields([
      { name: "tên_đầy_đủ", values: ["Ngoc Quynh Le"] },
      { name: "số_điện_thoại", values: ["+84981876469"] },
      { name: "tỉnh/thành_phố", values: ["Yên Kiên (2)"] },
    ]);
    expect(r1.name).toBe("Ngoc Quynh Le");
    expect(r1.phone).toBe("0981876469");
    expect(r1.attrs).toEqual({ "tỉnh/thành_phố": "Yên Kiên (2)" });

    const r2 = mapFacebookLeadFields([
      { name: "họ_tên_của_quý_khách_hàng", values: ["Trần Văn An"] },
      { name: "số_điện_thoại_(quý_khách_vui_lòng_nhập_chính_xác)", values: ["0912345678"] },
    ]);
    expect(r2.name).toBe("Trần Văn An");
    expect(r2.phone).toBe("0912345678");
  });
});

import {
  extractPhoneFromText,
  hasCommentLeadIntent,
  mapFacebookCommentLead,
  mapFacebookConversationLead,
} from "./map-lead";

describe("extractPhoneFromText", () => {
  it("extracts Vietnamese mobile numbers in various formats", () => {
    expect(extractPhoneFromText("Anh gọi số 0912 345 678 giúp em")).toBe("0912345678");
    expect(extractPhoneFromText("SĐT mình: +84987654321 nhé")).toBe("0987654321");
    expect(extractPhoneFromText("Liên hệ o904.111.222")).toBe("0904111222");
    expect(extractPhoneFromText("Không có số điện thoại")).toBeNull();
  });

  it("extracts international numbers starting with + and ignores FB IDs inside URLs", () => {
    expect(extractPhoneFromText("My number in Korea is +82 10-3516-6618")).toBe("+821035166618");
    expect(
      extractPhoneFromText(
        "Xem bình luận(https://facebook.com/story.php?story_fbid=abc&id=100070767341843) | Giá sao ạ",
      ),
    ).toBeNull();
  });
});

describe("mapFacebookConversationLead", () => {
  it("maps a Messenger conversation with customer phone and messages into TIN_NHAN lead", () => {
    const lead = mapFacebookConversationLead(
      {
        id: "t_123456",
        updated_time: "2026-10-18T08:00:00+0000",
        link: "/latest/inbox/all?asset_id=101&selected_item_id=t_123456",
        participants: {
          data: [
            { id: "101", name: "Kia Hòa Bình" },
            { id: "u_999", name: "Trần Văn Bình" },
          ],
        },
        messages: {
          data: [
            {
              id: "m_2",
              message: "Số mình là 0988 123 456 tư vấn Kia Seltos nhé",
              created_time: "2026-10-18T08:00:00+0000",
              from: { id: "u_999", name: "Trần Văn Bình" },
            },
            {
              id: "m_1",
              message: "Chào shop, báo giá lăn bánh Hòa Bình giúp mình",
              created_time: "2026-10-18T07:58:00+0000",
              from: { id: "u_999", name: "Trần Văn Bình" },
            },
          ],
        },
      },
      "101",
    );

    expect(lead).not.toBeNull();
    expect(lead?.facebookLeadId).toBe("msg_t_123456");
    expect(lead?.name).toBe("Trần Văn Bình");
    expect(lead?.phone).toBe("0988123456");
    expect(lead?.attrs.psid).toBe("u_999");
    expect(lead?.attrs.noi_dung_tin_nhan).toContain("0988 123 456");
    expect(lead?.isOnlyFormEcho).toBe(false);
  });

  it("never extracts Fanpage hotline phone when customer has not sent a phone number", () => {
    const lead = mapFacebookConversationLead(
      {
        id: "t_hotline",
        updated_time: "2026-10-18T08:00:00+0000",
        participants: {
          data: [
            { id: "101", name: "Thaco Bắc Giang" },
            { id: "u_555", name: "Tuấn Nguyễn" },
          ],
        },
        messages: {
          data: [
            {
              id: "m_page",
              message: "Cảm ơn bạn đã liên hệ! Vui lòng để lại SĐT hoặc gọi Hotline: 0901888087.",
              created_time: "2026-10-18T08:00:05+0000",
              from: { id: "101", name: "Thaco Bắc Giang" },
            },
            {
              id: "m_cust",
              message: "Xin giá lăn bánh Seltos ạ",
              created_time: "2026-10-18T08:00:00+0000",
              from: { id: "u_555", name: "Tuấn Nguyễn" },
            },
          ],
        },
      },
      "101",
    );

    expect(lead?.phone).toBe("");
    expect(lead?.attrs.noi_dung_tin_nhan).toBe("Xin giá lăn bánh Seltos ạ");
  });

  it("marks Meta auto-generated Lead Form echo message with isOnlyFormEcho = true", () => {
    const lead = mapFacebookConversationLead(
      {
        id: "t_form_echo",
        updated_time: "2026-11-18T14:10:53+0000",
        participants: {
          data: [
            { id: "101", name: "KIA Quảng Ninh" },
            { id: "u_777", name: "Bá Hưng" },
          ],
        },
        messages: {
          data: [
            {
              id: "m_echo",
              message:
                "Xin chào! Tôi đã điền mẫu và muốn biết thêm về doanh nghiệp bạn.\nFull name: Bá Hưng\nPhone number: 096 536 21 11",
              created_time: "2026-11-18T14:10:53+0000",
              from: { id: "u_777", name: "Bá Hưng" },
            },
          ],
        },
      },
      "101",
    );

    expect(lead?.phone).toBe("0965362111");
    expect(lead?.isOnlyFormEcho).toBe(true);
  });
});

describe("mapFacebookCommentLead", () => {
  it("maps customer comments containing phone or consulting intent into COMMENT lead", () => {
    expect(hasCommentLeadIntent("Xin báo giá lăn bánh Mazda CX-5")).toBe(true);
    expect(hasCommentLeadIntent(".")).toBe(false);

    const lead = mapFacebookCommentLead(
      {
        id: "1169343658767868_99999",
        message: "Tư vấn trả góp Mazda CX5 qua số 0913.222.333",
        created_time: "2026-10-18T09:00:00+0000",
        from: { id: "u_888", name: "Lê Hoàng" },
      },
      "102838068749392",
      { postId: "102838068749392_1169343658767868", postMessage: "Ưu đãi Mazda CX-5 tháng 10" },
    );

    expect(lead).not.toBeNull();
    expect(lead?.facebookLeadId).toBe("cmt_1169343658767868_99999");
    expect(lead?.name).toBe("Lê Hoàng");
    expect(lead?.phone).toBe("0913222333");
    expect(lead?.adContent).toContain("Ưu đãi Mazda CX-5");
  });
});


import { normalizePhone } from "@/lib/leads/phone";

export type FacebookFieldDatum = { name: string; values: string[] };

export type MappedFacebookLead = {
  phone: string;
  name: string | null;
  campaign: string | null;
  adContent: string | null;
  /** Các field trong form không map vào cột CRM — giữ nguyên key/value để hiển thị ở chi tiết lead. */
  attrs: Record<string, string>;
};

const PHONE_KEYS = new Set([
  "phone_number",
  "phone",
  "mobile_phone",
  "số_điện_thoại",
  "so_dien_thoai",
  "sđt",
  "sdt",
  "điện_thoại",
  "dien_thoai",
]);
const MULTILINGUAL_PHONE_KEYS = new Set([
  "電話號碼",
  "电话号码",
  "手機號碼",
  "手机号码",
  "聯絡電話",
  "联系电话",
  "電話",
  "电话",
  "전화번호",
  "휴대폰_번호",
  "휴대폰번호",
  "휴대전화",
  "연락처",
  "電話番号",
  "携帯電話番号",
  "เบอร์โทรศัพท์",
  "โทรศัพท์",
  "nomor_telepon",
  "no_telepon",
  "no_hp",
  "numero_de_telefono",
  "numéro_de_téléphone",
  "telefonnummer",
  "номер_телефона",
  "телефон",
  "whatsapp",
  "whatsapp_number",
]);

const FULL_NAME_KEYS = new Set([
  "full_name",
  "tên_đầy_đủ",
  "ten_day_du",
  "họ_và_tên",
  "ho_va_ten",
  "họ_tên",
  "ho_ten",
]);
const MULTILINGUAL_FULL_NAME_KEYS = new Set([
  "全名",
  "姓名",
  "성명",
  "이름",
  "전체_이름",
  "氏名",
  "フルネーム",
  "お名前",
  "名前",
  "ชื่อ-นามสกุล",
  "ชื่อ_นามสกุล",
  "ชื่อ",
  "nama_lengkap",
  "nama",
  "nombre_completo",
  "nom_complet",
  "vollständiger_name",
  "полное_имя",
  "фио",
  "имя",
]);

const FIRST_NAME_KEYS = new Set(["first_name", "tên", "ten"]);
const MULTILINGUAL_FIRST_NAME_KEYS = new Set(["名字", "名", "이름_first", "下の名前"]);

const LAST_NAME_KEYS = new Set(["last_name", "họ", "ho"]);
const MULTILINGUAL_LAST_NAME_KEYS = new Set(["姓氏", "姓", "성"]);

/** Các key địa lý / ghi chú / định danh không bao giờ dùng làm fallback Họ tên. */
const NON_NAME_FALLBACK_KEYS = new Set([
  "email",
  "e-mail",
  "city",
  "province",
  "state",
  "country",
  "zip",
  "post_code",
  "postal_code",
  "street_address",
  "address",
  "dia_chi",
  "tinh_thanh_pho",
  "tỉnh/thành_phố",
  "ghi_chu",
  "note",
  "company",
  "company_name",
  "cong_ty",
  "job_title",
  "chuc_vu",
  "inbox_url",
  "link_inbox",
  "psid",
  "post_id",
  "link_comment",
  "noi_dung_tin_nhan",
  "noi_dung_comment",
]);

/** Field Meta tự sinh, không có giá trị nghiệp vụ. */
const IGNORED_KEYS = new Set(["lead_id", "created_time", "platform", "is_organic"]);

const MAX_ATTR_KEYS = 30;
const MAX_ATTR_VALUE = 500;

function fieldKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Chuyển nhãn câu hỏi tiếng Việt / có dấu câu về snake_case không dấu để khớp ngữ nghĩa. */
export function toAsciiFieldKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isStandardPhoneFieldKey(name: string): boolean {
  const k = fieldKey(name);
  if (PHONE_KEYS.has(k)) return true;
  const ascii = toAsciiFieldKey(name);
  if (PHONE_KEYS.has(ascii)) return true;
  return /(?:^|_)(?:phone_number|mobile_phone|so_dien_thoai|dien_thoai|sdt|zalo)(?:_|$)/.test(
    ascii,
  );
}

export function isPhoneFieldKey(name: string): boolean {
  if (isStandardPhoneFieldKey(name)) return true;
  const k = fieldKey(name);
  if (MULTILINGUAL_PHONE_KEYS.has(k)) return true;
  const ascii = toAsciiFieldKey(name);
  return MULTILINGUAL_PHONE_KEYS.has(ascii);
}

function isStandardFullNameFieldKey(name: string): boolean {
  const k = fieldKey(name);
  if (FULL_NAME_KEYS.has(k)) return true;
  const ascii = toAsciiFieldKey(name);
  if (FULL_NAME_KEYS.has(ascii)) return true;
  return /(?:^|_)(?:full_name|ten_day_du|ho_va_ten|ho_ten|ten_khach_hang|ten_quy_khach|ten_cua_ban)(?:_|$)/.test(
    ascii,
  );
}

export function isFullNameFieldKey(name: string): boolean {
  if (isStandardFullNameFieldKey(name)) return true;
  const k = fieldKey(name);
  if (MULTILINGUAL_FULL_NAME_KEYS.has(k)) return true;
  const ascii = toAsciiFieldKey(name);
  return MULTILINGUAL_FULL_NAME_KEYS.has(ascii);
}

function isStandardFirstNameFieldKey(name: string): boolean {
  const k = fieldKey(name);
  return FIRST_NAME_KEYS.has(k) || FIRST_NAME_KEYS.has(toAsciiFieldKey(name));
}

function isFirstNameFieldKey(name: string): boolean {
  if (isStandardFirstNameFieldKey(name)) return true;
  const k = fieldKey(name);
  return MULTILINGUAL_FIRST_NAME_KEYS.has(k);
}

function isStandardLastNameFieldKey(name: string): boolean {
  const k = fieldKey(name);
  return LAST_NAME_KEYS.has(k) || LAST_NAME_KEYS.has(toAsciiFieldKey(name));
}

function isLastNameFieldKey(name: string): boolean {
  if (isStandardLastNameFieldKey(name)) return true;
  const k = fieldKey(name);
  return MULTILINGUAL_LAST_NAME_KEYS.has(k);
}

function isStandardNameFieldKey(name: string): boolean {
  return (
    isStandardFullNameFieldKey(name) ||
    isStandardFirstNameFieldKey(name) ||
    isStandardLastNameFieldKey(name)
  );
}

function firstMatchingField(
  fieldData: FacebookFieldDatum[],
  predicate: (name: string) => boolean,
): { fieldName: string; value: string } | null {
  for (const field of fieldData) {
    if (!predicate(field.name)) continue;
    const raw = field.values?.[0];
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) return { fieldName: field.name, value: trimmed };
  }
  return null;
}

/**
 * Tầng 2 (Value Fallback cho SĐT): Nhận diện giá trị SĐT chuẩn E.164 (+<mã nước>...)
 * hoặc SĐT Việt Nam khi tên câu hỏi Form viết bằng ngôn ngữ lạ / nhãn tùy biến.
 */
function looksLikeFormPhoneValue(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || trimmed.includes("@")) return false;
  if (/^\+[1-9]\d(?:[\s.\-()]*\d){7,14}$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (/^[\d\s.\-()]+$/.test(trimmed)) {
    if (/^(?:840|84)\d{9}$/.test(digits)) return true;
    if (/^0[235789]\d{8,9}$/.test(digits)) return true;
  }
  return false;
}

function resolveFallbackPhoneField(
  fieldData: FacebookFieldDatum[],
): { fieldName: string; value: string } | null {
  for (const field of fieldData) {
    const k = fieldKey(field.name);
    if (!k || IGNORED_KEYS.has(k) || NON_NAME_FALLBACK_KEYS.has(k) || isFullNameFieldKey(field.name)) {
      continue;
    }
    const raw = field.values?.[0]?.trim();
    if (raw && looksLikeFormPhoneValue(raw)) {
      return { fieldName: field.name, value: raw };
    }
  }
  return null;
}

/**
 * Tầng 2 (Value Fallback cho Họ tên): Chỉ chạy khi Tầng 1 không khớp tên trường nào
 * và đã xác định được trường SĐT khác trong cùng Form.
 */
function resolveFallbackNameValue(
  fieldData: FacebookFieldDatum[],
  usedPhoneFieldName: string | null,
): string | null {
  if (!usedPhoneFieldName) return null;
  for (const field of fieldData) {
    if (field.name === usedPhoneFieldName) continue;
    const k = fieldKey(field.name);
    const ascii = toAsciiFieldKey(field.name);
    if (
      !k ||
      IGNORED_KEYS.has(k) ||
      NON_NAME_FALLBACK_KEYS.has(k) ||
      NON_NAME_FALLBACK_KEYS.has(ascii) ||
      isPhoneFieldKey(field.name)
    ) {
      continue;
    }
    if (/[?:\/]/.test(k) || k.length > 30) continue;
    if ((field.values?.length ?? 0) !== 1) continue;
    const val = (field.values?.[0] ?? "").trim();
    if (
      val.length < 2 ||
      val.length > 50 ||
      /[@_\d\r\n]/.test(val) ||
      /^https?:\/\//i.test(val)
    ) {
      continue;
    }
    return val;
  }
  return null;
}

function resolveName(
  fieldData: FacebookFieldDatum[],
  usedPhoneFieldName: string | null,
): string | null {
  const full = firstMatchingField(fieldData, isFullNameFieldKey);
  if (full) return full.value;

  const first = firstMatchingField(fieldData, isFirstNameFieldKey);
  const last = firstMatchingField(fieldData, isLastNameFieldKey);
  if (first && last) return `${first.value} ${last.value}`.trim();
  if (first) return first.value;
  if (last) return last.value;

  return resolveFallbackNameValue(fieldData, usedPhoneFieldName);
}

function nonEmptyMeta(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Mọi field còn lại (email, thành phố, câu hỏi tùy chọn của form…) đi vào `attrs`.
 * Riêng các trường ngoại ngữ hoặc trường bóc qua Tầng 2 (Value Fallback) vẫn giữ nguyên
 * bản gốc trong `attrs` để đối chiếu an toàn kép.
 */
function collectAttrs(fieldData: FacebookFieldDatum[]): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const field of fieldData) {
    const key = fieldKey(field.name);
    if (
      !key ||
      isStandardPhoneFieldKey(field.name) ||
      isStandardNameFieldKey(field.name) ||
      IGNORED_KEYS.has(key)
    ) {
      continue;
    }
    if (key in attrs) continue;
    const value = (field.values ?? [])
      .map((v) => (v ?? "").trim())
      .filter((v) => v.length > 0)
      .join(", ");
    if (!value) continue;
    attrs[key] = value.length > MAX_ATTR_VALUE ? `${value.slice(0, MAX_ATTR_VALUE)}…` : value;
    if (Object.keys(attrs).length >= MAX_ATTR_KEYS) break;
  }
  return attrs;
}

/** Map Meta field_data → CRM fields (2 tầng: Key đa ngôn ngữ + Value Fallback). Thiếu SĐT vẫn import (phone = ""). */
export function mapFacebookLeadFields(
  fieldData: FacebookFieldDatum[],
  meta?: { campaignName?: string | null; adName?: string | null },
): MappedFacebookLead {
  const keyMatchedPhone = firstMatchingField(fieldData, isPhoneFieldKey);
  const fallbackPhone = keyMatchedPhone ?? resolveFallbackPhoneField(fieldData);
  const phone = fallbackPhone ? normalizePhone(fallbackPhone.value) : "";

  return {
    phone,
    name: resolveName(fieldData, fallbackPhone?.fieldName ?? null),
    campaign: nonEmptyMeta(meta?.campaignName),
    adContent: nonEmptyMeta(meta?.adName),
    attrs: collectAttrs(fieldData),
  };
}

/** Nhận diện tin nhắn tóm tắt tự động do Meta bắn vào Messenger ngay khi khách điền Lead Form (đa ngôn ngữ). */
export function isMetaLeadFormAutoMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return /tôi đã điền mẫu và muốn biết thêm về doanh nghiệp|filled out your form and would like to know more about your business|我已填[寫写]你的表[格單单]|작성한 설문지를 제출했습니다|フォームに記入しました/i.test(
    text,
  );
}

function isFacebookSystemNotice(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^facebook tạo đoạn chat này vì\b|^facebook created this chat because\b/i.test(
    text.trim(),
  );
}

/**
 * Trích xuất số điện thoại từ nội dung tin nhắn Messenger hoặc bình luận (Comment).
 * - Chuẩn hóa số VN (+84/84/0/o9...) về đầu 0...
 * - Giữ nguyên số quốc tế có mã vùng dấu cộng (+82..., +81..., +886..., +1...).
 * - Loại bỏ URL trước khi quét và kiểm tra ranh giới chữ số để không bóc nhầm Facebook ID trong link.
 */
export function extractPhoneFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, " ");
  const normalizedInput = withoutUrls.replace(/(^|[\s:.,\-()[\]])[oO](?=\d)/g, "$10");

  const vnRegex = /(?:^|[^\d+])((?:\+?84|0)(?:[\s.\-_]*\d){8,9})(?!\d)/g;
  let match: RegExpExecArray | null;
  while ((match = vnRegex.exec(normalizedInput)) !== null) {
    const digits = match[1]!.replace(/\D/g, "");
    if (/^840\d{9}$/.test(digits)) {
      const local = `0${digits.slice(3)}`;
      if (/^0[235789]\d{8}$/.test(local)) return local;
    }
    if (/^84\d{9}$/.test(digits)) {
      const local = `0${digits.slice(2)}`;
      if (/^0[235789]\d{8}$/.test(local)) return local;
    }
    if (/^0[235789]\d{8,9}$/.test(digits)) {
      return digits;
    }
  }

  const intlRegex = /(?:^|[^\w+])(\+[1-9]\d(?:[\s.\-()]*\d){7,13})(?!\d)/g;
  while ((match = intlRegex.exec(withoutUrls)) !== null) {
    const digits = match[1]!.replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) {
      return normalizePhone(`+${digits}`);
    }
  }

  return null;
}

const COMMENT_INTENT_KEYWORDS = [
  "tư vấn",
  "tu van",
  "báo giá",
  "bao gia",
  "giá lăn bánh",
  "gia lan banh",
  "xin giá",
  "xin gia",
  "trả góp",
  "tra gop",
  "khuyến mãi",
  "khuyen mai",
  "liên hệ",
  "lien he",
  "sđt",
  "sdt",
  "số điện thoại",
  "inbox",
  "check ib",
  "ib mình",
  "ib em",
  "ib giúp",
  "lái thử",
  "lai thu",
];

/** Kiểm tra bình luận có chứa SĐT hoặc từ khóa quan tâm mua hàng/tư vấn không. */
export function hasCommentLeadIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  if (extractPhoneFromText(text)) return true;
  const lower = text.toLowerCase().trim();
  if (lower === "ib" || lower === " chấm" || lower === ".") return false;
  if (/\bib\b/.test(lower) && lower.length >= 4) return true;
  return COMMENT_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

export type FacebookConversationMessage = {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string; email?: string };
};

export type FacebookConversationNode = {
  id: string;
  updated_time?: string;
  link?: string;
  participants?: { data?: Array<{ id?: string; name?: string; email?: string }> };
  messages?: { data?: FacebookConversationMessage[] };
};

export type MappedMessengerLead = {
  facebookLeadId: string;
  name: string | null;
  phone: string;
  createdAt: Date | undefined;
  careNote: string | null;
  attrs: Record<string, string>;
  /** True nếu khách chỉ mới có tin nhắn tóm tắt Form tự động của Meta, chưa nhắn câu hỏi thêm. */
  isOnlyFormEcho?: boolean;
};

/**
 * Chuyển 1 cuộc hội thoại Messenger (`/{pageId}/conversations`) thành Lead kênh `TIN_NHAN`.
 * Chỉ trích xuất SĐT từ tin nhắn của chính khách hàng — tuyệt đối không fallback sang tin nhắn của Fanpage
 * để tránh bóc nhầm số Hotline trong câu chào tự động của Page.
 */
export function mapFacebookConversationLead(
  conv: FacebookConversationNode,
  pageId: string,
): MappedMessengerLead | null {
  const participants = conv.participants?.data ?? [];
  const customer = participants.find((p) => p.id && p.id !== pageId);
  const messages = conv.messages?.data ?? [];

  const customerMessages = messages.filter((m) => {
    const text = (m.message ?? "").trim();
    if (!text || isFacebookSystemNotice(text)) return false;
    if (!m.from?.id || m.from.id === pageId) return false;
    if (customer?.id && m.from.id !== customer.id) return false;
    return true;
  });

  if (!customer && customerMessages.length === 0) {
    return null;
  }

  let extractedPhone: string | null = null;
  for (const m of customerMessages) {
    extractedPhone = extractPhoneFromText(m.message);
    if (extractedPhone) break;
  }

  const customerName =
    customer?.name?.trim() ||
    customerMessages.find((m) => m.from?.name)?.from?.name?.trim() ||
    null;

  const realCustomerMessages = customerMessages.filter(
    (m) => !isMetaLeadFormAutoMessage(m.message),
  );
  const isOnlyFormEcho = customerMessages.length > 0 && realCustomerMessages.length === 0;
  const messagesForSummary =
    realCustomerMessages.length > 0 ? realCustomerMessages : customerMessages;

  // Lấy tối đa 5 tin nhắn gần nhất của khách để đưa vào ghi chú / attrs
  const recentCustomerTexts = messagesForSummary
    .slice(0, 5)
    .reverse()
    .map((m) => (m.message ?? "").trim())
    .filter(Boolean);

  const summaryText = recentCustomerTexts.join(" | ").slice(0, MAX_ATTR_VALUE);

  const attrs: Record<string, string> = {};
  if (summaryText) {
    attrs.noi_dung_tin_nhan = summaryText;
  }
  if (conv.link) {
    attrs.link_inbox = conv.link.startsWith("http")
      ? conv.link
      : `https://business.facebook.com${conv.link}`;
  }
  if (customer?.id) {
    attrs.psid = customer.id;
  }

  const earliestMsgTime =
    customerMessages[customerMessages.length - 1]?.created_time ?? conv.updated_time;
  const parsedDate = earliestMsgTime ? new Date(earliestMsgTime) : undefined;
  const createdAt =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  return {
    facebookLeadId: `msg_${conv.id}`,
    name: customerName,
    phone: extractedPhone ?? "",
    createdAt,
    careNote: summaryText ? `[Messenger] ${summaryText}` : null,
    attrs,
    isOnlyFormEcho,
  };
}

export type FacebookCommentNode = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  from?: { id?: string; name?: string };
};

export type MappedCommentLead = {
  facebookLeadId: string;
  name: string | null;
  phone: string;
  createdAt: Date | undefined;
  adContent: string | null;
  careNote: string | null;
  attrs: Record<string, string>;
};

/**
 * Chuyển 1 bình luận bài viết/quảng cáo (`/{postId}/comments`) thành Lead kênh `COMMENT`.
 * Trả về `null` nếu bình luận do chính Fanpage đăng hoặc không có SĐT / từ khóa quan tâm.
 */
export function mapFacebookCommentLead(
  comment: FacebookCommentNode,
  pageId: string,
  postContext?: { postId?: string; postMessage?: string | null; campaignName?: string | null; adName?: string | null },
): MappedCommentLead | null {
  if (comment.from?.id === pageId) return null;
  const message = (comment.message ?? "").trim();
  if (!message) return null;

  // Bỏ qua các bình luận quảng cáo/ghim Hotline của Page/Seeder bị ẩn danh tính (không có comment.from.id)
  if (!comment.from?.id && /\bhotline\b/i.test(message)) {
    return null;
  }

  const phone = extractPhoneFromText(message);
  if (!phone && !hasCommentLeadIntent(message)) {
    return null;
  }

  const attrs: Record<string, string> = {
    noi_dung_comment: message.slice(0, MAX_ATTR_VALUE),
  };
  if (comment.permalink_url) {
    attrs.link_comment = comment.permalink_url;
  }
  if (postContext?.postId) {
    attrs.post_id = postContext.postId;
  }

  const parsedDate = comment.created_time ? new Date(comment.created_time) : undefined;
  const createdAt =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  const adContent =
    nonEmptyMeta(postContext?.adName) ??
    (postContext?.postMessage ? postContext.postMessage.trim().slice(0, 120) : null);

  return {
    facebookLeadId: `cmt_${comment.id}`,
    name: comment.from?.name?.trim() || "Khách bình luận Facebook",
    phone: phone ?? "",
    createdAt,
    adContent,
    careNote: `[Comment] ${message.slice(0, 300)}`,
    attrs,
  };
}

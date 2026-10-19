export type FacebookFieldDatum = { name: string; values: string[] };

export type MappedFacebookLead = {
  phone: string;
  name: string | null;
  campaign: string | null;
  adContent: string | null;
  /** Các field trong form không map vào cột CRM — giữ nguyên key/value để hiển thị ở chi tiết lead. */
  attrs: Record<string, string>;
};

const PHONE_KEYS = new Set(["phone_number", "phone", "mobile_phone"]);
const NAME_KEYS = new Set(["full_name", "first_name", "last_name"]);

/** Field Meta tự sinh, không có giá trị nghiệp vụ. */
const IGNORED_KEYS = new Set(["lead_id", "created_time", "platform", "is_organic"]);

const MAX_ATTR_KEYS = 30;
const MAX_ATTR_VALUE = 500;

function fieldKey(name: string): string {
  return name.trim().toLowerCase();
}

function firstValue(fieldData: FacebookFieldDatum[], keys: Set<string>): string | null {
  for (const field of fieldData) {
    if (!keys.has(fieldKey(field.name))) continue;
    const raw = field.values?.[0];
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  return hasPlus ? `+${digits}` : digits;
}

function resolveName(fieldData: FacebookFieldDatum[]): string | null {
  const full = firstValue(fieldData, new Set(["full_name"]));
  if (full) return full;

  const first = firstValue(fieldData, new Set(["first_name"]));
  const last = firstValue(fieldData, new Set(["last_name"]));
  if (first && last) return `${first} ${last}`.trim();
  if (first) return first;
  if (last) return last;
  return null;
}

function nonEmptyMeta(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Mọi field còn lại (email, thành phố, câu hỏi tùy chọn của form…) đi vào
 * `attrs`. Key giữ dạng lowercase như Meta trả; nhiều giá trị nối bằng ", ".
 */
function collectAttrs(fieldData: FacebookFieldDatum[]): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const field of fieldData) {
    const key = fieldKey(field.name);
    if (!key || PHONE_KEYS.has(key) || NAME_KEYS.has(key) || IGNORED_KEYS.has(key)) continue;
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

/** Map Meta field_data → CRM fields. Thiếu SĐT vẫn import (phone = ""). */
export function mapFacebookLeadFields(
  fieldData: FacebookFieldDatum[],
  meta?: { campaignName?: string | null; adName?: string | null },
): MappedFacebookLead {
  const rawPhone = firstValue(fieldData, PHONE_KEYS);
  const phone = rawPhone ? normalizePhone(rawPhone) ?? "" : "";

  return {
    phone,
    name: resolveName(fieldData),
    campaign: nonEmptyMeta(meta?.campaignName),
    adContent: nonEmptyMeta(meta?.adName),
    attrs: collectAttrs(fieldData),
  };
}

/**
 * Trích xuất số điện thoại Việt Nam từ nội dung tin nhắn Messenger hoặc bình luận (Comment).
 * Hỗ trợ các biến thể: 0912345678, 0912 345 678, 0912.345.678, +84912345678, 84912345678, o912345678.
 */
export function extractPhoneFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalizedInput = text.replace(/[oO]/g, (m, offset, str) => {
    const next = str[offset + 1];
    return next && /\d/.test(next) ? "0" : m;
  });

  const regex = /(?:\+?84|0)(?:[\s.\-_]*\d){8,9}\b/g;
  const matches = normalizedInput.match(regex);
  if (!matches) return null;

  for (const raw of matches) {
    const digits = raw.replace(/\D/g, "");
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
};

/**
 * Chuyển 1 cuộc hội thoại Messenger (`/{pageId}/conversations`) thành Lead kênh `TIN_NHAN`.
 * Trả về `null` nếu cuộc hội thoại không có khách hàng hoặc không có tin nhắn nào từ khách.
 */
export function mapFacebookConversationLead(
  conv: FacebookConversationNode,
  pageId: string,
): MappedMessengerLead | null {
  const participants = conv.participants?.data ?? [];
  const customer = participants.find((p) => p.id && p.id !== pageId);
  const messages = conv.messages?.data ?? [];

  const customerMessages = messages.filter(
    (m) => m.from?.id !== pageId && (m.message ?? "").trim().length > 0,
  );
  const allMessagesWithText = messages.filter((m) => (m.message ?? "").trim().length > 0);

  if (!customer && customerMessages.length === 0) {
    return null;
  }

  let extractedPhone: string | null = null;
  for (const m of customerMessages) {
    extractedPhone = extractPhoneFromText(m.message);
    if (extractedPhone) break;
  }
  if (!extractedPhone) {
    for (const m of allMessagesWithText) {
      extractedPhone = extractPhoneFromText(m.message);
      if (extractedPhone) break;
    }
  }

  const customerName =
    customer?.name?.trim() ||
    customerMessages.find((m) => m.from?.name)?.from?.name?.trim() ||
    null;

  // Lấy tối đa 5 tin nhắn gần nhất của khách để đưa vào ghi chú / attrs
  const recentCustomerTexts = customerMessages
    .slice(0, 5)
    .reverse()
    .map((m) => (m.message ?? "").trim())
    .filter(Boolean);

  const summaryText =
    recentCustomerTexts.join(" | ").slice(0, MAX_ATTR_VALUE) ||
    allMessagesWithText[0]?.message?.trim().slice(0, MAX_ATTR_VALUE) ||
    "";

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


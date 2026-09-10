import { ASSIGNEES, CAR_MODELS_BY_BRAND, SALES_ROOMS, SHOWROOMS } from "./constants";
import type {
  ActivityLog,
  B10Status,
  Brand,
  ChannelDetail,
  FailReason,
  Lead,
  LeadCategory,
  LeadSource,
} from "./types";

/**
 * Mốc thời gian cố định cho toàn bộ dữ liệu mock. Dùng hằng số thay vì Date.now()
 * để server và client render ra cùng một kết quả (tránh hydration mismatch).
 */
export const NOW = new Date("2026-08-05T17:00:00+07:00");

const TOTAL_LEADS = 704;

/** mulberry32 — PRNG nhỏ, deterministic theo seed. */
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Chọn theo trọng số: [[giá trị, trọng số], ...] */
function weighted<T>(rng: () => number, entries: [T, number][]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

const FIRST_NAMES = [
  "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Đỗ", "Vũ", "Bùi", "Đặng", "Ngô",
];
const MIDDLE_NAMES = [
  "Văn", "Thị", "Ngọc", "Minh", "Thanh", "Quốc", "Hữu", "Thu", "Đình", "Xuân",
];
const LAST_NAMES = [
  "Dũng", "Lương", "Hạnh", "Tuấn", "Anh", "Hà", "Sơn", "Linh", "Nam", "Trang",
  "Khánh", "Phúc", "Đạt", "Huy", "Thảo", "Long", "Quân", "Vy", "Bình", "Ngân",
];

const CAMPAIGNS = [
  "KIA_Sonet_T8_Leadform",
  "KIA_Sorento_T8_Traffic",
  "MAZDA_CX5_T8_Messenger",
  "MAZDA_CX8_UuDai_T8",
  "KIA_Carens_GiaLanBanh",
  "GG_Search_KIA_Brand",
  "GG_Search_Mazda_CX5",
  "TikTok_LaiThu_T8",
];

const AD_CONTENTS = [
  "Video lái thử 15s",
  "Carousel bảng giá",
  "Ảnh đơn ưu đãi 50 triệu",
  "Form đăng ký lái thử",
  "Livestream showroom",
  "Testimonial khách hàng",
];

const CARE_NOTES = [
  "Đã tư vấn giá lăn bánh, khách hẹn cuối tuần ghé xem xe",
  "Khách đang so sánh với xe đối thủ, cần gửi thêm bảng so sánh",
  "Kh đang đi công tác trong tuần về Hn thì sẽ báo qua SR xem xe",
  "Khách hỏi trả góp, đã gửi phương án 20% - 8 năm",
  "Đã hẹn lịch lái thử sáng thứ 7",
  "Khách nhờ báo lại khi có xe màu trắng",
  "Đã gửi báo giá qua Zalo, chờ khách phản hồi",
];

function randomPhone(rng: () => number) {
  const prefixes = ["032", "033", "034", "035", "036", "037", "038", "039", "090", "091", "096", "097", "098", "094"];
  const prefix = pick(rng, prefixes);
  let rest = "";
  for (let i = 0; i < 7; i++) rest += Math.floor(rng() * 10);
  return prefix + rest;
}

function randomName(rng: () => number) {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, MIDDLE_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

function buildLead(index: number, rng: () => number, now: Date): Lead {
  // Lead phân bố trong 90 ngày gần nhất, dày hơn ở các ngày gần đây.
  const skew = Math.pow(rng(), 1.6);
  const daysAgo = Math.floor(skew * 90);
  const createdAt = new Date(now);
  createdAt.setDate(createdAt.getDate() - daysAgo);
  createdAt.setHours(8 + Math.floor(rng() * 11), Math.floor(rng() * 60), 0, 0);

  const brand = weighted<Brand>(rng, [
    ["KIA", 46],
    ["MAZDA", 40],
    ["PEUGEOT", 9],
    ["BMW", 5],
  ]);

  const source = weighted<LeadSource>(rng, [
    ["FACEBOOK", 62],
    ["GOOGLE", 16],
    ["TIKTOK", 9],
    ["ZALO", 6],
    ["WEBSITE", 5],
    ["HOTLINE", 2],
  ]);

  const channelDetail = weighted<ChannelDetail>(rng, [
    ["TIN_NHAN", 45],
    ["FORM", 30],
    ["COMMENT", 12],
    ["CUOC_GOI", 8],
    ["CHAT_WEB", 5],
  ]);

  // Tỷ lệ liên hệ rất cao (~98%) giống hệ thống thật.
  const contacted = rng() < 0.976;

  let category: LeadCategory;
  if (!contacted) {
    category = rng() < 0.85 ? "CHUA_PHAN_LOAI" : "CHUA_LH_DUOC";
  } else {
    category = weighted<LeadCategory>(rng, [
      ["KHQT", 37],
      ["FAIL", 33],
      ["CHUA_PHAN_LOAI", 22],
      ["GDTD", 6],
      ["CHUA_LH_DUOC", 1.6],
      ["KHD", 0.4],
    ]);
  }

  const failReason: FailReason | null =
    category === "FAIL"
      ? weighted<FailReason>(rng, [
          ["SAI_SO", 44],
          ["KHONG_CO_NHU_CAU", 24],
          ["KH_TINH_KHAC", 16],
          ["CHI_KHAO_GIA", 6],
          ["KHAC", 4],
          ["NGOAI_KHA_NANG_TAI_CHINH", 3],
          ["DA_MUA_NOI_KHAC", 2],
          ["TRUNG_SPAM", 1],
        ])
      : null;

  // Khách có tên khi đã liên hệ được và không phải sai số.
  const hasName = contacted && failReason !== "SAI_SO" && rng() < 0.42;

  const interested = category === "KHQT" || category === "GDTD" || category === "KHD";
  const hasCarModel = interested ? rng() < 0.86 : rng() < 0.55;
  const carModel = hasCarModel ? pick(rng, CAR_MODELS_BY_BRAND[brand]) : null;

  const pushedToB10 = interested ? rng() < 0.72 : rng() < 0.28;
  const b10Status: B10Status = pushedToB10
    ? rng() < 0.94
      ? "DA_CO_TREN_B10"
      : "TRUNG_B10"
    : "CHUA_CO_TREN_B10";

  const contactCount = contacted ? 1 + Math.floor(rng() * 4) : 0;

  const lastContactAt = contacted
    ? new Date(createdAt.getTime() + Math.floor(rng() * 36) * 3600_000).toISOString()
    : null;

  // Hẹn gọi lại chỉ đặt cho khách còn sống; một phần đã quá hạn.
  let callbackAt: string | null = null;
  if (interested || category === "CHUA_PHAN_LOAI") {
    if (rng() < 0.35) {
      const offsetDays = Math.floor(rng() * 14) - 9;
      const d = new Date(createdAt);
      d.setDate(d.getDate() + Math.max(1, offsetDays + 9));
      callbackAt = d.toISOString();
    }
  }

  const showroom = pick(rng, SHOWROOMS);
  const salesRoom = pick(rng, SALES_ROOMS);
  const assignee = rng() < 0.94 ? pick(rng, ASSIGNEES) : null;

  return {
    id: `LEAD-${String(index + 1).padStart(5, "0")}`,
    createdAt: createdAt.toISOString(),
    name: hasName ? randomName(rng) : null,
    phone: randomPhone(rng),
    contactStatus: contacted ? "DA_LIEN_HE" : "CHUA_LIEN_HE",
    category,
    failReason,
    pushedToB10,
    b10Status,
    b10CareNote: pushedToB10 && rng() < 0.4 ? pick(rng, CARE_NOTES) : null,
    source,
    channelDetail,
    brand,
    showroom,
    salesRoom,
    assignee,
    carModel,
    careNote: contacted && rng() < 0.5 ? pick(rng, CARE_NOTES) : null,
    callbackAt,
    contactCount,
    lastContactAt,
    campaign: source === "FACEBOOK" || source === "TIKTOK" || source === "GOOGLE" ? pick(rng, CAMPAIGNS) : null,
    adContent: source === "FACEBOOK" || source === "TIKTOK" ? pick(rng, AD_CONTENTS) : null,
    costPerLead: source === "HOTLINE" ? null : Math.round((80 + rng() * 320) * 1000),
  };
}

function buildActivityLogs(lead: Lead, rng: () => number): ActivityLog[] {
  const logs: ActivityLog[] = [];
  const created = new Date(lead.createdAt);
  let cursor = created.getTime();
  let seq = 0;

  const push = (kind: ActivityLog["kind"], message: string, actor: string, byAi = false) => {
    seq += 1;
    logs.push({
      id: `${lead.id}-LOG-${seq}`,
      leadId: lead.id,
      kind,
      message,
      at: new Date(cursor).toISOString(),
      actor,
      byAi,
    });
  };

  push("CREATE", `Lead vào hệ thống từ ${lead.source}.`, "Hệ thống");

  if (lead.assignee) {
    cursor += 2 * 60_000;
    push("ASSIGN_CHANGE", `Đổi người phụ trách: Chưa giao → ${lead.assignee}.`, lead.salesRoom.split("_").pop() ?? "Quản lý");
  }

  const actor = lead.assignee ?? "Hệ thống";

  if (lead.contactStatus === "DA_LIEN_HE") {
    for (let i = 0; i < lead.contactCount; i++) {
      cursor += (20 + Math.floor(rng() * 240)) * 60_000;
      if (rng() < 0.18) {
        push("MISSED_CALL", "Gọi hụt — khách không bắt máy.", actor);
      } else {
        push("CALL", lead.careNote ?? pick(rng, CARE_NOTES), actor);
      }
    }
    cursor += 5 * 60_000;
    push("STATUS_CHANGE", "Đổi trạng thái: Chưa liên hệ → Đã liên hệ.", actor);
  }

  if (lead.category !== "CHUA_PHAN_LOAI") {
    cursor += 4 * 60_000;
    push("CATEGORY_CHANGE", `Cập nhật phân loại: ${lead.category}.`, actor);
  }

  if (lead.pushedToB10) {
    cursor += 30 * 60_000;
    push("B10_SYNC", "Đồng bộ B10 (DDMS): đã đối soát.", "Hệ thống");
  }

  return logs.sort((a, b) => b.at.localeCompare(a.at));
}

export interface DemoData {
  leads: Lead[];
  logsByLead: Map<string, ActivityLog[]>;
}

/**
 * Sinh bộ dữ liệu demo neo theo mốc `now` truyền vào. Script seed truyền thời
 * gian thực để dữ liệu trải đúng 90 ngày trước lúc nạp database.
 */
export function generateDemoData(now: Date = NOW): DemoData {
  const rng = createRng(20260805);
  const leads: Lead[] = [];
  for (let i = 0; i < TOTAL_LEADS; i++) leads.push(buildLead(i, rng, now));
  leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const logsByLead = new Map<string, ActivityLog[]>();
  const logRng = createRng(77712026);
  for (const lead of leads) logsByLead.set(lead.id, buildActivityLogs(lead, logRng));

  return { leads, logsByLead };
}

let cached: DemoData | null = null;

function build() {
  cached = generateDemoData(NOW);
  return cached;
}

export function getMockLeads(): Lead[] {
  return (cached ?? build()).leads;
}

export function getMockActivityLogs(leadId: string): ActivityLog[] {
  return (cached ?? build()).logsByLead.get(leadId) ?? [];
}

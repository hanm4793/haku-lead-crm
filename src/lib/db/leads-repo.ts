import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { activityLogs, appUsers, carModels, leads, salesRooms, showrooms } from "@/lib/db/schema";
import type { ActivityLog, Brand, Lead, LeadFilters, LeadKpis } from "@/lib/types";
import { UNASSIGNED_ASSIGNMENT_LABEL } from "@/lib/constants";
import { ratio } from "@/lib/utils";

/**
 * Phạm vi dữ liệu người dùng được xem. Luôn áp SAU bộ lọc do người dùng (hoặc
 * AI) gửi lên và không bao giờ nhận từ client — đây là ranh giới phân quyền.
 */
export interface ViewerScope {
  role: "ADMIN" | "SHOWROOM_MANAGER" | "SALES";
  showroomId?: string | null;
  appUserId?: string | null;
}

/**
 * Tiêu chí lọc dùng chung cho mọi đường vào: trang danh sách, trang báo cáo và
 * export do AI sinh ra. Bộ lọc của UI (`LeadFilters`, có khái niệm "tab") và
 * bộ lọc của AI (`ExportFilters`, có `overdueOnly`) đều quy về đây, nhờ vậy
 * logic dịch sang SQL chỉ tồn tại một bản.
 */
export interface LeadCriteria {
  search?: string;
  dateField?: "createdAt" | "callbackAt" | "lastContactAt";
  dateFrom?: string | null;
  dateTo?: string | null;
  contactStatus?: Lead["contactStatus"] | null;
  categories?: Lead["category"][];
  failReasons?: NonNullable<Lead["failReason"]>[];
  sources?: Lead["source"][];
  brands?: Brand[];
  showrooms?: string[];
  salesRooms?: string[];
  assignees?: string[];
  carModels?: string[];
  b10?: "ALL" | "PUSHED" | "NOT_PUSHED";
  overdueOnly?: boolean;
}

/**
 * Việt Nam không có giờ mùa hè nên chốt cứng +07:00 là chính xác, và tránh phụ
 * thuộc timezone của máy chạy server (Vercel chạy UTC).
 */
const TZ = "+07:00";

const dayStart = (date: string) => new Date(`${date}T00:00:00.000${TZ}`);
const dayEnd = (date: string) => new Date(`${date}T23:59:59.999${TZ}`);

function normalizeSearch(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** Lead quá hạn: có hẹn gọi lại đã trôi qua và khách vẫn còn trong phễu. */
export function overdueSql(now: Date) {
  // postgres.js không bind được Date thô trong sql`` — phải đưa ISO string.
  const at = now.toISOString();
  return sql`${leads.callbackAt} is not null
    and ${leads.callbackAt} < ${at}
    and ${leads.category} not in ('FAIL', 'KHD')`;
}

/** Hẹn gọi lại trong ngày hôm nay (theo giờ máy server / mốc `now` truyền vào). */
export function dueTodaySql(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return sql`${leads.callbackAt} is not null
    and ${leads.callbackAt} >= ${start.toISOString()}
    and ${leads.callbackAt} <= ${end.toISOString()}
    and ${leads.category} not in ('FAIL', 'KHD')`;
}

const DATE_COLUMNS = {
  createdAt: leads.createdAt,
  callbackAt: leads.callbackAt,
  lastContactAt: leads.lastContactAt,
} as const;

export function criteriaConditions(criteria: LeadCriteria, viewer: ViewerScope, now: Date): SQL[] {
  const parts: SQL[] = [];

  const search = normalizeSearch(criteria.search ?? "");
  if (search) {
    // unaccent để "nguyen" khớp được "Nguyễn" — extension bật ở migration 0001.
    parts.push(sql`lower(unaccent(coalesce(${leads.name}, '') || ' ' || ${leads.phone})) like ${`%${search}%`}`);
  }

  const dateColumn = DATE_COLUMNS[criteria.dateField ?? "createdAt"];
  if (criteria.dateFrom) parts.push(gte(dateColumn, dayStart(criteria.dateFrom)));
  if (criteria.dateTo) parts.push(lte(dateColumn, dayEnd(criteria.dateTo)));

  if (criteria.contactStatus) parts.push(eq(leads.contactStatus, criteria.contactStatus));
  if (criteria.sources?.length) parts.push(inArray(leads.source, criteria.sources));
  if (criteria.brands?.length) parts.push(inArray(leads.brand, criteria.brands));
  if (criteria.categories?.length) parts.push(inArray(leads.category, criteria.categories));
  if (criteria.failReasons?.length) parts.push(inArray(leads.failReason, criteria.failReasons));
  if (criteria.showrooms?.length) parts.push(inArray(showrooms.name, criteria.showrooms));
  if (criteria.salesRooms?.length) parts.push(inArray(salesRooms.name, criteria.salesRooms));
  if (criteria.assignees?.length) parts.push(inArray(appUsers.fullName, criteria.assignees));
  if (criteria.carModels?.length) parts.push(inArray(carModels.name, criteria.carModels));

  if (criteria.b10 === "PUSHED") parts.push(eq(leads.pushedToB10, true));
  if (criteria.b10 === "NOT_PUSHED") parts.push(eq(leads.pushedToB10, false));

  if (criteria.overdueOnly) parts.push(overdueSql(now));

  parts.push(...scopeConditions(viewer));
  return parts;
}

export function scopeConditions(viewer: ViewerScope): SQL[] {
  if (viewer.role === "SHOWROOM_MANAGER" && viewer.showroomId) {
    return [eq(leads.showroomId, viewer.showroomId)];
  }
  if (viewer.role === "SALES" && viewer.appUserId) {
    return [eq(leads.assigneeId, viewer.appUserId)];
  }
  return [];
}

/** Bộ lọc của trang danh sách; `includeTab` để tách ra bản dùng đếm số trên tab. */
export function criteriaFromLeadFilters(filters: LeadFilters, includeTab = true): LeadCriteria {
  const criteria: LeadCriteria = {
    search: filters.search,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sources: filters.sources,
    brands: filters.brands,
    showrooms: filters.showrooms,
    salesRooms: filters.salesRooms,
    assignees: filters.assignees,
    carModels: filters.carModels,
    categories: filters.categories,
    failReasons: filters.failReasons,
    b10: filters.b10,
  };

  if (!includeTab) return criteria;

  if (filters.tab === "CHUA_LIEN_HE") criteria.contactStatus = "CHUA_LIEN_HE";
  if (filters.tab === "DA_LIEN_HE") criteria.contactStatus = "DA_LIEN_HE";
  if (filters.tab === "QUA_HAN") criteria.overdueOnly = true;

  return criteria;
}

const LEAD_SELECTION = {
  id: leads.id,
  createdAt: leads.createdAt,
  name: leads.name,
  phone: leads.phone,
  contactStatus: leads.contactStatus,
  category: leads.category,
  failReason: leads.failReason,
  pushedToB10: leads.pushedToB10,
  b10Status: leads.b10Status,
  b10CareNote: leads.b10CareNote,
  source: leads.source,
  channelDetail: leads.channelDetail,
  brand: leads.brand,
  showroom: showrooms.name,
  salesRoom: salesRooms.name,
  assignee: appUsers.fullName,
  carModel: carModels.name,
  careNote: leads.careNote,
  callbackAt: leads.callbackAt,
  contactCount: leads.contactCount,
  lastContactAt: leads.lastContactAt,
  campaign: leads.campaign,
  adContent: leads.adContent,
  costPerLead: leads.costPerLead,
};

interface LeadRow {
  id: string;
  createdAt: Date;
  name: string | null;
  phone: string;
  contactStatus: Lead["contactStatus"];
  category: Lead["category"];
  failReason: Lead["failReason"];
  pushedToB10: boolean;
  b10Status: Lead["b10Status"];
  b10CareNote: string | null;
  source: Lead["source"];
  channelDetail: Lead["channelDetail"];
  brand: Lead["brand"];
  showroom: string | null;
  salesRoom: string | null;
  assignee: string | null;
  carModel: string | null;
  careNote: string | null;
  callbackAt: Date | null;
  contactCount: number;
  lastContactAt: Date | null;
  campaign: string | null;
  adContent: string | null;
  costPerLead: number | null;
}

/** Đưa hàng từ database về đúng shape `Lead` mà toàn bộ UI đang dùng. */
function toLead(row: LeadRow): Lead {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    callbackAt: row.callbackAt?.toISOString() ?? null,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    showroom: row.showroom ?? UNASSIGNED_ASSIGNMENT_LABEL,
    salesRoom: row.salesRoom ?? UNASSIGNED_ASSIGNMENT_LABEL,
  };
}

/** Cột nào sắp xếp bằng gì — cột nối bảng thì sắp theo tên đã join. */
const SORTABLE: Record<string, SQLWrapper> = {
  createdAt: leads.createdAt,
  name: leads.name,
  phone: leads.phone,
  contactStatus: leads.contactStatus,
  category: leads.category,
  failReason: leads.failReason,
  pushedToB10: leads.pushedToB10,
  b10Status: leads.b10Status,
  source: leads.source,
  channelDetail: leads.channelDetail,
  brand: leads.brand,
  showroom: showrooms.name,
  salesRoom: salesRooms.name,
  assignee: appUsers.fullName,
  carModel: carModels.name,
  careNote: leads.careNote,
  callbackAt: leads.callbackAt,
  contactCount: leads.contactCount,
  lastContactAt: leads.lastContactAt,
  campaign: leads.campaign,
  adContent: leads.adContent,
  costPerLead: leads.costPerLead,
};

/**
 * Bốn bảng tham chiếu phải join ở mọi truy vấn vì bộ lọc và sắp xếp đều có thể
 * chạm vào tên showroom, phòng bán hàng, người phụ trách hoặc dòng xe.
 *
 * Kiểu builder của Drizzle không chịu được selection dạng generic, nên tách
 * thành hai helper với selection cố định thay vì một helper nhận tham số.
 */
function selectLeadRows() {
  return getDb()
    .select(LEAD_SELECTION)
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id));
}

/**
 * Một selection đếm dùng cho cả KPI và số trên tab. Hai truy vấn chỉ khác điều
 * kiện WHERE, còn cùng một lần quét bảng nên tính thừa vài aggregate không tốn
 * thêm gì đáng kể.
 */
function selectLeadCounts(now: Date) {
  return getDb()
    .select({
      total: sql<number>`count(*)::int`,
      contacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'DA_LIEN_HE')::int`,
      notContacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'CHUA_LIEN_HE')::int`,
      khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
      gdtd: sql<number>`count(*) filter (where ${leads.category} in ('GDTD', 'KHD'))::int`,
      khd: sql<number>`count(*) filter (where ${leads.category} = 'KHD')::int`,
      failed: sql<number>`count(*) filter (where ${leads.category} = 'FAIL')::int`,
      overdue: sql<number>`count(*) filter (where ${overdueSql(now)})::int`,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id));
}

export interface LeadPage {
  rows: Lead[];
  total: number;
  kpis: LeadKpis;
  tabCounts: Record<LeadFilters["tab"], number>;
}

export interface LeadPageOptions {
  filters: LeadFilters;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  now?: Date;
}

/**
 * Truy vấn trang danh sách: hàng của trang hiện tại, KPI theo bộ lọc đang áp,
 * và số lượng trên từng tab — gộp lại để trang chỉ cần một round trip.
 */
export async function queryLeadPage(options: LeadPageOptions, viewer: ViewerScope): Promise<LeadPage> {
  const now = options.now ?? new Date();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, options.pageSize ?? 50));

  const scoped = criteriaConditions(criteriaFromLeadFilters(options.filters, true), viewer, now);
  const withoutTab = criteriaConditions(criteriaFromLeadFilters(options.filters, false), viewer, now);

  const sortColumn = SORTABLE[options.sortBy ?? "createdAt"] ?? leads.createdAt;
  const direction = options.sortOrder === "asc" ? asc : desc;

  const [rows, [kpi], [tabs]] = await Promise.all([
    selectLeadRows()
      .where(and(...scoped))
      // Thêm id vào khóa sắp xếp để phân trang không bị nhảy hàng khi trùng giá trị.
      .orderBy(direction(sortColumn), desc(leads.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    selectLeadCounts(now).where(and(...scoped)),
    // Số trên tab đếm theo bộ lọc nhưng bỏ qua chính tab đang chọn.
    selectLeadCounts(now).where(and(...withoutTab)),
  ]);

  return {
    rows: rows.map(toLead),
    total: kpi.total,
    kpis: {
      total: kpi.total,
      contacted: kpi.contacted,
      contactRate: ratio(kpi.contacted, kpi.total),
      khqt: kpi.khqt,
      khqtRate: ratio(kpi.khqt, kpi.contacted),
      gdtd: kpi.gdtd,
      khd: kpi.khd,
      failed: kpi.failed,
      failRate: ratio(kpi.failed, kpi.total),
      overdue: kpi.overdue,
    },
    tabCounts: {
      ALL: tabs.total,
      CHUA_LIEN_HE: tabs.notContacted,
      DA_LIEN_HE: tabs.contacted,
      QUA_HAN: tabs.overdue,
    },
  };
}

/**
 * Lấy toàn bộ lead khớp tiêu chí, không phân trang. Dùng cho export và tính chỉ
 * số báo cáo; `limit` là trần cứng để một bộ lọc quá rộng không kéo sập bộ nhớ.
 */
export async function queryLeadsByCriteria(
  criteria: LeadCriteria,
  viewer: ViewerScope,
  options: { sortBy?: string; sortOrder?: "asc" | "desc"; limit?: number; now?: Date } = {},
): Promise<Lead[]> {
  const now = options.now ?? new Date();
  const sortColumn = SORTABLE[options.sortBy ?? "createdAt"] ?? leads.createdAt;
  const direction = options.sortOrder === "asc" ? asc : desc;

  const rows = await selectLeadRows()
    .where(and(...criteriaConditions(criteria, viewer, now)))
    .orderBy(direction(sortColumn), desc(leads.id))
    .limit(Math.min(options.limit ?? 20000, 50000));

  return rows.map(toLead);
}

export async function getLeadById(id: string, viewer: ViewerScope): Promise<Lead | null> {
  const rows = await selectLeadRows()
    .where(and(eq(leads.id, id), ...scopeConditions(viewer)))
    .limit(1);

  return rows.length ? toLead(rows[0]) : null;
}

export async function getActivityLogs(leadId: string): Promise<ActivityLog[]> {
  const rows = await getDb()
    .select({
      id: activityLogs.id,
      leadId: activityLogs.leadId,
      kind: activityLogs.kind,
      message: activityLogs.message,
      at: activityLogs.at,
      actor: activityLogs.actorName,
      byAi: activityLogs.byAi,
    })
    .from(activityLogs)
    .where(eq(activityLogs.leadId, leadId))
    .orderBy(desc(activityLogs.at));

  return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
}

export interface LeadPatch {
  contactStatus?: Lead["contactStatus"];
  category?: Lead["category"];
  failReason?: Lead["failReason"];
  source?: Lead["source"];
  channelDetail?: Lead["channelDetail"];
  /** Tên người phụ trách; repository tự đổi sang khóa ngoại. */
  assignee?: string | null;
  /** Tên dòng xe; repository tự đổi sang khóa ngoại. */
  carModel?: string | null;
  careNote?: string | null;
  callbackAt?: string | null;
}

export interface LogDraft {
  kind: ActivityLog["kind"];
  message: string;
  byAi?: boolean;
}

export interface Actor {
  appUserId?: string | null;
  fullName: string;
}

/**
 * Ghi thêm nhật ký mà không đổi trường lead — dùng cho ghi chú tay hoặc thao tác
 * AI không kèm patch. Vẫn kiểm tra quyền xem lead trước khi chèn.
 */
export async function appendActivityLog(
  leadId: string,
  logs: LogDraft[],
  viewer: ViewerScope,
  actor: Actor,
): Promise<ActivityLog[] | null> {
  if (!logs.length) return getActivityLogs(leadId);

  const current = await getLeadById(leadId, viewer);
  if (!current) return null;

  await getDb().insert(activityLogs).values(
    logs.map((log) => ({
      leadId,
      kind: log.kind,
      message: log.message,
      actorId: actor.appUserId ?? null,
      actorName: log.byAi ? "Trợ lý AI" : actor.fullName,
      byAi: log.byAi ?? false,
    })),
  );

  return getActivityLogs(leadId);
}

/**
 * Cập nhật lead và ghi lịch sử trong cùng một transaction.
 *
 * Điều kiện phân quyền nằm ngay trong WHERE của câu UPDATE, nên người không có
 * quyền xem lead cũng không thể sửa nó — không phụ thuộc vào việc caller có nhớ
 * kiểm tra trước hay không. Trả về `null` khi lead không tồn tại hoặc ngoài
 * phạm vi của người dùng.
 */
export async function updateLead(
  id: string,
  patch: LeadPatch,
  logs: LogDraft[],
  viewer: ViewerScope,
  actor: Actor,
): Promise<Lead | null> {
  const current = await getLeadById(id, viewer);
  if (!current) return null;

  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.contactStatus !== undefined) values.contactStatus = patch.contactStatus;
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.failReason !== undefined) values.failReason = patch.failReason;
  if (patch.source !== undefined) values.source = patch.source;
  if (patch.channelDetail !== undefined) values.channelDetail = patch.channelDetail;
  if (patch.careNote !== undefined) values.careNote = patch.careNote;
  if (patch.callbackAt !== undefined) {
    values.callbackAt = patch.callbackAt ? new Date(patch.callbackAt) : null;
  }
  if (patch.assignee !== undefined) {
    values.assigneeId = patch.assignee ? await resolveAssigneeId(patch.assignee) : null;
  }
  if (patch.carModel !== undefined) {
    values.carModelId = patch.carModel ? await resolveCarModelId(patch.carModel, current.brand) : null;
  }

  await getDb().transaction(async (tx) => {
    await tx
      .update(leads)
      .set(values)
      .where(and(eq(leads.id, id), ...scopeConditions(viewer)));

    if (logs.length) {
      await tx.insert(activityLogs).values(
        logs.map((log) => ({
          leadId: id,
          kind: log.kind,
          message: log.message,
          actorId: actor.appUserId ?? null,
          actorName: log.byAi ? "Trợ lý AI" : actor.fullName,
          byAi: log.byAi ?? false,
        })),
      );
    }
  });

  return getLeadById(id, viewer);
}

async function resolveAssigneeId(fullName: string) {
  const rows = await getDb()
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.fullName, fullName))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Tên dòng xe chỉ unique trong phạm vi một hãng, nên ưu tiên khớp theo hãng của
 * lead rồi mới nới ra khớp theo tên.
 */
async function resolveCarModelId(name: string, brand: Lead["brand"]) {
  const db = getDb();
  if (brand) {
    const exact = await db
      .select({ id: carModels.id })
      .from(carModels)
      .where(and(eq(carModels.name, name), eq(carModels.brand, brand)))
      .limit(1);
    if (exact[0]) return exact[0].id;
  }

  const fallback = await db.select({ id: carModels.id }).from(carModels).where(eq(carModels.name, name)).limit(1);
  return fallback[0]?.id ?? null;
}

export interface ReferenceData {
  showrooms: string[];
  salesRooms: string[];
  assignees: string[];
  carModelsByBrand: Record<string, string[]>;
}

/** Danh mục cho các dropdown — thay cho hằng số cứng trong constants.ts. */
export async function getReferenceData(): Promise<ReferenceData> {
  const db = getDb();
  const [showroomRows, salesRoomRows, userRows, modelRows] = await Promise.all([
    db
      .select({ name: showrooms.name })
      .from(showrooms)
      .where(eq(showrooms.active, true))
      .orderBy(asc(showrooms.sortOrder), asc(showrooms.name)),
    db
      .select({ name: salesRooms.name })
      .from(salesRooms)
      .where(eq(salesRooms.active, true))
      .orderBy(asc(salesRooms.name)),
    db
      .select({ name: appUsers.fullName })
      .from(appUsers)
      .where(eq(appUsers.active, true))
      .orderBy(asc(appUsers.fullName)),
    db
      .select({ brand: carModels.brand, name: carModels.name })
      .from(carModels)
      .where(eq(carModels.active, true))
      .orderBy(asc(carModels.brand), asc(carModels.name)),
  ]);

  const carModelsByBrand: Record<string, string[]> = {};
  for (const row of modelRows) {
    (carModelsByBrand[row.brand] ??= []).push(row.name);
  }

  return {
    showrooms: showroomRows.map((r) => r.name),
    salesRooms: salesRoomRows.map((r) => r.name),
    assignees: userRows.map((r) => r.name),
    carModelsByBrand,
  };
}

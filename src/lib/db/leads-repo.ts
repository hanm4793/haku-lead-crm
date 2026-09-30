import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { listAttrFields, type AttrFieldRow } from "@/lib/db/attr-fields-repo";
import { getDb } from "@/lib/db/client";
import { activityLogs, appUsers, brands, leads, locations, products } from "@/lib/db/schema";
import { getCatalogLabels, getDefaultProject, getProjectById, toProjectInfo } from "@/lib/db/project-repo";
import { canEditLead, dataScope, type UserRole } from "@/lib/auth/roles";
import type {
  ActivityLog,
  BrandCode,
  CatalogLabels,
  Lead,
  LeadFilters,
  LeadKpis,
  ProjectInfo,
} from "@/lib/types";
import { UNASSIGNED_ASSIGNMENT_LABEL } from "@/lib/constants";
import { ratio } from "@/lib/utils";

/**
 * Phạm vi dữ liệu người dùng được xem. Luôn áp SAU bộ lọc do người dùng (hoặc
 * AI) gửi lên và không bao giờ nhận từ client — đây là ranh giới phân quyền.
 */
export interface ViewerScope {
  role: UserRole;
  locationId?: string | null;
  appUserId?: string | null;
  /** app_users.project_id — null với super admin. */
  projectId?: string | null;
  /** Membership project (`project_members`). */
  projectIds?: string[];
  partnerId?: string | null;
  /** Project đang làm việc (cookie / gán tài khoản). Dùng lọc lead và catalog. */
  activeProjectId?: string | null;
  /** Fanpage được xem. Super admin bỏ qua danh sách này. Rỗng nghĩa là không thấy lead nào. */
  pageIds: string[];
  aiEnabled?: boolean;
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
  /** Mã brand (brands.code). */
  brands?: BrandCode[];
  /** Tên location (locations.name). */
  locations?: string[];
  assignees?: string[];
  /** Tên sản phẩm (products.name). */
  products?: string[];
  facebookPageIds?: string[];
  overdueOnly?: boolean;
  /** Khớp một phần tên chiến dịch, không phân biệt dấu. */
  campaignContains?: string;
  /** Khớp một phần tên người phụ trách. */
  assigneeContains?: string;
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
  if (criteria.brands?.length) parts.push(inArray(brands.code, criteria.brands));
  if (criteria.categories?.length) parts.push(inArray(leads.category, criteria.categories));
  if (criteria.failReasons?.length) parts.push(inArray(leads.failReason, criteria.failReasons));
  if (criteria.locations?.length) parts.push(inArray(locations.name, criteria.locations));
  if (criteria.assignees?.length) parts.push(inArray(appUsers.fullName, criteria.assignees));
  if (criteria.assigneeContains) {
    const name = normalizeSearch(criteria.assigneeContains);
    if (name) {
      parts.push(sql`lower(unaccent(coalesce(${appUsers.fullName}, ''))) like ${`%${name}%`}`);
    }
  }
  if (criteria.products?.length) parts.push(inArray(products.name, criteria.products));
  if (criteria.campaignContains) {
    const campaign = normalizeSearch(criteria.campaignContains);
    if (campaign) {
      parts.push(sql`lower(unaccent(coalesce(${leads.campaign}, ''))) like ${`%${campaign}%`}`);
    }
  }
  if (criteria.facebookPageIds?.length) {
    parts.push(inArray(leads.facebookPageId, criteria.facebookPageIds));
  }

  if (criteria.overdueOnly) parts.push(overdueSql(now));

  parts.push(...scopeConditions(viewer));
  return parts;
}

export function scopeConditions(viewer: ViewerScope): SQL[] {
  const parts: SQL[] = [];
  if (viewer.activeProjectId) {
    parts.push(eq(leads.projectId, viewer.activeProjectId));
  }
  const scope = dataScope(viewer);
  if (scope === "none") return [sql`false`];
  if (scope === "granted-pages") {
    parts.push(inArray(leads.facebookPageId, viewer.pageIds));
  }
  return parts;
}

/** Bộ lọc của trang danh sách; `includeTab` để tách ra bản dùng đếm số trên tab. */
export function criteriaFromLeadFilters(filters: LeadFilters, includeTab = true): LeadCriteria {
  const criteria: LeadCriteria = {
    search: filters.search,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sources: filters.sources,
    brands: filters.brands,
    locations: filters.locations,
    assignees: filters.assignees,
    products: filters.products,
    categories: filters.categories,
    failReasons: filters.failReasons,
    facebookPageIds: filters.facebookPageIds,
  };

  if (!includeTab) return criteria;

  if (filters.tab === "CHUA_LIEN_HE") criteria.contactStatus = "CHUA_LIEN_HE";
  if (filters.tab === "DA_LIEN_HE") criteria.contactStatus = "DA_LIEN_HE";
  if (filters.tab === "QUA_HAN") criteria.overdueOnly = true;

  return criteria;
}

/**
 * Selection chuẩn cho một dòng lead — dùng chung với report-queries để mọi
 * chỗ trả `Lead` có cùng shape.
 */
export const LEAD_SELECTION = {
  id: leads.id,
  createdAt: leads.createdAt,
  name: leads.name,
  phone: leads.phone,
  contactStatus: leads.contactStatus,
  category: leads.category,
  failReason: leads.failReason,
  source: leads.source,
  channelDetail: leads.channelDetail,
  brand: brands.code,
  brandId: leads.brandId,
  location: locations.name,
  locationId: leads.locationId,
  assigneeId: leads.assigneeId,
  assignee: appUsers.fullName,
  product: products.name,
  productId: leads.productId,
  attrs: leads.attrs,
  careNote: leads.careNote,
  callbackAt: leads.callbackAt,
  contactCount: leads.contactCount,
  lastContactAt: leads.lastContactAt,
  campaign: leads.campaign,
  adContent: leads.adContent,
  costPerLead: leads.costPerLead,
  facebookPageId: leads.facebookPageId,
};

export interface LeadRow {
  id: string;
  createdAt: Date;
  name: string | null;
  phone: string;
  contactStatus: Lead["contactStatus"];
  category: Lead["category"];
  failReason: Lead["failReason"];
  source: Lead["source"];
  channelDetail: Lead["channelDetail"];
  brand: string | null;
  brandId: string | null;
  location: string | null;
  locationId: string | null;
  assigneeId: string | null;
  assignee: string | null;
  product: string | null;
  productId: string | null;
  attrs: Record<string, string> | null;
  careNote: string | null;
  callbackAt: Date | null;
  contactCount: number;
  lastContactAt: Date | null;
  campaign: string | null;
  adContent: string | null;
  costPerLead: number | null;
  facebookPageId: string | null;
}

/** Đưa hàng từ database về đúng shape `Lead` mà toàn bộ UI đang dùng. */
export function toLead(row: LeadRow): Lead {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    callbackAt: row.callbackAt?.toISOString() ?? null,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    location: row.location ?? UNASSIGNED_ASSIGNMENT_LABEL,
    attrs: row.attrs ?? {},
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
  source: leads.source,
  channelDetail: leads.channelDetail,
  brand: brands.code,
  location: locations.name,
  assignee: appUsers.fullName,
  product: products.name,
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
 * chạm vào brand, location, người phụ trách hoặc sản phẩm.
 *
 * Kiểu builder của Drizzle không chịu được selection dạng generic, nên tách
 * thành hai helper với selection cố định thay vì một helper nhận tham số.
 */
function selectLeadRows() {
  return getDb()
    .select(LEAD_SELECTION)
    .from(leads)
    .leftJoin(brands, eq(leads.brandId, brands.id))
    .leftJoin(locations, eq(leads.locationId, locations.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(products, eq(leads.productId, products.id));
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
    .leftJoin(brands, eq(leads.brandId, brands.id))
    .leftJoin(locations, eq(leads.locationId, locations.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(products, eq(leads.productId, products.id));
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
      uncontacted: kpi.total - kpi.contacted,
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
  /** Mã brand (brands.code); repository tự đổi sang khóa ngoại. */
  brand?: BrandCode | null;
  /** Tên sản phẩm; repository tự đổi sang khóa ngoại. */
  product?: string | null;
  /** Tên location; repository tự đổi sang khóa ngoại. */
  location?: string | null;
  careNote?: string | null;
  callbackAt?: string | null;
  /** Giá trị field phụ đã validate; key không thuộc định nghĩa active giữ nguyên từ DB. */
  attrs?: Record<string, string>;
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
  if (!canEditLead(viewer, current)) {
    throw new Error("Chỉ được sửa lead được phân công cho bạn.");
  }

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
  if (!canEditLead(viewer, current)) {
    throw new Error("Chỉ được sửa lead được phân công cho bạn.");
  }

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

  // Brand quyết định tập sản phẩm hợp lệ, nên resolve brand trước rồi mới tới product.
  let brandCode: BrandCode | null = current.brand;
  if (patch.brand !== undefined) {
    brandCode = patch.brand;
    values.brandId = patch.brand ? await resolveBrandId(patch.brand) : null;
    // Đổi brand mà không nói gì về product thì bỏ product cũ (thuộc brand khác).
    if (patch.product === undefined && patch.brand !== current.brand) values.productId = null;
  }
  if (patch.product !== undefined) {
    values.productId = patch.product ? await resolveProductId(patch.product, brandCode) : null;
  }
  if (patch.location !== undefined) {
    values.locationId = patch.location ? await resolveLocationId(patch.location) : null;
  }
  if (patch.attrs !== undefined) {
    const projectId = await resolveLeadProjectId(id);
    if (!projectId) throw new Error("Lead chưa gắn project.");
    values.attrs = await mergeLeadAttrs(projectId, current.attrs ?? {}, patch.attrs);
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

async function resolveLeadProjectId(leadId: string): Promise<string | null> {
  const [row] = await getDb().select({ projectId: leads.projectId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  return row?.projectId ?? null;
}

function validateAttrValue(def: AttrFieldRow, raw: string): string {
  const value = raw.trim();
  if (!value) {
    if (def.required) throw new Error(`Field "${def.label}" là bắt buộc.`);
    return "";
  }
  if (def.fieldType === "number" && Number.isNaN(Number(value))) {
    throw new Error(`Field "${def.label}" phải là số.`);
  }
  if (def.fieldType === "select" && !def.options.includes(value)) {
    throw new Error(`Giá trị không hợp lệ cho "${def.label}".`);
  }
  return value;
}

/** Giữ key lạ + field tắt; thay giá trị field đang bật từ client. */
async function mergeLeadAttrs(
  projectId: string,
  current: Record<string, string>,
  incoming: Record<string, string>,
): Promise<Record<string, string>> {
  const defs = await listAttrFields(projectId);
  const activeKeys = new Set(defs.filter((d) => d.active).map((d) => d.key));
  const knownKeys = new Set(defs.map((d) => d.key));

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    if (!knownKeys.has(key) || !activeKeys.has(key)) merged[key] = value;
  }
  for (const def of defs) {
    if (!def.active) continue;
    const value = validateAttrValue(def, incoming[def.key] ?? "");
    if (value) merged[def.key] = value;
  }
  return merged;
}

async function resolveAssigneeId(fullName: string) {
  const rows = await getDb()
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.fullName, fullName))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Brand theo mã, trong project mặc định. */
export async function resolveBrandId(code: BrandCode): Promise<string | null> {
  const project = await getDefaultProject();
  const conditions = [eq(brands.code, code)];
  if (project) conditions.push(eq(brands.projectId, project.id));
  const rows = await getDb()
    .select({ id: brands.id })
    .from(brands)
    .where(and(...conditions))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Tên sản phẩm chỉ unique trong phạm vi một brand, nên ưu tiên khớp theo brand
 * của lead rồi mới nới ra khớp theo tên.
 */
export async function resolveProductId(name: string, brandCode: BrandCode | null): Promise<string | null> {
  const db = getDb();
  if (brandCode) {
    const exact = await db
      .select({ id: products.id })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.name, name), eq(brands.code, brandCode)))
      .limit(1);
    if (exact[0]) return exact[0].id;
  }

  const fallback = await db.select({ id: products.id }).from(products).where(eq(products.name, name)).limit(1);
  return fallback[0]?.id ?? null;
}

/** Location theo tên, trong project mặc định. */
export async function resolveLocationId(name: string): Promise<string | null> {
  const project = await getDefaultProject();
  const conditions = [eq(locations.name, name)];
  if (project) conditions.push(eq(locations.projectId, project.id));
  const rows = await getDb()
    .select({ id: locations.id })
    .from(locations)
    .where(and(...conditions))
    .limit(1);
  return rows[0]?.id ?? null;
}

export interface BrandOption {
  code: BrandCode;
  name: string;
}

export interface ReferenceData {
  project: ProjectInfo | null;
  labels: CatalogLabels;
  brands: BrandOption[];
  locations: string[];
  assignees: string[];
  /** brand code → tên sản phẩm đang bật. */
  productsByBrand: Record<string, string[]>;
}

/** Danh mục cho các dropdown — đọc từ DB theo project (mặc định nếu không truyền). */
export async function getReferenceData(projectId?: string): Promise<ReferenceData> {
  const db = getDb();
  const project = projectId
    ? await getProjectById(projectId)
    : await getDefaultProject();
  const resolvedProjectId = project?.id;

  const [brandRows, locationRows, userRows, productRows] = await Promise.all([
    db
      .select({ code: brands.code, name: brands.name })
      .from(brands)
      .where(and(eq(brands.active, true), resolvedProjectId ? eq(brands.projectId, resolvedProjectId) : undefined))
      .orderBy(asc(brands.sortOrder), asc(brands.name)),
    db
      .select({ name: locations.name })
      .from(locations)
      .where(and(eq(locations.active, true), resolvedProjectId ? eq(locations.projectId, resolvedProjectId) : undefined))
      .orderBy(asc(locations.sortOrder), asc(locations.name)),
    db
      .select({ name: appUsers.fullName })
      .from(appUsers)
      .where(eq(appUsers.active, true))
      .orderBy(asc(appUsers.fullName)),
    db
      .select({ brand: brands.code, name: products.name })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.active, true), resolvedProjectId ? eq(products.projectId, resolvedProjectId) : undefined))
      .orderBy(asc(brands.sortOrder), asc(brands.code), asc(products.name)),
  ]);

  const productsByBrand: Record<string, string[]> = {};
  for (const row of productRows) {
    (productsByBrand[row.brand] ??= []).push(row.name);
  }

  return {
    project: project ? toProjectInfo(project) : null,
    labels: getCatalogLabels(project),
    brands: brandRows,
    locations: locationRows.map((r) => r.name),
    assignees: userRows.map((r) => r.name),
    productsByBrand,
  };
}

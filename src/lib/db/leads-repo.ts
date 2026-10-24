import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { listAttrFields, type AttrFieldRow } from "@/lib/db/attr-fields-repo";
import { getDb } from "@/lib/db/client";
import { activityLogs, appUsers, brands, leads, locations, products } from "@/lib/db/schema";
import { getCatalogLabels, getDefaultProject, getProjectById, toProjectInfo } from "@/lib/db/project-repo";
import { listAssignableStaff } from "@/lib/db/users-repo";
import {
  canCreateLead,
  canEditLead,
  canEditLeadProfile,
  canImportLeads,
  dataScope,
  resolveManualLeadAssignee,
  type UserRole,
} from "@/lib/auth/roles";
import type {
  ActivityLog,
  BrandCode,
  CatalogLabels,
  ChannelDetail,
  ContactStatus,
  FailReason,
  Lead,
  LeadCategory,
  LeadFilters,
  LeadKpis,
  ProjectInfo,
} from "@/lib/types";
import {
  CATEGORY_LONG_LABEL,
  CONTACT_STATUS_LABEL,
  UNASSIGNED_ASSIGNMENT_LABEL,
  UNASSIGNED_FILTER_VALUE,
} from "@/lib/constants";
import { getLatestDataTimestamp } from "@/lib/facebook/last-sync";
import { normalizePhone, phoneKey, validatePhone } from "@/lib/leads/phone";
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

/**
 * Chuẩn hóa chuỗi ngày/giờ hẹn gọi lại sang Date:
 * - "YYYY-MM-DD" (chỉ chọn ngày): hiểu là cuối ngày 23:59:59+07:00 để không bị tính quá hạn lúc sáng sớm.
 * - "YYYY-MM-DDTHH:mm" (từ <input type="datetime-local">): hiểu theo múi giờ Việt Nam +07:00.
 * - Các chuỗi ISO có offset sẵn: parse trực tiếp.
 */
export function parseCallbackAt(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    d = new Date(`${trimmed}T23:59:59${TZ}`);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    d = new Date(`${trimmed}:00${TZ}`);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    d = new Date(`${trimmed}${TZ}`);
  } else {
    d = new Date(trimmed);
  }

  return Number.isNaN(d.getTime()) ? null : d;
}

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

/** Hẹn gọi lại trong ngày hôm nay (tính theo múi giờ Việt Nam +07:00). */
export function dueTodaySql(now: Date) {
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = vnNow.getUTCFullYear();
  const mm = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(vnNow.getUTCDate()).padStart(2, "0");
  const todayVn = `${yyyy}-${mm}-${dd}`;
  const start = dayStart(todayVn);
  const end = dayEnd(todayVn);
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
    const searchDigits = phoneKey(search);
    if (searchDigits.length >= 3 && /^[\d+\s().-]+$/.test(search)) {
      parts.push(
        sql`(lower(unaccent(coalesce(${leads.name}, '') || ' ' || ${leads.phone})) like ${`%${search}%`} or regexp_replace(regexp_replace(regexp_replace(${leads.phone}, '\\D', '', 'g'), '^840(\\d{9})$', '0\\1'), '^84(\\d{9})$', '0\\1') like ${`%${searchDigits}%`})`,
      );
    } else {
      // unaccent để "nguyen" khớp được "Nguyễn" — extension bật ở migration 0001.
      parts.push(sql`lower(unaccent(coalesce(${leads.name}, '') || ' ' || ${leads.phone})) like ${`%${search}%`}`);
    }
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
  if (criteria.assignees?.length) {
    const hasUnassigned = criteria.assignees.includes(UNASSIGNED_FILTER_VALUE);
    const namedAssignees = criteria.assignees.filter((a) => a !== UNASSIGNED_FILTER_VALUE);
    if (hasUnassigned && namedAssignees.length > 0) {
      parts.push(or(isNull(leads.assigneeId), inArray(appUsers.fullName, namedAssignees))!);
    } else if (hasUnassigned) {
      parts.push(isNull(leads.assigneeId));
    } else if (namedAssignees.length > 0) {
      parts.push(inArray(appUsers.fullName, namedAssignees));
    }
  }
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
  if (viewer.role !== "SUPER_ADMIN" && !viewer.activeProjectId) {
    return [sql`false`];
  }
  const parts: SQL[] = [];
  if (viewer.activeProjectId) {
    parts.push(eq(leads.projectId, viewer.activeProjectId));
  }
  const scope = dataScope(viewer);
  if (scope === "none") {
    if (viewer.activeProjectId) {
      parts.push(eq(leads.source, "MANUAL"));
      return parts;
    }
    return [sql`false`];
  }
  if (scope === "granted-pages") {
    parts.push(or(inArray(leads.facebookPageId, viewer.pageIds), eq(leads.source, "MANUAL"))!);
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
export const LEAD_LIST_SELECTION = {
  ...LEAD_SELECTION,
  attrs: sql<Record<string, string> | null>`null`,
  campaign: sql<string | null>`null`,
  adContent: sql<string | null>`null`,
  costPerLead: sql<number | null>`null`,
  facebookPageId: sql<string | null>`null`,
};

function selectLeadListRows(includeAttrs = false) {
  return getDb()
    .select(includeAttrs ? LEAD_SELECTION : LEAD_LIST_SELECTION)
    .from(leads)
    .leftJoin(brands, eq(leads.brandId, brands.id))
    .leftJoin(locations, eq(leads.locationId, locations.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(products, eq(leads.productId, products.id));
}

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
export function criteriaNeedsCatalogJoins(criteria: LeadCriteria): boolean {
  const hasNamedAssignee = Boolean(
    criteria.assignees?.some((a) => a !== UNASSIGNED_FILTER_VALUE) || criteria.assigneeContains?.trim(),
  );
  return Boolean(
    criteria.brands?.length ||
      criteria.locations?.length ||
      hasNamedAssignee ||
      criteria.products?.length,
  );
}

function selectLeadCounts(now: Date, withCatalogJoins = true) {
  const selection = {
    total: sql<number>`count(*)::int`,
    contacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'DA_LIEN_HE')::int`,
    notContacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'CHUA_LIEN_HE')::int`,
    khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
    gdtd: sql<number>`count(*) filter (where ${leads.category} in ('GDTD', 'KHD'))::int`,
    khd: sql<number>`count(*) filter (where ${leads.category} = 'KHD')::int`,
    failed: sql<number>`count(*) filter (where ${leads.category} = 'FAIL')::int`,
    overdue: sql<number>`count(*) filter (where ${overdueSql(now)})::int`,
  };
  const base = getDb().select(selection).from(leads).$dynamic();
  if (!withCatalogJoins) return base;
  return base
    .leftJoin(brands, eq(leads.brandId, brands.id))
    .leftJoin(locations, eq(leads.locationId, locations.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(products, eq(leads.productId, products.id));
}

function _legacySelectLeadCounts(now: Date) {
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
  lastUpdatedAt?: string | null;
  countsSkipped?: boolean;
}

export interface LeadPageOptions {
  filters: LeadFilters;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  now?: Date;
  includeCounts?: boolean;
  includeAttrs?: boolean;
}

/**
 * Truy vấn trang danh sách: hàng của trang hiện tại, KPI theo bộ lọc đang áp,
 * và số lượng trên từng tab — gộp lại để trang chỉ cần một round trip.
 */
export async function queryLeadPage(options: LeadPageOptions, viewer: ViewerScope): Promise<LeadPage> {
  const now = options.now ?? new Date();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, options.pageSize ?? 50));

  const scopedCriteria = criteriaFromLeadFilters(options.filters, true);
  const needsJoins = criteriaNeedsCatalogJoins(scopedCriteria);
  const scoped = criteriaConditions(scopedCriteria, viewer, now);
  const isAllTab = !options.filters.tab || options.filters.tab === "ALL";
  const withoutTab = isAllTab
    ? scoped
    : criteriaConditions(criteriaFromLeadFilters(options.filters, false), viewer, now);

  const sortColumn = SORTABLE[options.sortBy ?? "createdAt"] ?? leads.createdAt;
  const direction = options.sortOrder === "asc" ? asc : desc;

  const includeAttrs = Boolean(options.includeAttrs);
  if (options.includeCounts === false) {
    const rows = await selectLeadListRows(includeAttrs)
      .where(and(...scoped))
      .orderBy(direction(sortColumn), desc(leads.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return {
      rows: rows.map(toLead),
      countsSkipped: true,
      total: 0,
      kpis: {
        total: 0,
        contacted: 0,
        uncontacted: 0,
        contactRate: 0,
        khqt: 0,
        khqtRate: 0,
        gdtd: 0,
        khd: 0,
        failed: 0,
        failRate: 0,
        overdue: 0,
      },
      tabCounts: { ALL: 0, CHUA_LIEN_HE: 0, DA_LIEN_HE: 0, QUA_HAN: 0 },
      lastUpdatedAt: null,
    };
  }

  const [rows, [kpi], maybeTabs, lastUpdatedAt] = await Promise.all([
    selectLeadListRows(includeAttrs)
      .where(and(...scoped))
      // Thêm id vào khóa sắp xếp để phân trang không bị nhảy hàng khi trùng giá trị.
      .orderBy(direction(sortColumn), desc(leads.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    selectLeadCounts(now, needsJoins).where(and(...scoped)),
    // Số trên tab đếm theo bộ lọc nhưng bỏ qua chính tab đang chọn (nếu đang ở tab ALL thì dùng chung kpi).
    isAllTab ? Promise.resolve(null) : selectLeadCounts(now, needsJoins).where(and(...withoutTab)),
    getLatestDataTimestamp(viewer.activeProjectId),
  ]);
  const tabs = maybeTabs ? maybeTabs[0] : kpi;

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
    lastUpdatedAt,
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
  /** Họ tên khách; chuỗi rỗng nghĩa là bỏ tên. */
  name?: string | null;
  /** SĐT khách; được chuẩn hóa và kiểm tra trùng trong cùng project. */
  phone?: string;
  /** Thời gian tạo lead (chỉ cho phép sửa với lead thủ công). */
  createdAt?: string;
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
  contactCount?: number;
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

async function resolveActiveProjectId(viewer: ViewerScope): Promise<string | null> {
  if (viewer.activeProjectId) return viewer.activeProjectId;
  if (viewer.role === "SUPER_ADMIN") {
    return (await getDefaultProject())?.id ?? null;
  }
  return null;
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

  const callLogsCount = logs.filter((entry) => entry.kind === "CALL" || entry.kind === "MISSED_CALL").length;
  const shouldTouchContact = logs.some(
    (entry) =>
      entry.kind === "CALL" ||
      entry.kind === "MISSED_CALL" ||
      entry.kind === "STATUS_CHANGE" ||
      (entry.kind as string) === "STATUS",
  );

  await getDb().transaction(async (tx) => {
    if (shouldTouchContact) {
      const now = new Date();
      const leadUpdate: Record<string, unknown> = {
        lastContactAt: now,
        updatedAt: now,
      };
      if (callLogsCount > 0) {
        leadUpdate.contactCount = (current.contactCount ?? 0) + callLogsCount;
        leadUpdate.contactStatus = "DA_LIEN_HE";
      }
      await tx
        .update(leads)
        .set(leadUpdate)
        .where(and(eq(leads.id, leadId), ...scopeConditions(viewer)));
    }

    await tx.insert(activityLogs).values(
      logs.map((log) => ({
        leadId,
        kind: log.kind,
        message: log.message,
        actorId: actor.appUserId ?? null,
        actorName: log.byAi ? "Trợ lý AI" : actor.fullName,
        byAi: log.byAi ?? false,
      })),
    );
  });

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

  const now = new Date();
  const values: Record<string, unknown> = { updatedAt: now };

  const projectId = await resolveLeadProjectId(id);

  if (patch.name !== undefined && patch.name !== current.name) {
    if (!canEditLeadProfile(viewer, current)) {
      throw new Error("Chỉ được sửa tên và số điện thoại với lead tạo thủ công hoặc import.");
    }
    const name = patch.name?.trim() ?? "";
    if (name.length > 120) throw new Error("Họ tên tối đa 120 ký tự.");
    values.name = name || null;
  }
  if (patch.phone !== undefined && patch.phone !== current.phone) {
    if (!canEditLeadProfile(viewer, current)) {
      throw new Error("Chỉ được sửa tên và số điện thoại với lead tạo thủ công hoặc import.");
    }
    const problem = validatePhone(patch.phone);
    if (problem) throw new Error(problem);
    const phone = normalizePhone(patch.phone);
    if (phoneKey(phone) !== phoneKey(current.phone)) {
      const duplicate = await findLeadByPhone(projectId, phone, id);
      if (duplicate) {
        throw new Error(
          `Số điện thoại ${phone} đã có ở lead «${duplicate.name?.trim() || "Khách chưa có tên"}» (tạo ${duplicate.createdAt.toLocaleDateString("vi-VN")}).`,
        );
      }
    }
    values.phone = phone;
  }
  if (patch.createdAt !== undefined && patch.createdAt !== current.createdAt) {
    if (!canEditLeadProfile(viewer, current)) {
      throw new Error("Chỉ được sửa thời gian tạo với lead tạo thủ công hoặc import.");
    }
    const parsedCreatedAt = parseCallbackAt(patch.createdAt) ?? new Date(patch.createdAt);
    if (Number.isNaN(parsedCreatedAt.getTime())) {
      throw new Error("Thời gian tạo không hợp lệ.");
    }
    values.createdAt = parsedCreatedAt;
  }

  if (patch.contactStatus !== undefined) values.contactStatus = patch.contactStatus;
  if (patch.category !== undefined) {
    values.category = patch.category;
    if (patch.category !== "FAIL" && patch.failReason === undefined) {
      values.failReason = null;
    }
  }
  if (patch.failReason !== undefined) {
    values.failReason = (patch.category ?? current.category) === "FAIL" ? patch.failReason : null;
  }
  if (patch.source !== undefined && patch.source !== current.source) {
    if (current.source === "MANUAL" || patch.source === "MANUAL") {
      throw new Error("Không được đổi nguồn của lead thủ công hoặc chuyển lead sang nguồn thủ công.");
    }
    values.source = patch.source;
  }
  if (patch.channelDetail !== undefined) values.channelDetail = patch.channelDetail;
  if (patch.contactCount !== undefined) {
    values.contactCount = Math.max(0, patch.contactCount);
  }
  if (patch.careNote !== undefined) values.careNote = patch.careNote;
  if (patch.callbackAt !== undefined) {
    values.callbackAt = parseCallbackAt(patch.callbackAt);
  }
  if (patch.assignee !== undefined && patch.assignee !== current.assignee) {
    if (viewer.role === "STAFF") {
      throw new Error("Nhân viên không có quyền đổi người phụ trách.");
    }
    values.assigneeId = patch.assignee ? await resolveAssigneeId(patch.assignee, viewer) : null;
  }

  const touchedContact =
    patch.contactStatus === "DA_LIEN_HE" ||
    (patch.contactCount !== undefined && patch.contactCount > (current.contactCount ?? 0)) ||
    logs.some(
      (entry) =>
        entry.kind === "CALL" ||
        entry.kind === "MISSED_CALL" ||
        entry.kind === "STATUS_CHANGE" ||
        (entry.kind as string) === "STATUS",
    );
  if (touchedContact) {
    values.lastContactAt = now;
  }

  // Brand quyết định tập sản phẩm hợp lệ, nên resolve brand trước rồi mới tới product.
  let brandCode: BrandCode | null = current.brand;
  if (patch.brand !== undefined) {
    brandCode = patch.brand;
    values.brandId = patch.brand ? await resolveBrandId(patch.brand, projectId) : null;
    // Đổi brand mà không nói gì về product thì bỏ product cũ (thuộc brand khác).
    if (patch.product === undefined && patch.brand !== current.brand) values.productId = null;
  }
  if (patch.product !== undefined) {
    values.productId = patch.product ? await resolveProductId(patch.product, brandCode, projectId) : null;
  }
  if (patch.location !== undefined) {
    values.locationId = patch.location ? await resolveLocationId(patch.location, projectId) : null;
  }
  if (patch.attrs !== undefined) {
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

/** Lead khác cùng project có cùng SĐT (so sánh theo khóa đã bỏ ký tự thừa và đầu số 840/84). */
export async function findLeadByPhone(projectId: string | null, phone: string, excludeId?: string) {
  const key = phoneKey(phone);
  const conditions: SQL[] = [
    sql`regexp_replace(regexp_replace(regexp_replace(${leads.phone}, '\\D', '', 'g'), '^840(\\d{9})$', '0\\1'), '^84(\\d{9})$', '0\\1') = ${key}`,
  ];
  if (excludeId) conditions.push(ne(leads.id, excludeId));
  if (projectId) conditions.push(eq(leads.projectId, projectId));
  const [row] = await getDb()
    .select({ name: leads.name, createdAt: leads.createdAt })
    .from(leads)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

/** Lead khác cùng project có cùng email trong attrs (không phân biệt hoa thường). */
export async function findLeadByEmail(projectId: string | null, email: string, excludeId?: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const conditions: SQL[] = [
    sql`lower(trim(coalesce(${leads.attrs}->>'email', ''))) = ${normalized}`,
  ];
  if (excludeId) conditions.push(ne(leads.id, excludeId));
  if (projectId) conditions.push(eq(leads.projectId, projectId));
  const [row] = await getDb()
    .select({ name: leads.name, createdAt: leads.createdAt })
    .from(leads)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

export interface ExistingLeadUniqueEntry {
  name: string | null;
  phone: string;
  email: string | null;
}

/** Đọc danh sách SĐT và email đang có trong project để kiểm tra trùng hàng loạt khi import. */
export async function listExistingPhonesAndEmails(
  projectId: string | null,
): Promise<ExistingLeadUniqueEntry[]> {
  if (!projectId) return [];
  const rows = await getDb()
    .select({
      name: leads.name,
      phone: leads.phone,
      email: sql<string | null>`nullif(trim(coalesce(${leads.attrs}->>'email', '')), '')`,
    })
    .from(leads)
    .where(eq(leads.projectId, projectId));
  return rows;
}

async function resolveLeadProjectId(leadId: string): Promise<string | null> {
  const [row] = await getDb().select({ projectId: leads.projectId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  return row?.projectId ?? null;
}

function isValidCalendarDate(y: number, m: number, day: number): boolean {
  if (m < 1 || m > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(y, m - 1, day));
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === y &&
    d.getUTCMonth() + 1 === m &&
    d.getUTCDate() === day
  );
}

export function validateAttrValue(def: AttrFieldRow, raw: string): string {
  const value = raw.trim();
  if (!value) {
    if (def.required) throw new Error(`Field "${def.label}" là bắt buộc.`);
    return "";
  }
  if (def.fieldType === "number" && Number.isNaN(Number(value))) {
    throw new Error(`Field "${def.label}" phải là số.`);
  }
  if (def.fieldType === "date") {
    const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const mVn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (mIso) {
      const y = Number(mIso[1]);
      const m = Number(mIso[2]);
      const day = Number(mIso[3]);
      if (!isValidCalendarDate(y, m, day)) {
        throw new Error(`Field "${def.label}" không đúng ngày tháng.`);
      }
      return value;
    }
    if (mVn) {
      const day = Number(mVn[1]);
      const m = Number(mVn[2]);
      const y = Number(mVn[3]);
      if (!isValidCalendarDate(y, m, day)) {
        throw new Error(`Field "${def.label}" không đúng ngày tháng.`);
      }
      const dd = String(day).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const yyyy = String(y);
      return `${yyyy}-${mm}-${dd}`;
    }
    throw new Error(`Field "${def.label}" phải có định dạng ngày yyyy-MM-dd hoặc dd/MM/yyyy.`);
  }
  if (def.fieldType === "boolean") {
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "có" || lower === "co" || lower === "yes") {
      return "true";
    }
    if (lower === "false" || lower === "0" || lower === "không" || lower === "khong" || lower === "no") {
      return "false";
    }
    throw new Error(`Giá trị không hợp lệ cho "${def.label}".`);
  }
  if (def.fieldType === "select") {
    if (!def.options.includes(value)) {
      throw new Error(`Giá trị không hợp lệ cho "${def.label}".`);
    }
    return value;
  }
  if (def.fieldType === "multiselect") {
    const picked = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (picked.length === 0) {
      if (def.required) throw new Error(`Field "${def.label}" là bắt buộc.`);
      return "";
    }
    if (picked.some((item) => !def.options.includes(item))) {
      throw new Error(`Giá trị không hợp lệ cho "${def.label}".`);
    }
    return picked.join(", ");
  }
  return value;
}

function mergeLeadAttrsWithDefs(
  defs: AttrFieldRow[],
  current: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const activeKeys = new Set(defs.filter((d) => d.active).map((d) => d.key));
  const knownKeys = new Set(defs.map((d) => d.key));

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    if (!knownKeys.has(key) || !activeKeys.has(key)) merged[key] = value;
  }
  for (const def of defs) {
    if (!def.active) continue;
    const raw = incoming[def.key] !== undefined ? incoming[def.key] : (current[def.key] ?? "");
    const value = validateAttrValue(def, raw);
    if (value) merged[def.key] = value;
  }
  return merged;
}

/** Giữ key lạ + field tắt; thay giá trị field đang bật từ client (giữ nguyên field không gửi lên). */
async function mergeLeadAttrs(
  projectId: string,
  current: Record<string, string>,
  incoming: Record<string, string>,
): Promise<Record<string, string>> {
  const defs = await listAttrFields(projectId);
  return mergeLeadAttrsWithDefs(defs, current, incoming);
}

async function resolveAssigneeId(fullName: string, viewer?: ViewerScope) {
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  if (viewer) {
    const allowed = await listAssignableStaff(viewer);
    const matched = allowed.find((name) => name.toLowerCase() === trimmed.toLowerCase());
    if (!matched) {
      throw new Error(`Nhân viên phụ trách "${trimmed}" không thuộc phạm vi phân công.`);
    }
    const rows = await getDb()
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(and(eq(appUsers.fullName, matched), eq(appUsers.active, true)))
      .limit(1);
    return rows[0]?.id ?? null;
  }
  const rows = await getDb()
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.fullName, trimmed), eq(appUsers.active, true)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Brand theo mã, trong project hiện tại. */
export async function resolveBrandId(code: BrandCode, projectId?: string | null): Promise<string | null> {
  if (!projectId) return null;
  const rows = await getDb()
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.code, code), eq(brands.projectId, projectId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Tên sản phẩm chỉ unique trong phạm vi một brand, nên ưu tiên khớp theo brand
 * của lead rồi mới nới ra khớp theo tên.
 */
export async function resolveProductId(
  name: string,
  brandCode: BrandCode | null,
  projectId?: string | null,
): Promise<string | null> {
  if (!projectId) return null;
  const db = getDb();
  if (brandCode) {
    const exact = await db
      .select({ id: products.id })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.name, name), eq(brands.code, brandCode), eq(products.projectId, projectId)))
      .limit(1);
    if (exact[0]) return exact[0].id;
  }

  const fallback = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.name, name), eq(products.projectId, projectId)))
    .limit(1);
  return fallback[0]?.id ?? null;
}

/** Location theo tên, trong project hiện tại. */
export async function resolveLocationId(name: string, projectId?: string | null): Promise<string | null> {
  if (!projectId) return null;
  const rows = await getDb()
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.name, name), eq(locations.projectId, projectId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

export interface CreateManualLeadInput {
  name: string;
  phone: string;
  email?: string | null;
  brand?: BrandCode | null;
  product?: string | null;
  location?: string | null;
  channelDetail?: ChannelDetail;
  category?: LeadCategory;
  failReason?: FailReason | null;
  assignee?: string | null;
  careNote?: string | null;
  callbackAt?: string | null;
  attrs?: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tạo lead thủ công (`source = "MANUAL"`), kiểm tra trùng SĐT & email và áp quy tắc phụ trách theo vai trò. */
export async function createManualLead(
  input: CreateManualLeadInput,
  viewer: ViewerScope,
  actor: Actor,
): Promise<Lead> {
  if (!canCreateLead(viewer.role)) {
    throw new Error("Bạn không có quyền tạo lead.");
  }

  const name = input.name.trim();
  if (!name) throw new Error("Họ tên khách hàng không được để trống.");
  if (name.length > 250) throw new Error("Họ tên tối đa 250 ký tự.");

  const phoneProblem = validatePhone(input.phone);
  if (phoneProblem) throw new Error(phoneProblem);
  const phone = normalizePhone(input.phone);

  const projectId = await resolveActiveProjectId(viewer);
  if (!projectId) throw new Error("Chưa xác định được dự án đang làm việc.");

  const duplicatePhone = await findLeadByPhone(projectId, phone);
  if (duplicatePhone) {
    throw new Error(
      `Số điện thoại ${phone} đã tồn tại ở lead «${duplicatePhone.name?.trim() || "Khách chưa có tên"}» (tạo ${duplicatePhone.createdAt.toLocaleDateString("vi-VN")}).`,
    );
  }

  const rawEmail = (input.email ?? input.attrs?.email ?? "").trim();
  if (rawEmail) {
    if (!EMAIL_RE.test(rawEmail)) {
      throw new Error("Email không đúng định dạng.");
    }
    const duplicateEmail = await findLeadByEmail(projectId, rawEmail);
    if (duplicateEmail) {
      throw new Error(
        `Email ${rawEmail} đã tồn tại ở lead «${duplicateEmail.name?.trim() || "Khách chưa có tên"}» (tạo ${duplicateEmail.createdAt.toLocaleDateString("vi-VN")}).`,
      );
    }
  }

  const requestedAssigneeId =
    viewer.role !== "STAFF" && input.assignee ? await resolveAssigneeId(input.assignee, viewer) : null;
  const assigneeId = resolveManualLeadAssignee(viewer, requestedAssigneeId);

  const brandId = input.brand ? await resolveBrandId(input.brand, projectId) : null;
  const productId = input.product ? await resolveProductId(input.product, input.brand ?? null, projectId) : null;
  const locationId = input.location ? await resolveLocationId(input.location, projectId) : null;

  const baseAttrs: Record<string, string> = {};
  if (rawEmail) baseAttrs.email = rawEmail;
  const mergedAttrs = await mergeLeadAttrs(projectId, baseAttrs, input.attrs ?? {});
  if (rawEmail && !mergedAttrs.email) mergedAttrs.email = rawEmail;

  const category = input.category ?? "CHUA_PHAN_LOAI";
  const failReason = category === "FAIL" ? (input.failReason ?? null) : null;

  let createdId = "";
  await getDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(leads)
      .values({
        name,
        phone,
        source: "MANUAL",
        channelDetail: input.channelDetail ?? "FORM",
        contactStatus: "CHUA_LIEN_HE",
        category,
        failReason,
        projectId,
        brandId,
        productId,
        locationId,
        assigneeId,
        careNote: input.careNote?.trim() || null,
        callbackAt: parseCallbackAt(input.callbackAt),
        attrs: mergedAttrs,
      })
      .returning({ id: leads.id });

    createdId = inserted.id;
    await tx.insert(activityLogs).values({
      leadId: createdId,
      kind: "CREATE",
      message: "Tạo lead thủ công.",
      actorId: actor.appUserId ?? null,
      actorName: actor.fullName,
      byAi: false,
    });
  });

  const lead = await getLeadById(createdId, viewer);
  if (!lead) throw new Error("Không tải được lead vừa tạo.");
  return lead;
}

/** Ghi hàng loạt các dòng lead hợp lệ từ file import vào DB trong một transaction. */
export async function insertImportedLeads(
  rows: CreateManualLeadInput[],
  viewer: ViewerScope,
  actor: Actor,
): Promise<{ importedCount: number }> {
  if (!canImportLeads(viewer.role)) {
    throw new Error("Bạn không có quyền import lead.");
  }
  if (rows.length === 0) return { importedCount: 0 };

  const projectId = await resolveActiveProjectId(viewer);
  if (!projectId) throw new Error("Chưa xác định được dự án đang làm việc.");

  const db = getDb();
  const [existingLeads, attrDefs, assignableStaffNames, brandRows, productRows, locationRows] = await Promise.all([
    listExistingPhonesAndEmails(projectId),
    listAttrFields(projectId),
    listAssignableStaff(viewer),
    db
      .select({ id: brands.id, code: brands.code })
      .from(brands)
      .where(eq(brands.projectId, projectId)),
    db
      .select({ id: products.id, name: products.name, brandCode: brands.code })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(eq(products.projectId, projectId)),
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.projectId, projectId)),
  ]);

  const staffRows =
    assignableStaffNames.length > 0
      ? await db
          .select({ id: appUsers.id, fullName: appUsers.fullName })
          .from(appUsers)
          .where(and(inArray(appUsers.fullName, assignableStaffNames), eq(appUsers.active, true)))
      : [];

  const seenPhoneKeys = new Set<string>();
  const seenEmails = new Set<string>();
  for (const item of existingLeads) {
    const pKey = phoneKey(item.phone);
    if (pKey) seenPhoneKeys.add(pKey);
    const eKey = item.email?.trim().toLowerCase();
    if (eKey) seenEmails.add(eKey);
  }

  const brandMap = new Map(brandRows.map((b) => [b.code.toLowerCase(), b.id]));
  const productByBrandAndName = new Map(
    productRows.map((p) => [`${p.brandCode.toLowerCase()}::${p.name.toLowerCase()}`, p.id]),
  );
  const productByName = new Map(productRows.map((p) => [p.name.toLowerCase(), p.id]));
  const locationMap = new Map(locationRows.map((l) => [l.name.toLowerCase(), l.id]));
  const staffMap = new Map(staffRows.map((u) => [u.fullName.toLowerCase(), u.id]));

  const leadsToInsert: (typeof leads.$inferInsert)[] = [];

  for (const row of rows) {
    const name = row.name?.trim() ?? "";
    if (!name || name.length > 250) continue;

    const phone = normalizePhone(row.phone);
    if (!phone || validatePhone(phone)) continue;
    const pKey = phoneKey(phone);
    if (!pKey || seenPhoneKeys.has(pKey)) continue;

    const rawEmail = (row.email ?? row.attrs?.email ?? "").trim();
    if (rawEmail) {
      if (!EMAIL_RE.test(rawEmail)) continue;
      if (seenEmails.has(rawEmail.toLowerCase())) continue;
    }

    const baseAttrs: Record<string, string> = {};
    if (rawEmail) baseAttrs.email = rawEmail;

    let mergedAttrs: Record<string, string>;
    try {
      mergedAttrs = mergeLeadAttrsWithDefs(attrDefs, baseAttrs, row.attrs ?? {});
      if (rawEmail && !mergedAttrs.email) mergedAttrs.email = rawEmail;
    } catch {
      continue;
    }

    seenPhoneKeys.add(pKey);
    if (rawEmail) seenEmails.add(rawEmail.toLowerCase());

    const requestedAssigneeId =
      viewer.role !== "STAFF" && row.assignee
        ? (staffMap.get(row.assignee.trim().toLowerCase()) ?? null)
        : null;
    const assigneeId = resolveManualLeadAssignee(viewer, requestedAssigneeId);

    const brandCodeLower = row.brand?.trim().toLowerCase() ?? null;
    const brandId = brandCodeLower ? (brandMap.get(brandCodeLower) ?? null) : null;

    let productId: string | null = null;
    const prodNameLower = row.product?.trim().toLowerCase() ?? null;
    if (prodNameLower) {
      if (brandCodeLower) {
        productId = productByBrandAndName.get(`${brandCodeLower}::${prodNameLower}`) ?? null;
      }
      if (!productId) {
        productId = productByName.get(prodNameLower) ?? null;
      }
    }

    const locLower = row.location?.trim().toLowerCase() ?? null;
    const locationId = locLower ? (locationMap.get(locLower) ?? null) : null;

    const category = row.category ?? "CHUA_PHAN_LOAI";
    const failReason = category === "FAIL" ? (row.failReason ?? null) : null;

    leadsToInsert.push({
      name,
      phone,
      source: "MANUAL",
      channelDetail: row.channelDetail ?? "FORM",
      contactStatus: "CHUA_LIEN_HE",
      category,
      failReason,
      projectId,
      brandId,
      productId,
      locationId,
      assigneeId,
      careNote: row.careNote?.trim() || null,
      callbackAt: parseCallbackAt(row.callbackAt),
      attrs: mergedAttrs,
    });
  }

  if (leadsToInsert.length === 0) return { importedCount: 0 };

  const BATCH_SIZE = 250;
  await db.transaction(async (tx) => {
    for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
      const chunk = leadsToInsert.slice(i, i + BATCH_SIZE);
      const insertedRows = await tx
        .insert(leads)
        .values(chunk)
        .returning({ id: leads.id });

      if (insertedRows.length > 0) {
        await tx.insert(activityLogs).values(
          insertedRows.map((ins) => ({
            leadId: ins.id,
            kind: "CREATE" as const,
            message: "Import lead từ file Excel.",
            actorId: actor.appUserId ?? null,
            actorName: actor.fullName,
            byAi: false,
          })),
        );
      }
    }
  });

  return { importedCount: leadsToInsert.length };
}

export interface BulkUpdateLeadsPatch {
  assignee?: string | null;
  contactStatus?: ContactStatus;
  category?: LeadCategory;
  failReason?: FailReason | null;
}

export async function bulkUpdateLeads(
  ids: string[],
  patch: BulkUpdateLeadsPatch,
  viewer: ViewerScope,
  actor: Actor,
): Promise<{ updatedCount: number }> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { updatedCount: 0 };

  if (patch.assignee !== undefined && viewer.role !== "SUPER_ADMIN" && viewer.role !== "PARTNER_ADMIN") {
    throw new Error("Chỉ quản trị viên mới có quyền giao phụ trách hàng loạt.");
  }

  const resolvedAssigneeId =
    patch.assignee !== undefined
      ? patch.assignee
        ? await resolveAssigneeId(patch.assignee, viewer)
        : null
      : undefined;

  const targetRows = await selectLeadRows().where(and(inArray(leads.id, uniqueIds), ...scopeConditions(viewer)));
  const editableRows = targetRows.map(toLead).filter((lead) => canEditLead(viewer, lead));
  if (editableRows.length === 0) return { updatedCount: 0 };

  const now = new Date();
  const values: Record<string, unknown> = { updatedAt: now };
  if (resolvedAssigneeId !== undefined) values.assigneeId = resolvedAssigneeId;
  if (patch.contactStatus !== undefined) {
    values.contactStatus = patch.contactStatus;
    if (patch.contactStatus === "DA_LIEN_HE") {
      values.lastContactAt = now;
    }
  }
  if (patch.category !== undefined) {
    values.category = patch.category;
    if (patch.category !== "FAIL" && patch.failReason === undefined) {
      values.failReason = null;
    }
  }
  if (patch.failReason !== undefined) {
    values.failReason = patch.category === "FAIL" || patch.category === undefined ? patch.failReason : null;
  }

  const editableIds = editableRows.map((r) => r.id);
  const logValues: (typeof activityLogs.$inferInsert)[] = [];

  for (const row of editableRows) {
    if (patch.assignee !== undefined && patch.assignee !== row.assignee) {
      logValues.push({
        leadId: row.id,
        kind: "ASSIGN_CHANGE",
        message: `Giao phụ trách hàng loạt: ${row.assignee ?? "Chưa giao"} → ${patch.assignee ?? "Chưa giao"}.`,
        actorId: actor.appUserId ?? null,
        actorName: actor.fullName,
        byAi: false,
      });
    }
    if (patch.contactStatus !== undefined && patch.contactStatus !== row.contactStatus) {
      logValues.push({
        leadId: row.id,
        kind: "STATUS_CHANGE",
        message: `Đổi trạng thái hàng loạt: ${CONTACT_STATUS_LABEL[row.contactStatus]} → ${CONTACT_STATUS_LABEL[patch.contactStatus]}.`,
        actorId: actor.appUserId ?? null,
        actorName: actor.fullName,
        byAi: false,
      });
    }
    if (patch.category !== undefined && patch.category !== row.category) {
      logValues.push({
        leadId: row.id,
        kind: "CATEGORY_CHANGE",
        message: `Đổi phân loại hàng loạt: ${CATEGORY_LONG_LABEL[row.category]} → ${CATEGORY_LONG_LABEL[patch.category]}.`,
        actorId: actor.appUserId ?? null,
        actorName: actor.fullName,
        byAi: false,
      });
    }
  }

  await getDb().transaction(async (tx) => {
    await tx
      .update(leads)
      .set(values)
      .where(and(inArray(leads.id, editableIds), ...scopeConditions(viewer)));

    if (logValues.length > 0) {
      await tx.insert(activityLogs).values(logValues);
    }
  });

  return { updatedCount: editableIds.length };
}

export async function autoAssignLeadsRoundRobin(
  ids: string[],
  viewer: ViewerScope,
  actor: Actor,
): Promise<{ assignedCount: number; staffCount: number }> {
  if (viewer.role !== "SUPER_ADMIN" && viewer.role !== "PARTNER_ADMIN") {
    throw new Error("Chỉ quản trị viên mới có quyền phân bổ tự động.");
  }

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { assignedCount: 0, staffCount: 0 };

  const staffNames = await listAssignableStaff(viewer);
  if (staffNames.length === 0) {
    throw new Error("Không có nhân viên sale đang hoạt động để phân bổ.");
  }

  const db = getDb();
  const staffRows = await db
    .select({ id: appUsers.id, fullName: appUsers.fullName })
    .from(appUsers)
    .where(and(inArray(appUsers.fullName, staffNames), eq(appUsers.active, true), eq(appUsers.role, "STAFF")))
    .orderBy(asc(appUsers.fullName));

  if (staffRows.length === 0) {
    throw new Error("Không có nhân viên sale đang hoạt động để phân bổ.");
  }

  const targetRows = await selectLeadRows().where(and(inArray(leads.id, uniqueIds), ...scopeConditions(viewer)));
  const rowById = new Map(targetRows.map((r) => [r.id, toLead(r)]));
  const editableLeads = uniqueIds
    .map((id) => rowById.get(id))
    .filter((lead): lead is Lead => Boolean(lead && canEditLead(viewer, lead)));

  if (editableLeads.length === 0) return { assignedCount: 0, staffCount: staffRows.length };

  const now = new Date();
  await db.transaction(async (tx) => {
    const logValues: (typeof activityLogs.$inferInsert)[] = [];
    for (let i = 0; i < editableLeads.length; i++) {
      const lead = editableLeads[i];
      const staff = staffRows[i % staffRows.length];
      await tx
        .update(leads)
        .set({ assigneeId: staff.id, updatedAt: now })
        .where(eq(leads.id, lead.id));

      logValues.push({
        leadId: lead.id,
        kind: "ASSIGN_CHANGE",
        message: `Phân bổ tự động (Round-Robin) cho ${staff.fullName}.`,
        actorId: actor.appUserId ?? null,
        actorName: actor.fullName,
        byAi: false,
      });
    }
    if (logValues.length > 0) {
      await tx.insert(activityLogs).values(logValues);
    }
  });

  return { assignedCount: editableLeads.length, staffCount: staffRows.length };
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
  attrFields?: AttrFieldRow[];
}

/** Danh mục cho các dropdown — đọc từ DB theo project và phạm vi người dùng. */
export async function getReferenceData(projectId?: string | null, viewer?: ViewerScope): Promise<ReferenceData> {
  const db = getDb();
  const effectiveProjectId = projectId ?? viewer?.activeProjectId ?? undefined;

  if (viewer && viewer.role !== "SUPER_ADMIN" && !effectiveProjectId) {
    return {
      project: null,
      labels: getCatalogLabels(null),
      brands: [],
      locations: [],
      assignees: [],
      productsByBrand: {},
      attrFields: [],
    };
  }

  const project = effectiveProjectId
    ? null
    : !viewer || viewer.role === "SUPER_ADMIN"
      ? await getDefaultProject()
      : null;
  const resolvedProjectId = effectiveProjectId ?? project?.id;
  const projectPromise = effectiveProjectId ? getProjectById(effectiveProjectId) : Promise.resolve(project);

  if (viewer && viewer.role !== "SUPER_ADMIN" && !resolvedProjectId) {
    return {
      project: null,
      labels: getCatalogLabels(null),
      brands: [],
      locations: [],
      assignees: [],
      productsByBrand: {},
      attrFields: [],
    };
  }

  const assigneesPromise = viewer
    ? listAssignableStaff(viewer)
    : db
        .select({ name: appUsers.fullName })
        .from(appUsers)
        .where(
          and(
            eq(appUsers.active, true),
            eq(appUsers.role, "STAFF"),
            resolvedProjectId ? eq(appUsers.projectId, resolvedProjectId) : undefined,
          ),
        )
        .orderBy(asc(appUsers.fullName))
        .then((rows) => rows.map((r) => r.name));

  const [resolvedProject, brandRows, locationRows, assignees, productRows, attrFields] = await Promise.all([
    projectPromise,
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
    assigneesPromise,
    db
      .select({ brand: brands.code, name: products.name })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.active, true), resolvedProjectId ? eq(products.projectId, resolvedProjectId) : undefined))
      .orderBy(asc(brands.sortOrder), asc(brands.code), asc(products.name)),
    resolvedProjectId ? listAttrFields(resolvedProjectId, { activeOnly: true }) : Promise.resolve([]),
  ]);

  const productsByBrand: Record<string, string[]> = {};
  for (const row of productRows) {
    (productsByBrand[row.brand] ??= []).push(row.name);
  }

  return {
    project: resolvedProject ? toProjectInfo(resolvedProject) : null,
    labels: getCatalogLabels(resolvedProject),
    brands: brandRows,
    locations: locationRows.map((r) => r.name),
    assignees,
    productsByBrand,
    attrFields,
  };
}

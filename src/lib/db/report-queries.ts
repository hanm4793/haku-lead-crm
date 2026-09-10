import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import {
  CATEGORY_CHART_LABEL,
  CHANNEL_LABEL,
  FAIL_REASON_LABEL,
  SOURCE_LABEL,
  UNASSIGNED_MODEL_LABEL,
} from "@/lib/constants";
import { getDb } from "@/lib/db/client";
import {
  criteriaConditions,
  criteriaFromLeadFilters,
  dueTodaySql,
  overdueSql,
  type ViewerScope,
} from "@/lib/db/leads-repo";
import { appUsers, carModels, leads, salesRooms, showrooms } from "@/lib/db/schema";
import type {
  CategoryShare,
  DailyPoint,
  FailReasonRow,
  FunnelStep,
  ModelBar,
  PivotDimension,
  PivotResult,
  PivotRow,
  SourceBar,
  SourceQualityRow,
} from "@/lib/metrics";
import type { Lead, LeadFilters, LeadKpis, LeadSource } from "@/lib/types";
import { ratio } from "@/lib/utils";

/**
 * Các truy vấn tổng hợp cho trang báo cáo — chạy trên Postgres (count FILTER,
 * date_trunc, GROUP BY) thay vì kéo toàn bộ lead về bộ nhớ.
 */

function whereClause(filters: LeadFilters, viewer: ViewerScope, now: Date) {
  const parts = criteriaConditions(criteriaFromLeadFilters(filters), viewer, now);
  return parts.length ? and(...parts) : undefined;
}

/** CASE map enum → nhãn tiếng Việt khớp với constants.ts. */
function caseMap(column: SQL, mapping: Record<string, string>): SQL {
  const branches = Object.entries(mapping).map(
    ([value, label]) => sql`when ${column} = ${value} then ${label}`,
  );
  return sql`case ${sql.join(branches, sql` `)} else ${column}::text end`;
}

const SOURCE_CASE = caseMap(
  sql`${leads.source}`,
  Object.fromEntries(Object.entries(SOURCE_LABEL)) as Record<string, string>,
);

const CATEGORY_CASE = caseMap(
  sql`${leads.category}`,
  Object.fromEntries(Object.entries(CATEGORY_CHART_LABEL)) as Record<string, string>,
);

const CHANNEL_CASE = caseMap(
  sql`${leads.channelDetail}`,
  Object.fromEntries(Object.entries(CHANNEL_LABEL)) as Record<string, string>,
);

const FAIL_REASON_CASE = caseMap(
  sql`coalesce(${leads.failReason}::text, ${"__NULL__"})`,
  {
    __NULL__: "Không ghi lý do",
    ...(Object.fromEntries(Object.entries(FAIL_REASON_LABEL)) as Record<string, string>),
  },
);

function dimensionExpr(dim: PivotDimension): SQL {
  switch (dim) {
    case "carModel":
      return sql`coalesce(${carModels.name}, ${UNASSIGNED_MODEL_LABEL})`;
    case "source":
      return SOURCE_CASE;
    case "category":
      return CATEGORY_CASE;
    case "brand":
      return sql`${leads.brand}::text`;
    case "showroom":
      return sql`coalesce(${showrooms.name}, '')`;
    case "salesRoom":
      return sql`coalesce(${salesRooms.name}, '')`;
    case "assignee":
      return sql`coalesce(${appUsers.fullName}, ${"Chưa giao"})`;
    case "channelDetail":
      return CHANNEL_CASE;
    case "campaign":
      return sql`coalesce(${leads.campaign}, ${"Không gắn chiến dịch"})`;
  }
}

const PIVOT_METRICS = {
  leads: sql<number>`count(*)::int`,
  contacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'DA_LIEN_HE')::int`,
  khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
  gdtd: sql<number>`count(*) filter (where ${leads.category} in ('GDTD', 'KHD'))::int`,
  khd: sql<number>`count(*) filter (where ${leads.category} = 'KHD')::int`,
  failed: sql<number>`count(*) filter (where ${leads.category} = 'FAIL')::int`,
  overdue: (now: Date) => sql<number>`count(*) filter (where ${overdueSql(now)})::int`,
  pushedB10: sql<number>`count(*) filter (where ${leads.pushedToB10})::int`,
  khqtB10: sql<number>`count(*) filter (where ${leads.pushedToB10} and ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
  gdtdB10: sql<number>`count(*) filter (where ${leads.pushedToB10} and ${leads.category} in ('GDTD', 'KHD'))::int`,
  khdB10: sql<number>`count(*) filter (where ${leads.pushedToB10} and ${leads.category} = 'KHD')::int`,
  failedB10: sql<number>`count(*) filter (where ${leads.pushedToB10} and ${leads.category} = 'FAIL')::int`,
};

function finalizePivotRow(
  key: string,
  raw: {
    leads: number;
    contacted: number;
    khqt: number;
    gdtd: number;
    khd: number;
    failed: number;
    overdue: number;
    pushedB10: number;
    khqtB10: number;
    gdtdB10: number;
    khdB10: number;
    failedB10: number;
  },
  grandTotal: number,
): PivotRow {
  return {
    key,
    leads: raw.leads,
    leadShare: ratio(raw.leads, grandTotal),
    contacted: raw.contacted,
    contactRate: ratio(raw.contacted, raw.leads),
    khqt: raw.khqt,
    gdtd: raw.gdtd,
    khd: raw.khd,
    signRate: ratio(raw.khd, raw.leads),
    failed: raw.failed,
    failRate: ratio(raw.failed, raw.leads),
    overdue: raw.overdue,
    pushedB10: raw.pushedB10,
    b10Rate: ratio(raw.pushedB10, raw.leads),
    khqtB10: raw.khqtB10,
    gdtdB10: raw.gdtdB10,
    khdB10: raw.khdB10,
    failedB10: raw.failedB10,
  };
}

async function selectKpiRow(filters: LeadFilters, viewer: ViewerScope, now: Date) {
  const [row] = await getDb()
    .select({
      total: sql<number>`count(*)::int`,
      contacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'DA_LIEN_HE')::int`,
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
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(filters, viewer, now));

  return row;
}

export async function queryReportKpis(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
): Promise<LeadKpis> {
  const row = await selectKpiRow(filters, viewer, now);
  return {
    total: row.total,
    contacted: row.contacted,
    contactRate: ratio(row.contacted, row.total),
    khqt: row.khqt,
    khqtRate: ratio(row.khqt, row.contacted),
    gdtd: row.gdtd,
    khd: row.khd,
    failed: row.failed,
    failRate: ratio(row.failed, row.total),
    overdue: row.overdue,
  };
}

export async function queryFunnel(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
): Promise<FunnelStep[]> {
  const row = await selectKpiRow(filters, viewer, now);
  const raw: [string, number][] = [
    ["Tổng lead", row.total],
    ["Đã liên hệ", row.contacted],
    ["Quan tâm trở lên", row.khqt],
    ["Đang giao dịch trở lên", row.gdtd],
    ["Ký hợp đồng", row.khd],
  ];
  return raw.map(([label, value], i) => ({
    label,
    value,
    shareOfTotal: ratio(value, row.total),
    stepConversion: i === 0 ? 100 : ratio(value, raw[i - 1][1]),
  }));
}

export async function queryDailySeries(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
): Promise<DailyPoint[]> {
  const rows = await getDb()
    .select({
      date: sql<string>`to_char(timezone('Asia/Ho_Chi_Minh', ${leads.createdAt}), 'YYYY-MM-DD')`,
      leads: sql<number>`count(*)::int`,
      khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(filters, viewer, now))
    .groupBy(sql`1`)
    .orderBy(asc(sql`1`));

  return rows.map((row) => {
    const [, month, day] = row.date.split("-");
    return {
      date: row.date,
      label: `${day}.${month}`,
      leads: row.leads,
      khqt: row.khqt,
    };
  });
}

export async function queryCategoryDistribution(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
): Promise<CategoryShare[]> {
  const rows = await getDb()
    .select({
      category: leads.category,
      value: sql<number>`count(*)::int`,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(filters, viewer, now))
    .groupBy(leads.category);

  const order = ["CHUA_PHAN_LOAI", "KHQT", "GDTD", "KHD", "CHUA_LH_DUOC", "FAIL"] as const;
  const byCat = new Map(rows.map((r) => [r.category, r.value]));

  return order
    .filter((category) => (byCat.get(category) ?? 0) > 0)
    .map((category) => ({
      category,
      label: CATEGORY_CHART_LABEL[category],
      value: byCat.get(category) ?? 0,
    }));
}

export async function queryBySource(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
): Promise<SourceBar[]> {
  const rows = await getDb()
    .select({
      source: leads.source,
      leads: sql<number>`count(*)::int`,
      khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(filters, viewer, now))
    .groupBy(leads.source)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => ({
    source: SOURCE_LABEL[row.source as LeadSource],
    leads: row.leads,
    khqt: row.khqt,
  }));
}

export async function queryByCarModel(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
  limit = 12,
): Promise<ModelBar[]> {
  const rows = await getDb()
    .select({
      model: sql<string>`coalesce(${carModels.name}, ${UNASSIGNED_MODEL_LABEL})`,
      leads: sql<number>`count(*)::int`,
      khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(filters, viewer, now))
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows.map((row) => ({ model: row.model, leads: row.leads, khqt: row.khqt }));
}

export async function queryFailReasons(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
): Promise<FailReasonRow[]> {
  const failFilters: LeadFilters = { ...filters, categories: ["FAIL"] };
  const rows = await getDb()
    .select({
      reason: FAIL_REASON_CASE,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(failFilters, viewer, now))
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`));

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({
    reason: String(row.reason),
    count: row.count,
    share: ratio(row.count, total),
  }));
}

export async function querySourceQuality(
  filters: LeadFilters,
  previousFilters: LeadFilters | null,
  viewer: ViewerScope,
  now: Date,
): Promise<SourceQualityRow[]> {
  const build = async (f: LeadFilters) => {
    const rows = await getDb()
      .select({
        source: leads.source,
        leads: sql<number>`count(*)::int`,
        khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
        signed: sql<number>`count(*) filter (where ${leads.category} = 'KHD')::int`,
        failed: sql<number>`count(*) filter (where ${leads.category} = 'FAIL')::int`,
      })
      .from(leads)
      .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
      .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
      .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
      .leftJoin(carModels, eq(leads.carModelId, carModels.id))
      .where(whereClause(f, viewer, now))
      .groupBy(leads.source);

    return new Map(
      rows.map((row) => [
        SOURCE_LABEL[row.source as LeadSource],
        { leads: row.leads, khqt: row.khqt, signed: row.signed, failed: row.failed },
      ]),
    );
  };

  const current = await build(filters);
  const previous = previousFilters ? await build(previousFilters) : new Map();

  return [...current.entries()]
    .map(([source, row]) => {
      const prev = previous.get(source);
      const closeRate = ratio(row.signed, row.leads);
      const prevCloseRate = prev ? ratio(prev.signed, prev.leads) : 0;
      return {
        source,
        leads: row.leads,
        khqt: row.khqt,
        signed: row.signed,
        closeRate,
        lossRate: ratio(row.failed, row.leads),
        closeRateDelta: closeRate - prevCloseRate,
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

async function queryPivotGrouped(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
  groupBy: PivotDimension,
  splitBy: PivotDimension | null,
): Promise<PivotResult> {
  const groupExpr = dimensionExpr(groupBy);

  if (!splitBy) {
    const rows = await getDb()
      .select({
        key: sql<string>`${groupExpr}`,
        leads: PIVOT_METRICS.leads,
        contacted: PIVOT_METRICS.contacted,
        khqt: PIVOT_METRICS.khqt,
        gdtd: PIVOT_METRICS.gdtd,
        khd: PIVOT_METRICS.khd,
        failed: PIVOT_METRICS.failed,
        overdue: PIVOT_METRICS.overdue(now),
        pushedB10: PIVOT_METRICS.pushedB10,
        khqtB10: PIVOT_METRICS.khqtB10,
        gdtdB10: PIVOT_METRICS.gdtdB10,
        khdB10: PIVOT_METRICS.khdB10,
        failedB10: PIVOT_METRICS.failedB10,
      })
      .from(leads)
      .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
      .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
      .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
      .leftJoin(carModels, eq(leads.carModelId, carModels.id))
      .where(whereClause(filters, viewer, now))
      .groupBy(sql`1`)
      .orderBy(desc(sql`count(*)`));

    const grandTotal = rows.reduce((sum, row) => sum + row.leads, 0);
    const list = rows.map((row) => finalizePivotRow(row.key, row, grandTotal));
    const total = finalizePivotRow(
      "Tổng",
      {
        leads: grandTotal,
        contacted: list.reduce((s, r) => s + r.contacted, 0),
        khqt: list.reduce((s, r) => s + r.khqt, 0),
        gdtd: list.reduce((s, r) => s + r.gdtd, 0),
        khd: list.reduce((s, r) => s + r.khd, 0),
        failed: list.reduce((s, r) => s + r.failed, 0),
        overdue: list.reduce((s, r) => s + r.overdue, 0),
        pushedB10: list.reduce((s, r) => s + r.pushedB10, 0),
        khqtB10: list.reduce((s, r) => s + r.khqtB10, 0),
        gdtdB10: list.reduce((s, r) => s + r.gdtdB10, 0),
        khdB10: list.reduce((s, r) => s + r.khdB10, 0),
        failedB10: list.reduce((s, r) => s + r.failedB10, 0),
      },
      grandTotal,
    );

    return { rows: list, total, splitKeys: [], split: {} };
  }

  const splitExpr = dimensionExpr(splitBy);
  const rows = await getDb()
    .select({
      key: sql<string>`${groupExpr}`,
      splitKey: sql<string>`${splitExpr}`,
      leads: PIVOT_METRICS.leads,
      contacted: PIVOT_METRICS.contacted,
      khqt: PIVOT_METRICS.khqt,
      gdtd: PIVOT_METRICS.gdtd,
      khd: PIVOT_METRICS.khd,
      failed: PIVOT_METRICS.failed,
      overdue: PIVOT_METRICS.overdue(now),
      pushedB10: PIVOT_METRICS.pushedB10,
      khqtB10: PIVOT_METRICS.khqtB10,
      gdtdB10: PIVOT_METRICS.gdtdB10,
      khdB10: PIVOT_METRICS.khdB10,
      failedB10: PIVOT_METRICS.failedB10,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(filters, viewer, now))
    .groupBy(sql`1`, sql`2`);

  const grouped = new Map<string, typeof rows>();
  const splitKeySet = new Set<string>();
  for (const row of rows) {
    splitKeySet.add(row.splitKey);
    const list = grouped.get(row.key) ?? [];
    list.push(row);
    grouped.set(row.key, list);
  }

  const aggregateKey = (cells: typeof rows) => ({
    leads: cells.reduce((s, r) => s + r.leads, 0),
    contacted: cells.reduce((s, r) => s + r.contacted, 0),
    khqt: cells.reduce((s, r) => s + r.khqt, 0),
    gdtd: cells.reduce((s, r) => s + r.gdtd, 0),
    khd: cells.reduce((s, r) => s + r.khd, 0),
    failed: cells.reduce((s, r) => s + r.failed, 0),
    overdue: cells.reduce((s, r) => s + r.overdue, 0),
    pushedB10: cells.reduce((s, r) => s + r.pushedB10, 0),
    khqtB10: cells.reduce((s, r) => s + r.khqtB10, 0),
    gdtdB10: cells.reduce((s, r) => s + r.gdtdB10, 0),
    khdB10: cells.reduce((s, r) => s + r.khdB10, 0),
    failedB10: cells.reduce((s, r) => s + r.failedB10, 0),
  });

  const grandTotal = rows.reduce((sum, row) => sum + row.leads, 0);
  const list = [...grouped.entries()]
    .map(([key, cells]) => finalizePivotRow(key, aggregateKey(cells), grandTotal))
    .sort((a, b) => b.leads - a.leads);

  const split: Record<string, Record<string, PivotRow>> = {};
  for (const [key, cells] of grouped) {
    split[key] = {};
    for (const cell of cells) {
      split[key][cell.splitKey] = finalizePivotRow(cell.splitKey, cell, grandTotal);
    }
  }

  const total = finalizePivotRow("Tổng", aggregateKey(rows), grandTotal);

  return {
    rows: list,
    total,
    splitKeys: [...splitKeySet].sort(),
    split,
  };
}

export async function queryPivot(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
  groupBy: PivotDimension,
  splitBy: PivotDimension | null,
): Promise<PivotResult> {
  return queryPivotGrouped(filters, viewer, now, groupBy, splitBy);
}

/** Danh sách cần gọi hôm nay / quá hạn — vài lead thật để mở popup chi tiết. */
export async function queryCallList(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
  limit = 12,
): Promise<Lead[]> {
  const criteria = criteriaFromLeadFilters(filters);
  const parts = [
    ...criteriaConditions(criteria, viewer, now),
    sql`(${overdueSql(now)} or ${dueTodaySql(now)})`,
  ];

  const rows = await getDb()
    .select({
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
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(and(...parts))
    .orderBy(asc(leads.callbackAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    callbackAt: row.callbackAt?.toISOString() ?? null,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    showroom: row.showroom ?? "",
    salesRoom: row.salesRoom ?? "",
  }));
}

/** Sheet breakdown cho AI preview — GROUP BY thay vì đếm trong JS. */
export async function querySheetCounts(
  filters: LeadFilters,
  viewer: ViewerScope,
  now: Date,
  splitBy: PivotDimension,
): Promise<{ name: string; count: number }[]> {
  const expr = dimensionExpr(splitBy);
  const rows = await getDb()
    .select({
      name: sql<string>`${expr}`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .leftJoin(showrooms, eq(leads.showroomId, showrooms.id))
    .leftJoin(salesRooms, eq(leads.salesRoomId, salesRooms.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(carModels, eq(leads.carModelId, carModels.id))
    .where(whereClause(filters, viewer, now))
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => ({ name: row.name, count: row.count }));
}

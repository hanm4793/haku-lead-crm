import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  ActivityKind,
  B10Status,
  Brand,
  ChannelDetail,
  ContactStatus,
  FailReason,
  LeadCategory,
  LeadSource,
} from "@/lib/types";

/**
 * Ép danh sách giá trị của enum Postgres phải khớp đúng union type nghiệp vụ.
 *
 * `Record<T, true>` bắt buộc liệt kê đủ mọi nhánh và từ chối nhánh lạ, nên nếu
 * ai thêm một phân loại lead mới vào `src/lib/types.ts` mà quên khai báo ở đây
 * thì typecheck fail ngay thay vì để lệch âm thầm giữa code và database.
 */
function enumValues<T extends string>(members: Record<T, true>) {
  return Object.keys(members) as [T, ...T[]];
}

export const contactStatusEnum = pgEnum(
  "contact_status",
  enumValues<ContactStatus>({ CHUA_LIEN_HE: true, DA_LIEN_HE: true }),
);

export const leadCategoryEnum = pgEnum(
  "lead_category",
  enumValues<LeadCategory>({
    CHUA_PHAN_LOAI: true,
    KHQT: true,
    GDTD: true,
    KHD: true,
    CHUA_LH_DUOC: true,
    FAIL: true,
  }),
);

export const failReasonEnum = pgEnum(
  "fail_reason",
  enumValues<FailReason>({
    SAI_SO: true,
    KHONG_CO_NHU_CAU: true,
    DA_MUA_NOI_KHAC: true,
    CHI_KHAO_GIA: true,
    NGOAI_KHA_NANG_TAI_CHINH: true,
    KH_TINH_KHAC: true,
    TRUNG_SPAM: true,
    KHAC: true,
  }),
);

export const b10StatusEnum = pgEnum(
  "b10_status",
  enumValues<B10Status>({ CHUA_CO_TREN_B10: true, DA_CO_TREN_B10: true, TRUNG_B10: true }),
);

export const leadSourceEnum = pgEnum(
  "lead_source",
  enumValues<LeadSource>({
    FACEBOOK: true,
    GOOGLE: true,
    TIKTOK: true,
    ZALO: true,
    WEBSITE: true,
    HOTLINE: true,
  }),
);

export const channelDetailEnum = pgEnum(
  "channel_detail",
  enumValues<ChannelDetail>({ TIN_NHAN: true, FORM: true, COMMENT: true, CUOC_GOI: true, CHAT_WEB: true }),
);

export const brandEnum = pgEnum(
  "brand",
  enumValues<Brand>({ KIA: true, MAZDA: true, PEUGEOT: true, BMW: true }),
);

export const activityKindEnum = pgEnum(
  "activity_kind",
  enumValues<ActivityKind>({
    CALL: true,
    STATUS_CHANGE: true,
    CATEGORY_CHANGE: true,
    ASSIGN_CHANGE: true,
    MISSED_CALL: true,
    B10_SYNC: true,
    NOTE: true,
    CREATE: true,
  }),
);

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "SHOWROOM_MANAGER", "SALES"]);

export const metaInsightLevelEnum = pgEnum("meta_insight_level", ["campaign", "adset", "ad"]);
export const metaSyncKindEnum = pgEnum("meta_sync_kind", ["leads", "insights"]);
export const metaSyncStatusEnum = pgEnum("meta_sync_status", ["ok", "error"]);

export const showrooms = pgTable("showrooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Nhân sự tồn tại độc lập với tài khoản đăng nhập: seed được người phụ trách
 * trước khi họ có account, rồi gắn `authUserId` vào lần đăng nhập đầu tiên.
 */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id").unique(),
  email: text("email").unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull().default("SALES"),
  showroomId: uuid("showroom_id").references(() => showrooms.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
});

export const salesRooms = pgTable("sales_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  managerId: uuid("manager_id").references(() => appUsers.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
});

export const carModels = pgTable(
  "car_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brand: brandEnum("brand").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [unique("car_models_brand_name_key").on(table.brand, table.name)],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    name: text("name"),
    phone: text("phone").notNull(),

    contactStatus: contactStatusEnum("contact_status").notNull().default("CHUA_LIEN_HE"),
    category: leadCategoryEnum("category").notNull().default("CHUA_PHAN_LOAI"),
    failReason: failReasonEnum("fail_reason"),

    pushedToB10: boolean("pushed_to_b10").notNull().default(false),
    b10Status: b10StatusEnum("b10_status").notNull().default("CHUA_CO_TREN_B10"),
    b10CareNote: text("b10_care_note"),

    source: leadSourceEnum("source").notNull(),
    channelDetail: channelDetailEnum("channel_detail").notNull(),
    brand: brandEnum("brand"),

    showroomId: uuid("showroom_id").references(() => showrooms.id, { onDelete: "restrict" }),
    salesRoomId: uuid("sales_room_id").references(() => salesRooms.id, { onDelete: "restrict" }),
    assigneeId: uuid("assignee_id").references(() => appUsers.id, { onDelete: "set null" }),
    carModelId: uuid("car_model_id").references(() => carModels.id, { onDelete: "set null" }),

    careNote: text("care_note"),
    callbackAt: timestamp("callback_at", { withTimezone: true }),
    contactCount: integer("contact_count").notNull().default(0),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),

    campaign: text("campaign"),
    adContent: text("ad_content"),
    costPerLead: integer("cost_per_lead"),

    facebookLeadId: text("facebook_lead_id").unique(),
    facebookFormId: text("facebook_form_id"),
    facebookPageId: text("facebook_page_id"),
    facebookAdId: text("facebook_ad_id"),
    facebookAdsetId: text("facebook_adset_id"),
    facebookCampaignId: text("facebook_campaign_id"),
  },
  (table) => [
    index("leads_created_at_idx").on(table.createdAt.desc()),
    index("leads_phone_idx").on(table.phone),
    index("leads_category_idx").on(table.category),
    index("leads_source_idx").on(table.source),
    index("leads_showroom_idx").on(table.showroomId),
    index("leads_assignee_idx").on(table.assigneeId),
    // Phục vụ tab "Quá hạn" và widget nhắc gọi lại.
    index("leads_callback_at_idx").on(table.callbackAt),
  ],
);

export const metaAdInsights = pgTable(
  "meta_ad_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: metaInsightLevelEnum("level").notNull(),
    objectId: text("object_id").notNull(),
    objectName: text("object_name"),
    dateStart: timestamp("date_start", { withTimezone: true }).notNull(),
    dateStop: timestamp("date_stop", { withTimezone: true }),
    spend: doublePrecision("spend"),
    impressions: integer("impressions"),
    clicks: integer("clicks"),
    reach: integer("reach"),
    leads: integer("leads"),
    cpc: doublePrecision("cpc"),
    cpm: doublePrecision("cpm"),
    ctr: doublePrecision("ctr"),
    costPerLead: doublePrecision("cost_per_lead"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("meta_ad_insights_level_object_date").on(t.level, t.objectId, t.dateStart)],
);

export const metaSyncRuns = pgTable("meta_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: metaSyncKindEnum("kind").notNull(),
  status: metaSyncStatusEnum("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  imported: integer("imported").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  message: text("message"),
});

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    kind: activityKindEnum("kind").notNull(),
    message: text("message").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => appUsers.id, { onDelete: "set null" }),
    /** Giữ tên hiển thị vì có những actor không phải người: "Hệ thống", "Trợ lý AI". */
    actorName: text("actor_name").notNull(),
    byAi: boolean("by_ai").notNull().default(false),
  },
  (table) => [index("activity_logs_lead_at_idx").on(table.leadId, table.at.desc())],
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  showroom: one(showrooms, { fields: [leads.showroomId], references: [showrooms.id] }),
  salesRoom: one(salesRooms, { fields: [leads.salesRoomId], references: [salesRooms.id] }),
  assignee: one(appUsers, { fields: [leads.assigneeId], references: [appUsers.id] }),
  carModel: one(carModels, { fields: [leads.carModelId], references: [carModels.id] }),
  logs: many(activityLogs),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  lead: one(leads, { fields: [activityLogs.leadId], references: [leads.id] }),
  actor: one(appUsers, { fields: [activityLogs.actorId], references: [appUsers.id] }),
}));

export const appUsersRelations = relations(appUsers, ({ one }) => ({
  showroom: one(showrooms, { fields: [appUsers.showroomId], references: [showrooms.id] }),
}));

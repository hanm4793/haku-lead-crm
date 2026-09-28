import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type {
  ActivityKind,
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

export const activityKindEnum = pgEnum(
  "activity_kind",
  enumValues<ActivityKind>({
    CALL: true,
    STATUS_CHANGE: true,
    CATEGORY_CHANGE: true,
    ASSIGN_CHANGE: true,
    MISSED_CALL: true,
    NOTE: true,
    CREATE: true,
  }),
);

export const userRoleEnum = pgEnum("user_role", ["SUPER_ADMIN", "PARTNER_ADMIN", "STAFF"]);

export const metaInsightLevelEnum = pgEnum("meta_insight_level", ["campaign", "adset", "ad"]);
export const metaSyncKindEnum = pgEnum("meta_sync_kind", ["leads", "insights"]);
export const metaSyncStatusEnum = pgEnum("meta_sync_status", ["ok", "error"]);
/** Tài khoản ads/leads ngoài Meta Page — lưu kết nối theo project (sync đầy đủ làm sau). */
export const adPlatformEnum = pgEnum("ad_platform", ["google", "tiktok", "zalo"]);
export const attrFieldTypeEnum = pgEnum("attr_field_type", ["text", "number", "select", "date"]);

/** Project cấu hình nhãn 3 catalog dimension. Phase B: một project active. */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brandLabel: text("brand_label").notNull().default("Thương hiệu"),
  productLabel: text("product_label").notNull().default("Sản phẩm"),
  locationLabel: text("location_label").notNull().default("Địa điểm"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Partner / staff có thể thuộc nhiều project. */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })],
);

/** Field phụ theo project — giá trị nằm ở leads.attrs[key]. */
export const projectAttrFields = pgTable(
  "project_attr_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    fieldType: attrFieldTypeEnum("field_type").notNull().default("text"),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("project_attr_fields_project_key").on(table.projectId, table.key)],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [unique("brands_project_code_key").on(table.projectId, table.code)],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [unique("locations_project_name_key").on(table.projectId, table.name)],
);

/**
 * Nhân sự tồn tại độc lập với tài khoản đăng nhập: seed được người phụ trách
 * trước khi họ có account, rồi gắn `authUserId` vào lần đăng nhập đầu tiên.
 */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id").unique(),
  email: text("email").unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull().default("STAFF"),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  /** Partner/Staff thuộc project này. Super admin để null = mọi project. */
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  /** Staff thuộc partner-admin này và nhìn đúng các fanpage của partner. */
  partnerId: uuid("partner_id").references((): AnyPgColumn => appUsers.id, { onDelete: "set null" }),
  /** Super admin bật cho từng partner-admin. Super admin luôn dùng được AI. */
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

/** Fanpage mà partner-admin được xem lead và marketing. */
export const userFacebookPages = pgTable(
  "user_facebook_pages",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    facebookPageId: text("facebook_page_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.facebookPageId] })],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [unique("products_brand_name_key").on(table.brandId, table.name)],
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

    source: leadSourceEnum("source").notNull(),
    channelDetail: channelDetailEnum("channel_detail").notNull(),

    projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "restrict" }),

    assigneeId: uuid("assignee_id").references(() => appUsers.id, { onDelete: "set null" }),

    /** Field phụ / FB form không map vào 3 dimension. */
    attrs: jsonb("attrs").$type<Record<string, string>>().notNull().default({}),

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
    index("leads_location_idx").on(table.locationId),
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
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    adsetId: text("adset_id"),
    adsetName: text("adset_name"),
    pageId: text("page_id"),
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
  (t) => [
    unique("meta_ad_insights_level_object_date").on(t.level, t.objectId, t.dateStart),
    index("meta_ad_insights_page_idx").on(t.pageId),
    index("meta_ad_insights_campaign_idx").on(t.campaignId),
  ],
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

/**
 * Fanpage Meta dùng cho Lead Ads — mỗi page thuộc đúng một project.
 * Sync lead lấy page `active` trong project (hoặc mọi page nếu super admin sync all).
 * Env FACEBOOK_PAGE_IDS chỉ bootstrap lần đầu vào project mặc định.
 */
export const facebookPages = pgTable("facebook_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  facebookPageId: text("facebook_page_id").notNull().unique(),
  name: text("name"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Kết nối tài khoản quảng cáo / lead ngoài Meta Page (Google, TikTok, Zalo).
 * MVP: lưu cấu hình để admin gắn vào project; pipeline sync làm sau.
 */
export const projectAdAccounts = pgTable(
  "project_ad_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    platform: adPlatformEnum("platform").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    name: text("name"),
    /** Token / customer id / notes — không log ra client. */
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("project_ad_accounts_project_platform_ext_key").on(
      table.projectId,
      table.platform,
      table.externalAccountId,
    ),
  ],
);

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
  project: one(projects, { fields: [leads.projectId], references: [projects.id] }),
  brand: one(brands, { fields: [leads.brandId], references: [brands.id] }),
  product: one(products, { fields: [leads.productId], references: [products.id] }),
  location: one(locations, { fields: [leads.locationId], references: [locations.id] }),
  assignee: one(appUsers, { fields: [leads.assigneeId], references: [appUsers.id] }),
  logs: many(activityLogs),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  lead: one(leads, { fields: [activityLogs.leadId], references: [leads.id] }),
  actor: one(appUsers, { fields: [activityLogs.actorId], references: [appUsers.id] }),
}));

export const appUsersRelations = relations(appUsers, ({ one }) => ({
  location: one(locations, { fields: [appUsers.locationId], references: [locations.id] }),
  project: one(projects, { fields: [appUsers.projectId], references: [projects.id] }),
}));

export const facebookPagesRelations = relations(facebookPages, ({ one }) => ({
  project: one(projects, { fields: [facebookPages.projectId], references: [projects.id] }),
}));

export const projectAdAccountsRelations = relations(projectAdAccounts, ({ one }) => ({
  project: one(projects, { fields: [projectAdAccounts.projectId], references: [projects.id] }),
}));

export const projectAttrFieldsRelations = relations(projectAttrFields, ({ one }) => ({
  project: one(projects, { fields: [projectAttrFields.projectId], references: [projects.id] }),
}));

export const brandsRelations = relations(brands, ({ one, many }) => ({
  project: one(projects, { fields: [brands.projectId], references: [projects.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  project: one(projects, { fields: [products.projectId], references: [projects.id] }),
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
}));

export const locationsRelations = relations(locations, ({ one }) => ({
  project: one(projects, { fields: [locations.projectId], references: [projects.id] }),
}));

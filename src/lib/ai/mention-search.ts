import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { MentionType } from "@/lib/ai/stats-query";
import { getDb } from "@/lib/db/client";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import { scopeConditions, type ViewerScope } from "@/lib/db/leads-repo";
import { appUsers, brands, leads, locations, metaAdInsights, products } from "@/lib/db/schema";

export interface MentionHit {
  id: string;
  label: string;
  hint: string | null;
}

function needle(query: string) {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

async function getProjectPageScope(viewer: ViewerScope): Promise<string[] | null> {
  if (viewer.activeProjectId) {
    const projectPages = await listFacebookPages({ projectId: viewer.activeProjectId });
    const projectPageIds = projectPages.map((p) => p.facebookPageId);
    if (viewer.role === "SUPER_ADMIN") {
      return projectPageIds;
    }
    return viewer.pageIds.filter((id) => projectPageIds.includes(id));
  }
  if (viewer.role === "SUPER_ADMIN") return null;
  return viewer.pageIds;
}

export async function searchMentions(viewer: ViewerScope, type: MentionType, query: string): Promise<MentionHit[]> {
  const q = needle(query);
  if (type === "fanpage") return searchPages(viewer, q);
  if (type === "lead") return searchLeads(viewer, q);
  if (type === "assignee") return searchStaff(viewer, q);
  if (type === "product") return searchProducts(viewer, q);
  if (type === "brand") return searchBrands(viewer, q);
  if (type === "location") return searchLocations(viewer, q);

  const scopedPages = await getProjectPageScope(viewer);
  if (type === "campaign") return searchCampaigns(scopedPages, q);
  if (type === "ad") return searchAds(scopedPages, q);
  return [];
}

async function searchPages(viewer: ViewerScope, q: string): Promise<MentionHit[]> {
  const allowed = viewer.role === "SUPER_ADMIN" ? null : new Set(viewer.pageIds);
  const pages = await listFacebookPages(
    viewer.activeProjectId ? { projectId: viewer.activeProjectId } : undefined,
  );
  return pages
    .filter((page) => (allowed ? allowed.has(page.facebookPageId) : true))
    .filter((page) => !q || needle(page.name ?? page.facebookPageId).includes(q))
    .slice(0, 20)
    .map((page) => ({ id: page.facebookPageId, label: page.name ?? page.facebookPageId, hint: null }));
}

async function searchCampaigns(pageIds: string[] | null, q: string): Promise<MentionHit[]> {
  if (pageIds && pageIds.length === 0) return [];
  const parts = [eq(metaAdInsights.level, "ad"), sql`${metaAdInsights.campaignId} is not null`];
  if (pageIds) parts.push(inArray(metaAdInsights.pageId, pageIds));
  if (q) parts.push(sql`lower(unaccent(coalesce(${metaAdInsights.campaignName}, ''))) like ${`%${q}%`}`);
  const rows = await getDb()
    .select({
      id: metaAdInsights.campaignId,
      label: sql<string>`max(${metaAdInsights.campaignName})`,
      leads: sql<number>`coalesce(sum(${metaAdInsights.leads}), 0)`,
    })
    .from(metaAdInsights)
    .where(and(...parts))
    .groupBy(metaAdInsights.campaignId)
    .orderBy(desc(sql`coalesce(sum(${metaAdInsights.leads}), 0)`))
    .limit(20);
  return rows.flatMap((row) => (row.id && row.label ? [{ id: row.id, label: row.label, hint: `${row.leads} lead quảng cáo` }] : []));
}

async function searchAds(pageIds: string[] | null, q: string): Promise<MentionHit[]> {
  if (pageIds && pageIds.length === 0) return [];
  const parts = [eq(metaAdInsights.level, "ad")];
  if (pageIds) parts.push(inArray(metaAdInsights.pageId, pageIds));
  if (q) {
    parts.push(
      sql`(lower(unaccent(coalesce(${metaAdInsights.objectName}, ''))) like ${`%${q}%`} or lower(unaccent(coalesce(${metaAdInsights.campaignName}, ''))) like ${`%${q}%`})`,
    );
  }
  const rows = await getDb()
    .select({
      id: metaAdInsights.objectId,
      label: sql<string>`coalesce(max(${metaAdInsights.objectName}), ${metaAdInsights.objectId})`,
      hint: sql<string | null>`max(${metaAdInsights.campaignName})`,
      leads: sql<number>`coalesce(sum(${metaAdInsights.leads}), 0)`,
    })
    .from(metaAdInsights)
    .where(and(...parts))
    .groupBy(metaAdInsights.objectId)
    .orderBy(desc(sql`coalesce(sum(${metaAdInsights.leads}), 0)`))
    .limit(20);
  return rows.map((row) => ({ id: row.id, label: row.label ?? row.id, hint: row.hint }));
}

async function searchLeads(viewer: ViewerScope, q: string): Promise<MentionHit[]> {
  const parts = [...scopeConditions(viewer)];
  if (q) {
    parts.push(sql`lower(unaccent(coalesce(${leads.name}, '') || ' ' || ${leads.phone})) like ${`%${q}%`}`);
  }
  const rows = await getDb()
    .select({ id: leads.id, name: leads.name, phone: leads.phone })
    .from(leads)
    .where(parts.length ? and(...parts) : undefined)
    .orderBy(desc(leads.createdAt))
    .limit(15);
  return rows.map((row) => ({ id: row.id, label: row.name ?? "Không tên", hint: row.phone }));
}

async function searchStaff(viewer: ViewerScope, q: string): Promise<MentionHit[]> {
  const parts = [eq(appUsers.role, "STAFF"), eq(appUsers.active, true)];
  if (viewer.role !== "SUPER_ADMIN") {
    const partnerId = viewer.role === "PARTNER_ADMIN" ? viewer.appUserId : null;
    if (!partnerId) return [];
    parts.push(eq(appUsers.partnerId, partnerId));
  }
  if (viewer.activeProjectId) {
    parts.push(
      sql`(${appUsers.projectId} = ${viewer.activeProjectId} or ${appUsers.id} in (select user_id from project_members where project_id = ${viewer.activeProjectId}))`,
    );
  }
  if (q) parts.push(sql`lower(unaccent(${appUsers.fullName})) like ${`%${q}%`}`);
  const rows = await getDb()
    .select({ id: appUsers.id, label: appUsers.fullName })
    .from(appUsers)
    .where(and(...parts))
    .orderBy(asc(appUsers.fullName))
    .limit(20);
  return rows.map((row) => ({ id: row.id, label: row.label, hint: null }));
}

async function searchProducts(viewer: ViewerScope, q: string): Promise<MentionHit[]> {
  const parts = [eq(products.active, true)];
  if (viewer.activeProjectId) {
    parts.push(eq(products.projectId, viewer.activeProjectId));
  }
  if (q) parts.push(sql`lower(unaccent(${products.name})) like ${`%${q}%`}`);
  const rows = await getDb()
    .select({ id: products.id, label: products.name })
    .from(products)
    .where(and(...parts))
    .orderBy(asc(products.name))
    .limit(20);
  return rows.map((row) => ({ id: row.id, label: row.label, hint: null }));
}

async function searchBrands(viewer: ViewerScope, q: string): Promise<MentionHit[]> {
  const parts = [eq(brands.active, true)];
  if (viewer.activeProjectId) {
    parts.push(eq(brands.projectId, viewer.activeProjectId));
  }
  if (q) parts.push(sql`lower(unaccent(${brands.name} || ' ' || ${brands.code})) like ${`%${q}%`}`);
  const rows = await getDb()
    .select({ id: brands.code, label: brands.name, hint: brands.code })
    .from(brands)
    .where(and(...parts))
    .orderBy(asc(brands.sortOrder), asc(brands.name))
    .limit(20);
  return rows.map((row) => ({ id: row.id, label: row.label, hint: row.hint }));
}

async function searchLocations(viewer: ViewerScope, q: string): Promise<MentionHit[]> {
  const parts = [eq(locations.active, true)];
  if (viewer.activeProjectId) {
    parts.push(eq(locations.projectId, viewer.activeProjectId));
  }
  if (q) parts.push(sql`lower(unaccent(${locations.name})) like ${`%${q}%`}`);
  const rows = await getDb()
    .select({ id: locations.id, label: locations.name })
    .from(locations)
    .where(and(...parts))
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .limit(20);
  return rows.map((row) => ({ id: row.id, label: row.label, hint: null }));
}

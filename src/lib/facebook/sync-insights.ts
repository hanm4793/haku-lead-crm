import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { metaAdInsights, metaSyncRuns } from "@/lib/db/schema";

import { getFacebookConfig } from "./env";
import { graphGetAllData } from "./graph-client";

export interface SyncInsightsResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
  runId: string;
  since: string;
  until: string;
}

type ActionValue = {
  action_type?: string;
  value?: string;
};

type FacebookCampaignInsight = {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: ActionValue[];
  cpc?: string;
  cpm?: string;
  ctr?: string;
  cost_per_action_type?: ActionValue[];
};

const INSIGHT_FIELDS =
  "campaign_id,campaign_name,spend,impressions,clicks,reach,actions,cpc,cpm,ctr,cost_per_action_type";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PREFERRED_LEAD_ACTIONS = [
  "lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.messaging_lead",
  "offsite_conversion.fb_pixel_lead",
];

function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseUtcDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toUtcDateString(parsed) === value ? parsed : null;
}

function resolveRange(options?: { since?: string; until?: string }) {
  const until = options?.until ?? toUtcDateString(new Date());
  const untilDate = parseUtcDate(until);
  if (!untilDate) throw new Error("Ngày kết thúc Insights không hợp lệ.");

  const defaultSince = new Date(untilDate);
  defaultSince.setUTCDate(defaultSince.getUTCDate() - 29);
  const since = options?.since ?? toUtcDateString(defaultSince);
  const sinceDate = parseUtcDate(since);
  if (!sinceDate) throw new Error("Ngày bắt đầu Insights không hợp lệ.");
  if (sinceDate > untilDate) throw new Error("Ngày bắt đầu Insights phải trước ngày kết thúc.");

  return { since, until };
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: string | undefined): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function isLeadAction(actionType: string): boolean {
  return (
    PREFERRED_LEAD_ACTIONS.includes(actionType) ||
    /(?:^|[._])lead(?:s|_grouped)?$/.test(actionType) ||
    actionType.includes("messaging_lead")
  );
}

function canonicalLeadAction(values: ActionValue[] | undefined) {
  if (!values) return null;
  for (const preferred of PREFERRED_LEAD_ACTIONS) {
    for (const item of values) {
      if (item.action_type !== preferred) continue;
      const value = finiteNumber(item.value);
      if (value !== null) return { actionType: preferred, value };
    }
  }
  for (const item of values) {
    const actionType = item.action_type;
    if (!actionType || !isLeadAction(actionType)) continue;
    const value = finiteNumber(item.value);
    if (value !== null) return { actionType, value };
  }
  return null;
}

function matchingLeadCost(values: ActionValue[] | undefined, actionType: string): number | null {
  if (!values) return null;
  for (const item of values) {
    if (item.action_type !== actionType) continue;
    const value = finiteNumber(item.value);
    if (value !== null) return value;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Insights sync error";
}

export async function syncFacebookInsights(options?: {
  since?: string;
  until?: string;
}): Promise<SyncInsightsResult> {
  const config = getFacebookConfig();
  if (!config) throw new Error("Facebook Graph is not configured");
  if (!config.adAccountId) throw new Error("Thiếu FACEBOOK_AD_ACCOUNT_ID");

  const { since, until } = resolveRange(options);
  const db = getDb();
  const [run] = await db
    .insert(metaSyncRuns)
    .values({
      kind: "insights",
      status: "error",
      message: `Facebook Insights sync started for ${since} to ${until}.`,
    })
    .returning({ id: metaSyncRuns.id });

  if (!run) throw new Error("Could not create Facebook Insights sync run");

  const counts = { imported: 0, updated: 0, skipped: 0, errors: 0 };
  const errors: string[] = [];

  try {
    const rows = await graphGetAllData<FacebookCampaignInsight>(
      `/${config.adAccountId}/insights`,
      {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields: INSIGHT_FIELDS,
      },
    );

    for (const row of rows) {
      const objectId = optionalText(row.campaign_id);
      const dateStart = row.date_start ? parseUtcDate(row.date_start) : null;
      if (!objectId || !dateStart) {
        counts.skipped += 1;
        continue;
      }

      const leadAction = canonicalLeadAction(row.actions);
      const values = {
        level: "campaign" as const,
        objectId,
        objectName: optionalText(row.campaign_name),
        dateStart,
        dateStop: row.date_stop ? parseUtcDate(row.date_stop) : null,
        spend: finiteNumber(row.spend),
        impressions: integer(row.impressions),
        clicks: integer(row.clicks),
        reach: integer(row.reach),
        leads: leadAction ? Math.round(leadAction.value) : null,
        cpc: finiteNumber(row.cpc),
        cpm: finiteNumber(row.cpm),
        ctr: finiteNumber(row.ctr),
        costPerLead: leadAction
          ? matchingLeadCost(row.cost_per_action_type, leadAction.actionType)
          : null,
        syncedAt: new Date(),
      };

      try {
        const [upserted] = await db
          .insert(metaAdInsights)
          .values(values)
          .onConflictDoUpdate({
            target: [metaAdInsights.level, metaAdInsights.objectId, metaAdInsights.dateStart],
            set: {
              objectName: values.objectName,
              dateStop: values.dateStop,
              spend: values.spend,
              impressions: values.impressions,
              clicks: values.clicks,
              reach: values.reach,
              leads: values.leads,
              cpc: values.cpc,
              cpm: values.cpm,
              ctr: values.ctr,
              costPerLead: values.costPerLead,
              syncedAt: values.syncedAt,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });

        if (!upserted) throw new Error(`Could not upsert Insight for ${objectId}`);
        if (upserted.inserted) counts.imported += 1;
        else counts.updated += 1;
      } catch (error) {
        counts.errors += 1;
        if (errors.length < 5) errors.push(errorMessage(error));
      }
    }

    const summary = `Imported ${counts.imported}, updated ${counts.updated}, skipped ${counts.skipped}, errors ${counts.errors}.`;
    const message = errors.length ? `${summary} Error details: ${errors.join("; ")}` : summary;
    await db
      .update(metaSyncRuns)
      .set({
        status: counts.errors === 0 || counts.imported + counts.updated > 0 ? "ok" : "error",
        finishedAt: new Date(),
        ...counts,
        message,
      })
      .where(eq(metaSyncRuns.id, run.id));

    return { ...counts, message, runId: run.id, since, until };
  } catch (error) {
    await db
      .update(metaSyncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        ...counts,
        message: errorMessage(error),
      })
      .where(eq(metaSyncRuns.id, run.id));
    throw error;
  }
}

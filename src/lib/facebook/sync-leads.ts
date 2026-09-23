import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { activityLogs, leads, metaSyncRuns } from "@/lib/db/schema";

import { getFacebookConfig } from "./env";
import { FacebookGraphError, graphGetAllData } from "./graph-client";
import { mapFacebookLeadFields, type FacebookFieldDatum } from "./map-lead";

export interface SyncLeadsResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
  runId: string;
}

type FacebookForm = {
  id: string;
  name?: string;
};

type FacebookLead = {
  id: string;
  created_time?: string;
  field_data?: FacebookFieldDatum[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
};

const DETAILED_LEAD_FIELDS =
  "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name";
const BASIC_LEAD_FIELDS = "id,created_time,field_data";

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseCreatedAt(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function resultMessage(counts: Omit<SyncLeadsResult, "message" | "runId">): string {
  return `Imported ${counts.imported}, updated ${counts.updated}, skipped ${counts.skipped}, errors ${counts.errors}.`;
}

async function fetchFormLeads(formId: string): Promise<FacebookLead[]> {
  try {
    return await graphGetAllData<FacebookLead>(`/${formId}/leads`, {
      fields: DETAILED_LEAD_FIELDS,
    });
  } catch (error) {
    if (!(error instanceof FacebookGraphError)) throw error;
    return graphGetAllData<FacebookLead>(`/${formId}/leads`, {
      fields: BASIC_LEAD_FIELDS,
    });
  }
}

export async function syncFacebookLeads(): Promise<SyncLeadsResult> {
  const config = getFacebookConfig();
  if (!config) {
    throw new Error("Facebook Graph is not configured");
  }

  const db = getDb();
  const [run] = await db
    .insert(metaSyncRuns)
    .values({
      kind: "leads",
      status: "error",
      message: "Facebook lead sync started.",
    })
    .returning({ id: metaSyncRuns.id });

  if (!run) {
    throw new Error("Could not create Facebook lead sync run");
  }

  const counts = { imported: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    const forms = await graphGetAllData<FacebookForm>(`/${config.pageId}/leadgen_forms`, {
      fields: "id,name",
    });

    for (const form of forms) {
      let formLeads: FacebookLead[];
      try {
        formLeads = await fetchFormLeads(form.id);
      } catch {
        counts.errors += 1;
        continue;
      }

      for (const facebookLead of formLeads) {
        const mapped = mapFacebookLeadFields(facebookLead.field_data ?? [], {
          campaignName: facebookLead.campaign_name,
          adName: facebookLead.ad_name,
        });
        if (!mapped.ok) {
          counts.skipped += 1;
          continue;
        }

        try {
          const [existing] = await db
            .select({ id: leads.id })
            .from(leads)
            .where(eq(leads.facebookLeadId, facebookLead.id))
            .limit(1);

          const facebookMetadata = {
            name: mapped.name,
            campaign: mapped.campaign,
            adContent: mapped.adContent,
            facebookFormId: form.id,
            facebookPageId: config.pageId,
            facebookAdId: optionalText(facebookLead.ad_id),
            facebookAdsetId: optionalText(facebookLead.adset_id),
            facebookCampaignId: optionalText(facebookLead.campaign_id),
          };

          if (existing) {
            await db
              .update(leads)
              .set({ ...facebookMetadata, updatedAt: new Date() })
              .where(eq(leads.id, existing.id));
            counts.updated += 1;
            continue;
          }

          const createdAt = parseCreatedAt(facebookLead.created_time);
          const [inserted] = await db
            .insert(leads)
            .values({
              ...facebookMetadata,
              ...(createdAt ? { createdAt } : {}),
              phone: mapped.phone,
              source: "FACEBOOK",
              channelDetail: "FORM",
              facebookLeadId: facebookLead.id,
              showroomId: null,
              salesRoomId: null,
              brand: null,
              assigneeId: null,
              costPerLead: null,
            })
            .returning({ id: leads.id });

          if (!inserted) {
            throw new Error(`Could not insert Facebook lead ${facebookLead.id}`);
          }

          await db.insert(activityLogs).values({
            leadId: inserted.id,
            kind: "CREATE",
            message: "Lead created from Facebook Lead Ads.",
            actorName: "Facebook sync",
          });
          counts.imported += 1;
        } catch {
          counts.errors += 1;
        }
      }
    }

    const message = resultMessage(counts);
    await db
      .update(metaSyncRuns)
      .set({
        status: counts.errors > 0 ? "error" : "ok",
        finishedAt: new Date(),
        ...counts,
        message,
      })
      .where(eq(metaSyncRuns.id, run.id));

    return { ...counts, message, runId: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook lead sync failed.";
    await db
      .update(metaSyncRuns)
      .set({ status: "error", finishedAt: new Date(), ...counts, message })
      .where(eq(metaSyncRuns.id, run.id));
    throw error;
  }
}

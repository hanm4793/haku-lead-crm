import { eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { activityLogs, facebookPages, leads, metaSyncRuns } from "@/lib/db/schema";

import { getFacebookConfig } from "./env";
import {
  getFacebookPageProjectId,
  resolveActiveFacebookPageIds,
} from "@/lib/db/facebook-pages-repo";
import { getDefaultProject } from "@/lib/db/project-repo";
import { FacebookGraphError, graphGet, graphGetAllData } from "./graph-client";
import {
  mapFacebookCommentLead,
  mapFacebookConversationLead,
  mapFacebookLeadFields,
  type FacebookCommentNode,
  type FacebookConversationNode,
  type FacebookFieldDatum,
} from "./map-lead";
import { resolvePageAccessTokens } from "./page-tokens";
import { syncScopeTag } from "./sync-scope";

export interface SyncLeadsResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
  runId: string;
  byChannel?: {
    form: number;
    message: number;
    comment: number;
  };
  warnings?: string[];
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

type FacebookPostNode = {
  id: string;
  message?: string;
  created_time?: string;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown sync error";
}

function isPermissionError(error: unknown): boolean {
  if (!(error instanceof FacebookGraphError)) return false;
  return (
    error.code === 200 ||
    error.code === 10 ||
    error.code === 190 ||
    /requires?\b.*\bpermission/i.test(error.message)
  );
}

function resultMessage(
  counts: { imported: number; updated: number; skipped: number; errors: number },
  byChannel: { form: number; message: number; comment: number },
  warnings: string[],
  errorDetails: string[],
): string {
  const channelSummary = `(Form: ${byChannel.form}, Tin nhắn: ${byChannel.message}, Comment: ${byChannel.comment})`;
  const summary = `Imported ${counts.imported}, updated ${counts.updated}, skipped ${counts.skipped}, errors ${counts.errors} ${channelSummary}.`;
  const parts = [summary];
  if (warnings.length > 0) {
    parts.push(`Lưu ý quyền Token: ${warnings.join("; ")}`);
  }
  if (errorDetails.length > 0) {
    parts.push(`Error details: ${errorDetails.join("; ")}`);
  }
  return parts.join(" ");
}

function isInvalidFieldError(error: unknown): error is FacebookGraphError {
  if (!(error instanceof FacebookGraphError)) return false;
  return (
    /\b(?:invalid|unknown|nonexisting|non-existent)\b.*\bfields?\b/i.test(error.message) ||
    /\bfields?\b.*\b(?:invalid|unknown|nonexisting|non-existent)\b/i.test(error.message)
  );
}

async function fetchFormLeads(formId: string, pageAccessToken: string): Promise<FacebookLead[]> {
  try {
    return await graphGetAllData<FacebookLead>(
      `/${formId}/leads`,
      { fields: DETAILED_LEAD_FIELDS },
      { accessToken: pageAccessToken },
    );
  } catch (error) {
    if (!isInvalidFieldError(error)) throw error;
    return graphGetAllData<FacebookLead>(
      `/${formId}/leads`,
      { fields: BASIC_LEAD_FIELDS },
      { accessToken: pageAccessToken },
    );
  }
}

async function refreshFacebookPageName(pageId: string, name: string | null) {
  if (!name) return;
  const db = getDb();
  await db
    .update(facebookPages)
    .set({ name, updatedAt: new Date() })
    .where(eq(facebookPages.facebookPageId, pageId));
}

export async function syncFacebookLeads(options?: { projectId?: string }): Promise<SyncLeadsResult> {
  const tag = syncScopeTag(options?.projectId);
  const config = getFacebookConfig();
  if (!config) {
    throw new Error("Facebook Graph is not configured (thiếu FACEBOOK_ACCESS_TOKEN).");
  }

  const pageIds = await resolveActiveFacebookPageIds(options?.projectId);
  if (pageIds.length === 0) {
    throw new Error(
      options?.projectId
        ? "Dự án chưa có Fanpage nào đang bật để đồng bộ."
        : "Chưa có Fanpage nào để đồng bộ. Thêm Page ID trong Cài đặt hoặc FACEBOOK_PAGE_IDS.",
    );
  }

  const db = getDb();
  const [run] = await db
    .insert(metaSyncRuns)
    .values({
      kind: "leads",
      status: "error",
      message: `${tag}Facebook lead sync started.`,
    })
    .returning({ id: metaSyncRuns.id });

  if (!run) {
    throw new Error("Could not create Facebook lead sync run");
  }

  const counts = { imported: 0, updated: 0, skipped: 0, errors: 0 };
  const byChannel = { form: 0, message: 0, comment: 0 };
  const errorDetails: string[] = [];
  const warningSet = new Set<string>();

  function recordError(error: unknown) {
    counts.errors += 1;
    if (errorDetails.length < 5) errorDetails.push(errorMessage(error));
  }

  function recordWarning(msg: string) {
    if (warningSet.size < 5) warningSet.add(msg);
  }

  try {
    const pageTokens = await resolvePageAccessTokens(pageIds);
    const fallbackProjectId = (await getDefaultProject().catch(() => null))?.id ?? null;

    async function findExistingLead(fbLeadId: string) {
      const [row] = await db
        .select({
          id: leads.id,
          phone: leads.phone,
          careNote: leads.careNote,
          attrs: leads.attrs,
        })
        .from(leads)
        .where(eq(leads.facebookLeadId, fbLeadId))
        .limit(1);
      return row ?? null;
    }

    for (const pageId of pageIds) {
      const projectId = (await getFacebookPageProjectId(pageId)) ?? fallbackProjectId;
      const pageAuth = pageTokens.get(pageId);
      if (!pageAuth) {
        recordError(
          new Error(
            `Page ${pageId}: thiếu Page Access Token (user token chưa có quyền Page này).`,
          ),
        );
        continue;
      }

      await refreshFacebookPageName(pageId, pageAuth.name).catch(() => undefined);

      // =======================================================================
      // KÊNH 1: LEAD FORM (`/{pageId}/leadgen_forms` -> `channelDetail: "FORM"`)
      // =======================================================================
      let forms: FacebookForm[] = [];
      try {
        forms = await graphGetAllData<FacebookForm>(
          `/${pageId}/leadgen_forms`,
          { fields: "id,name" },
          { accessToken: pageAuth.token },
        );
      } catch (error) {
        recordError(new Error(`Page ${pageId} (Lead Form): ${errorMessage(error)}`));
      }

      for (const form of forms) {
        let formLeads: FacebookLead[];
        try {
          formLeads = await fetchFormLeads(form.id, pageAuth.token);
        } catch (error) {
          recordError(error);
          continue;
        }

        for (const facebookLead of formLeads) {
          const mapped = mapFacebookLeadFields(facebookLead.field_data ?? [], {
            campaignName: facebookLead.campaign_name,
            adName: facebookLead.ad_name,
          });

          try {
            const existing = await findExistingLead(facebookLead.id);
            const hasAttrs = Object.keys(mapped.attrs).length > 0;
            const facebookMetadata = {
              ...(mapped.name !== null ? { name: mapped.name } : {}),
              ...(mapped.campaign !== null ? { campaign: mapped.campaign } : {}),
              ...(mapped.adContent !== null ? { adContent: mapped.adContent } : {}),
              ...(projectId ? { projectId } : {}),
              ...(hasAttrs ? { attrs: { ...(existing?.attrs ?? {}), ...mapped.attrs } } : {}),
              facebookFormId: form.id,
              facebookPageId: pageId,
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
              byChannel.form += 1;
              continue;
            }

            const createdAt = parseCreatedAt(facebookLead.created_time);
            await db.transaction(async (tx) => {
              const [inserted] = await tx
                .insert(leads)
                .values({
                  ...facebookMetadata,
                  ...(createdAt ? { createdAt } : {}),
                  phone: mapped.phone,
                  source: "FACEBOOK",
                  channelDetail: "FORM",
                  facebookLeadId: facebookLead.id,
                  projectId,
                  brandId: null,
                  productId: null,
                  locationId: null,
                  assigneeId: null,
                  attrs: mapped.attrs,
                  costPerLead: null,
                })
                .returning({ id: leads.id });

              if (!inserted) {
                throw new Error(`Could not insert Facebook lead ${facebookLead.id}`);
              }

              await tx.insert(activityLogs).values({
                leadId: inserted.id,
                kind: "CREATE",
                message: "Lead created from Facebook Lead Ads (Form).",
                actorName: "Facebook sync",
              });
            });
            counts.imported += 1;
            byChannel.form += 1;
          } catch (error) {
            recordError(error);
          }
        }
      }

      // =======================================================================
      // KÊNH 2: LEAD TIN NHẮN (`/{pageId}/conversations` -> `channelDetail: "TIN_NHAN"`)
      // =======================================================================
      try {
        const convRes = await graphGet<{ data?: FacebookConversationNode[] }>(
          `/${pageId}/conversations`,
          {
            fields:
              "id,updated_time,link,participants,messages.limit(20){id,message,from,created_time}",
            limit: "50",
          },
          { accessToken: pageAuth.token },
        );
        const conversations = convRes?.data ?? [];

        for (const conv of conversations) {
          const mapped = mapFacebookConversationLead(conv, pageId);
          if (!mapped) continue;

          try {
            const existing = await findExistingLead(mapped.facebookLeadId);
            if (existing) {
              const nextAttrs = { ...(existing.attrs ?? {}), ...mapped.attrs };
              const nextPhone = !existing.phone && mapped.phone ? mapped.phone : existing.phone;
              const nextCareNote =
                !existing.careNote && mapped.careNote ? mapped.careNote : existing.careNote;

              await db
                .update(leads)
                .set({
                  ...(mapped.name ? { name: mapped.name } : {}),
                  ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
                  ...(nextCareNote !== undefined ? { careNote: nextCareNote } : {}),
                  attrs: nextAttrs,
                  ...(projectId ? { projectId } : {}),
                  facebookPageId: pageId,
                  updatedAt: new Date(),
                })
                .where(eq(leads.id, existing.id));
              counts.updated += 1;
              byChannel.message += 1;
              continue;
            }

            await db.transaction(async (tx) => {
              const [inserted] = await tx
                .insert(leads)
                .values({
                  name: mapped.name,
                  phone: mapped.phone,
                  source: "FACEBOOK",
                  channelDetail: "TIN_NHAN",
                  facebookLeadId: mapped.facebookLeadId,
                  facebookPageId: pageId,
                  projectId,
                  ...(mapped.createdAt ? { createdAt: mapped.createdAt } : {}),
                  careNote: mapped.careNote ?? "",
                  attrs: mapped.attrs,
                })
                .returning({ id: leads.id });

              if (!inserted) {
                throw new Error(`Could not insert Messenger lead ${mapped.facebookLeadId}`);
              }

              await tx.insert(activityLogs).values({
                leadId: inserted.id,
                kind: "CREATE",
                message: "Lead đồng bộ từ Hộp thư Tin nhắn Fanpage (Messenger).",
                actorName: "Facebook sync",
              });
            });
            counts.imported += 1;
            byChannel.message += 1;
          } catch (error) {
            recordError(error);
          }
        }
      } catch (error) {
        if (isPermissionError(error)) {
          recordWarning(
            `Thiếu quyền "pages_messaging" trên FACEBOOK_ACCESS_TOKEN để đồng bộ Lead Tin nhắn (Messenger)`,
          );
        } else {
          recordError(new Error(`Page ${pageId} (Messenger): ${errorMessage(error)}`));
        }
      }

      // =======================================================================
      // KÊNH 3: LEAD BÌNH LUẬN (`/{pageId}/published_posts` -> `/{postId}/comments` -> `channelDetail: "COMMENT"`)
      // =======================================================================
      try {
        const postsRes = await graphGet<{ data?: FacebookPostNode[] }>(
          `/${pageId}/published_posts`,
          { fields: "id,message,created_time", limit: "15" },
          { accessToken: pageAuth.token },
        );
        const posts = postsRes?.data ?? [];

        for (const post of posts) {
          let comments: FacebookCommentNode[] = [];
          try {
            const commentsRes = await graphGet<{ data?: FacebookCommentNode[] }>(
              `/${post.id}/comments`,
              {
                fields: "id,message,from,created_time,permalink_url",
                filter: "stream",
                limit: "50",
              },
              { accessToken: pageAuth.token },
            );
            comments = commentsRes?.data ?? [];
          } catch (commentErr) {
            if (isPermissionError(commentErr)) {
              recordWarning(
                `Thiếu quyền "pages_read_user_content" trên FACEBOOK_ACCESS_TOKEN để đồng bộ Lead Bình luận (Comment)`,
              );
              break;
            }
            continue;
          }

          for (const comment of comments) {
            const mapped = mapFacebookCommentLead(comment, pageId, {
              postId: post.id,
              postMessage: post.message,
            });
            if (!mapped) continue;

            try {
              const existing = await findExistingLead(mapped.facebookLeadId);
              if (existing) {
                const nextAttrs = { ...(existing.attrs ?? {}), ...mapped.attrs };
                const nextPhone = !existing.phone && mapped.phone ? mapped.phone : existing.phone;
                await db
                  .update(leads)
                  .set({
                    ...(mapped.name ? { name: mapped.name } : {}),
                    ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
                    attrs: nextAttrs,
                    ...(projectId ? { projectId } : {}),
                    facebookPageId: pageId,
                    updatedAt: new Date(),
                  })
                  .where(eq(leads.id, existing.id));
                counts.updated += 1;
                byChannel.comment += 1;
                continue;
              }

              await db.transaction(async (tx) => {
                const [inserted] = await tx
                  .insert(leads)
                  .values({
                    name: mapped.name,
                    phone: mapped.phone,
                    source: "FACEBOOK",
                    channelDetail: "COMMENT",
                    facebookLeadId: mapped.facebookLeadId,
                    facebookPageId: pageId,
                    projectId,
                    ...(mapped.createdAt ? { createdAt: mapped.createdAt } : {}),
                    adContent: mapped.adContent,
                    careNote: mapped.careNote ?? "",
                    attrs: mapped.attrs,
                  })
                  .returning({ id: leads.id });

                if (!inserted) {
                  throw new Error(`Could not insert Comment lead ${mapped.facebookLeadId}`);
                }

                await tx.insert(activityLogs).values({
                  leadId: inserted.id,
                  kind: "CREATE",
                  message: "Lead đồng bộ từ Bình luận Fanpage (Comment).",
                  actorName: "Facebook sync",
                });
              });
              counts.imported += 1;
              byChannel.comment += 1;
            } catch (error) {
              recordError(error);
            }
          }
        }
      } catch (error) {
        if (isPermissionError(error)) {
          recordWarning(
            `Thiếu quyền "pages_read_user_content" trên FACEBOOK_ACCESS_TOKEN để đồng bộ Lead Bình luận (Comment)`,
          );
        } else {
          recordError(new Error(`Page ${pageId} (Comments): ${errorMessage(error)}`));
        }
      }
    }

    const warnings = [...warningSet];
    const message = resultMessage(counts, byChannel, warnings, errorDetails);
    await db
      .update(metaSyncRuns)
      .set({
        status: counts.errors === 0 || counts.imported + counts.updated > 0 ? "ok" : "error",
        finishedAt: new Date(),
        ...counts,
        message: `${tag}${message}`,
      })
      .where(eq(metaSyncRuns.id, run.id));

    return { ...counts, byChannel, warnings, message, runId: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook lead sync failed.";
    await db
      .update(metaSyncRuns)
      .set({ status: "error", finishedAt: new Date(), ...counts, message: `${tag}${message}` })
      .where(eq(metaSyncRuns.id, run.id));
    throw error;
  }
}

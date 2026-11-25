import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { activityLogs, facebookPages, leads, metaSyncRuns } from "@/lib/db/schema";
import { normalizePhone, phoneKey } from "@/lib/leads/phone";

import { getFacebookConfig } from "./env";
import {
  getFacebookPageProjectId,
  resolveActiveFacebookPageIds,
} from "@/lib/db/facebook-pages-repo";
import { getDefaultProject } from "@/lib/db/project-repo";
import { notifyNewFacebookLeads } from "@/lib/push/web-push";
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
  status?: string;
  leads_count?: number;
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
  comments?: { data?: FacebookCommentNode[] };
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

async function fetchFormLeads(
  formId: string,
  pageAccessToken: string,
  cutoffMs: number | null = null,
): Promise<FacebookLead[]> {
  const filterParam: Record<string, string> =
    cutoffMs !== null
      ? {
          filtering: JSON.stringify([
            { field: "time_created", operator: "GREATER_THAN", value: Math.floor(cutoffMs / 1000) },
          ]),
        }
      : {};
  try {
    return await graphGetAllData<FacebookLead>(
      `/${formId}/leads`,
      { fields: DETAILED_LEAD_FIELDS, ...filterParam },
      { accessToken: pageAccessToken },
    );
  } catch (error) {
    if (!isInvalidFieldError(error)) throw error;
    return graphGetAllData<FacebookLead>(
      `/${formId}/leads`,
      { fields: BASIC_LEAD_FIELDS, ...filterParam },
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

export async function syncFacebookLeads(options?: { projectId?: string; recentDays?: number }): Promise<SyncLeadsResult> {
  const cutoffMs = options?.recentDays ? Date.now() - options.recentDays * 86_400_000 : null;
  const recentPushThresholdMs = Date.now() - 48 * 3_600_000;
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
  const newlyImportedLeads: {
    leadId: string;
    name: string | null;
    phone: string;
    pageId: string;
    pageName: string | null;
  }[] = [];

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

    const phoneLocks = new Map<string, Promise<void>>();
    async function withPhoneLock(
      pageId: string,
      phone: string,
      fn: () => Promise<void>,
    ): Promise<void> {
      const pKey = phone ? phoneKey(phone) : "";
      if (!pKey) {
        await fn();
        return;
      }
      const lockKey = `${pageId}::${pKey}`;
      const prev = phoneLocks.get(lockKey) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const current = prev.then(() => gate);
      phoneLocks.set(lockKey, current);
      await prev;
      try {
        await fn();
      } finally {
        release();
        if (phoneLocks.get(lockKey) === current) {
          phoneLocks.delete(lockKey);
        }
      }
    }

    async function findExistingLead(
      fbLeadId: string,
      pageId: string,
      phone?: string,
    ) {
      const pKey = phone ? phoneKey(phone) : "";
      const whereClause =
        pKey.length >= 9
          ? or(
              eq(leads.facebookLeadId, fbLeadId),
              and(
                eq(leads.facebookPageId, pageId),
                ne(leads.phone, ""),
                sql`regexp_replace(regexp_replace(regexp_replace(${leads.phone}, '\\D', '', 'g'), '^840(\\d{9,10})$', '0\\1'), '^84(\\d{9}|2\\d{9})$', '0\\1') = ${pKey}`,
              ),
            )!
          : eq(leads.facebookLeadId, fbLeadId);

      const [row] = await db
        .select({
          id: leads.id,
          facebookLeadId: leads.facebookLeadId,
          channelDetail: leads.channelDetail,
          name: leads.name,
          phone: leads.phone,
          campaign: leads.campaign,
          adContent: leads.adContent,
          facebookFormId: leads.facebookFormId,
          careNote: leads.careNote,
          attrs: leads.attrs,
        })
        .from(leads)
        .where(whereClause)
        .orderBy(
          sql`case when ${leads.facebookLeadId} = ${fbLeadId} then 0 else 1 end`,
          asc(leads.createdAt),
        )
        .limit(1);
      return row ?? null;
    }

    let canSyncMessaging = true;
    let canSyncComments = true;
    async function syncSinglePage(pageId: string) {
      const pageAuth = pageTokens.get(pageId);
      if (!pageAuth) {
        counts.skipped += 1;
        return;
      }
      const projectId = (await getFacebookPageProjectId(pageId)) ?? fallbackProjectId;

      await refreshFacebookPageName(pageId, pageAuth.name).catch(() => undefined);

      // =======================================================================
      // KÊNH 1: LEAD FORM (`/{pageId}/leadgen_forms` -> `channelDetail: "FORM"`)
      // =======================================================================
      let forms: FacebookForm[] = [];
      try {
        forms = await graphGetAllData<FacebookForm>(
          `/${pageId}/leadgen_forms`,
          { fields: "id,name,status,leads_count", limit: "100" },
          { accessToken: pageAuth.token },
        );
      } catch (error) {
        recordError(new Error(`Page ${pageId} (Lead Form): ${errorMessage(error)}`));
      }

      const candidateForms = forms.filter(
        (f) =>
          (f.status === undefined || f.status === "ACTIVE" || cutoffMs === null) &&
          (f.leads_count === undefined || f.leads_count > 0),
      );

      const FORM_CONCURRENCY = 8;
      for (let fi = 0; fi < candidateForms.length; fi += FORM_CONCURRENCY) {
        const formBatch = candidateForms.slice(fi, fi + FORM_CONCURRENCY);
        await Promise.all(
          formBatch.map(async (form) => {
            let formLeads: FacebookLead[];
            try {
              formLeads = await fetchFormLeads(form.id, pageAuth.token, cutoffMs);
            } catch (error) {
              recordError(error);
              return;
            }

            for (const facebookLead of formLeads) {
              const leadCreatedAt = parseCreatedAt(facebookLead.created_time);
              if (cutoffMs !== null && leadCreatedAt && leadCreatedAt.getTime() < cutoffMs) {
                continue;
              }
              const mapped = mapFacebookLeadFields(facebookLead.field_data ?? [], {
                campaignName: facebookLead.campaign_name,
                adName: facebookLead.ad_name,
              });

              await withPhoneLock(pageId, mapped.phone, async () => {
                try {
                  const existing = await findExistingLead(facebookLead.id, pageId, mapped.phone);
                  const hasAttrs = Object.keys(mapped.attrs).length > 0;
                  const isCrossLead = Boolean(
                    existing?.facebookLeadId && existing.facebookLeadId !== facebookLead.id,
                  );

                  const shouldKeepExistingName =
                    isCrossLead &&
                    Boolean(existing?.name?.trim()) &&
                    existing?.name?.trim() !== "Khách bình luận Facebook";

                  const facebookMetadata = {
                    ...(!shouldKeepExistingName && mapped.name !== null ? { name: mapped.name } : {}),
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
                    const needsPhoneUpdate =
                      Boolean(mapped.phone) &&
                      existing.phone !== undefined &&
                      existing.phone !== mapped.phone;
                    if (cutoffMs === null || isCrossLead || (!existing.phone && mapped.phone) || needsPhoneUpdate) {
                      await db
                        .update(leads)
                        .set({
                          ...facebookMetadata,
                          ...(needsPhoneUpdate ? { phone: mapped.phone } : {}),
                          updatedAt: new Date(),
                        })
                        .where(eq(leads.id, existing.id));
                    }
                    counts.updated += 1;
                    byChannel.form += 1;
                    return;
                  }

                  const createdAt = parseCreatedAt(facebookLead.created_time);
                  const insertedId = await db.transaction(async (tx) => {
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

                    return inserted.id;
                  });
                  counts.imported += 1;
                  byChannel.form += 1;
                  if (!createdAt || createdAt.getTime() >= recentPushThresholdMs) {
                    newlyImportedLeads.push({
                      leadId: insertedId,
                      name: mapped.name,
                      phone: mapped.phone || "Chưa có SĐT",
                      pageId,
                      pageName: pageAuth.name ?? null,
                    });
                  }
                } catch (error) {
                  recordError(error);
                }
              });
            }
          }),
        );
      }

      if (canSyncMessaging) try {
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
          const convUpdated = parseCreatedAt(conv.updated_time);
          if (cutoffMs !== null && convUpdated && convUpdated.getTime() < cutoffMs) {
            continue;
          }
          const mapped = mapFacebookConversationLead(conv, pageId);
          if (!mapped || !mapped.phone) continue;

          await withPhoneLock(pageId, mapped.phone, async () => {
            try {
              const existing = await findExistingLead(mapped.facebookLeadId, pageId, mapped.phone);
              if (existing) {
                const isCrossChannel =
                  Boolean(existing.facebookLeadId && existing.facebookLeadId !== mapped.facebookLeadId) ||
                  (existing.channelDetail !== undefined && existing.channelDetail !== "TIN_NHAN");

                const incomingAttrs = { ...mapped.attrs };
                if (isCrossChannel && mapped.isOnlyFormEcho) {
                  delete incomingAttrs.noi_dung_tin_nhan;
                }
                const nextAttrs = { ...(existing.attrs ?? {}), ...incomingAttrs };

                const normalizedExistingPhone = existing.phone ? normalizePhone(existing.phone) : "";
                const nextPhone = normalizedExistingPhone || mapped.phone;
                const nextCareNote =
                  !existing.careNote && mapped.careNote && !(isCrossChannel && mapped.isOnlyFormEcho)
                    ? mapped.careNote
                    : existing.careNote;
                const nextName = isCrossChannel
                  ? !existing.name && mapped.name
                    ? mapped.name
                    : undefined
                  : mapped.name || undefined;

                await db
                  .update(leads)
                  .set({
                    ...(nextName ? { name: nextName } : {}),
                    ...(nextPhone ? { phone: nextPhone } : {}),
                    ...(nextCareNote !== undefined ? { careNote: nextCareNote } : {}),
                    attrs: nextAttrs,
                    ...(projectId ? { projectId } : {}),
                    facebookPageId: pageId,
                    updatedAt: new Date(),
                  })
                  .where(eq(leads.id, existing.id));
                counts.updated += 1;
                byChannel.message += 1;
                return;
              }

              const insertedId = await db.transaction(async (tx) => {
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

                return inserted.id;
              });
              counts.imported += 1;
              byChannel.message += 1;
              if (!mapped.createdAt || mapped.createdAt.getTime() >= recentPushThresholdMs) {
                newlyImportedLeads.push({
                  leadId: insertedId,
                  name: mapped.name,
                  phone: mapped.phone,
                  pageId,
                  pageName: pageAuth.name ?? null,
                });
              }
            } catch (error) {
              recordError(error);
            }
          });
        }
      } catch (error) {
        if (isPermissionError(error)) {
          recordWarning(
            `Thiếu quyền "pages_messaging" trên FACEBOOK_ACCESS_TOKEN để đồng bộ Lead Tin nhắn (Messenger)`,
          );
          canSyncMessaging = false;
        } else {
          recordError(new Error(`Page ${pageId} (Messenger): ${errorMessage(error)}`));
        }
      }

      // =======================================================================
      // KÊNH 3: LEAD BÌNH LUẬN (`/{pageId}/published_posts` -> `/{postId}/comments` -> `channelDetail: "COMMENT"`)
      // =======================================================================
      if (canSyncComments) try {
        const postsRes = await graphGet<{ data?: FacebookPostNode[] }>(
          `/${pageId}/published_posts`,
          {
            fields:
              "id,message,created_time,comments.filter(stream).limit(50){id,message,from,created_time,permalink_url}",
            limit: "15",
          },
          { accessToken: pageAuth.token },
        );
        const posts = postsRes?.data ?? [];

        for (const post of posts) {
          let comments: FacebookCommentNode[] = [];
          if (post.comments !== undefined) {
            comments = post.comments.data ?? [];
          } else {
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
                canSyncComments = false;
                break;
              }
              continue;
            }
          }

          for (const comment of comments) {
            const cmtCreated = parseCreatedAt(comment.created_time);
            if (cutoffMs !== null && cmtCreated && cmtCreated.getTime() < cutoffMs) {
              continue;
            }
            const mapped = mapFacebookCommentLead(comment, pageId, {
              postId: post.id,
              postMessage: post.message,
            });
            if (!mapped || !mapped.phone) continue;

            await withPhoneLock(pageId, mapped.phone, async () => {
              try {
                const existing = await findExistingLead(mapped.facebookLeadId, pageId, mapped.phone);
                if (existing) {
                  const isCrossChannel =
                    Boolean(existing.facebookLeadId && existing.facebookLeadId !== mapped.facebookLeadId) ||
                    (existing.channelDetail !== undefined && existing.channelDetail !== "COMMENT");
                  const nextAttrs = { ...(existing.attrs ?? {}), ...mapped.attrs };
                  const normalizedExistingPhone = existing.phone ? normalizePhone(existing.phone) : "";
                  const nextPhone = normalizedExistingPhone || mapped.phone;
                  const nextName = isCrossChannel
                    ? !existing.name && mapped.name
                      ? mapped.name
                      : undefined
                    : mapped.name || undefined;

                  await db
                    .update(leads)
                    .set({
                      ...(nextName ? { name: nextName } : {}),
                      ...(nextPhone ? { phone: nextPhone } : {}),
                      attrs: nextAttrs,
                      ...(projectId ? { projectId } : {}),
                      facebookPageId: pageId,
                      updatedAt: new Date(),
                    })
                    .where(eq(leads.id, existing.id));
                  counts.updated += 1;
                  byChannel.comment += 1;
                  return;
                }

                const insertedId = await db.transaction(async (tx) => {
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

                  return inserted.id;
                });
                counts.imported += 1;
                byChannel.comment += 1;
                if (!mapped.createdAt || mapped.createdAt.getTime() >= recentPushThresholdMs) {
                  newlyImportedLeads.push({
                    leadId: insertedId,
                    name: mapped.name,
                    phone: mapped.phone,
                    pageId,
                    pageName: pageAuth.name ?? null,
                  });
                }
              } catch (error) {
                recordError(error);
              }
            });
          }
        }
      } catch (error) {
        if (isPermissionError(error)) {
          recordWarning(
            `Thiếu quyền "pages_read_user_content" trên FACEBOOK_ACCESS_TOKEN để đồng bộ Lead Bình luận (Comment)`,
          );
          canSyncComments = false;
        } else {
          recordError(new Error(`Page ${pageId} (Comments): ${errorMessage(error)}`));
        }
      }
    }

    const pagesWithTokens = pageIds.filter((id) => pageTokens.has(id));
    if (pagesWithTokens.length === 0 && pageIds.length > 0) {
      recordWarning("Không tìm thấy Page Access Token nào cho các Fanpage đang bật.");
    }

    // Chạy trang đầu tiên trước để kiểm tra nhanh quyền Messaging/Comments (tránh 6 trang cùng gọi lỗi song song)
    if (pagesWithTokens.length > 0) {
      await syncSinglePage(pagesWithTokens[0]!);
    }
    const PAGE_CONCURRENCY = 6;
    for (let i = 1; i < pagesWithTokens.length; i += PAGE_CONCURRENCY) {
      const pageBatch = pagesWithTokens.slice(i, i + PAGE_CONCURRENCY);
      await Promise.all(pageBatch.map((pageId) => syncSinglePage(pageId)));
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

    if (newlyImportedLeads.length > 0) {
      await notifyNewFacebookLeads(newlyImportedLeads).catch((err) => {
        console.error("[syncFacebookLeads] push notification failed:", err);
      });
    }

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

/**
 * Xóa leads từ kênh Messenger/Comment mà không có SĐT.
 * Cascade sẽ tự xóa activity_logs và lead_comments liên quan.
 */
export async function purgeLeadsWithoutPhone(): Promise<{ deleted: number }> {
  const db = getDb();
  const deleted = await db
    .delete(leads)
    .where(
      and(
        inArray(leads.channelDetail, ["TIN_NHAN", "COMMENT"]),
        eq(leads.source, "FACEBOOK"),
        or(isNull(leads.phone), eq(leads.phone, "")),
      ),
    )
    .returning({ id: leads.id });
  return { deleted: deleted.length };
}

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import postgres from "postgres";
import { extractPhoneFromText, isMetaLeadFormAutoMessage } from "../src/lib/facebook/map-lead";
import { normalizePhone, phoneKey } from "../src/lib/leads/phone";

const applyChanges = process.argv.includes("--apply");

interface LeadRecord {
  id: string;
  project_id: string | null;
  project_name: string | null;
  created_at: Date;
  updated_at: Date;
  name: string | null;
  phone: string;
  contact_status: string;
  category: string;
  fail_reason: string | null;
  source: string;
  channel_detail: string;
  brand_id: string | null;
  product_id: string | null;
  location_id: string | null;
  assignee_id: string | null;
  attrs: Record<string, string> | null;
  care_note: string | null;
  callback_at: Date | null;
  contact_count: number;
  last_contact_at: Date | null;
  campaign: string | null;
  ad_content: string | null;
  cost_per_lead: number | null;
  facebook_lead_id: string | null;
  facebook_form_id: string | null;
  facebook_page_id: string | null;
  facebook_ad_id: string | null;
  facebook_adset_id: string | null;
  facebook_campaign_id: string | null;
}

function isPageHotlineOrPromoText(lead: LeadRecord): boolean {
  const msgText =
    lead.attrs?.noi_dung_tin_nhan ??
    lead.attrs?.noi_dung_comment ??
    lead.care_note ??
    "";
  if (!msgText) return false;
  if (
    /(?:vui lòng để lại\s*(?:sđt|số điện thoại)|liên hệ\s*(?:số\s*)?hotline|hotline\s*(?:kinh doanh|dịch vụ|hỗ trợ|:))/i.test(
      msgText,
    )
  ) {
    return true;
  }
  if (
    lead.channel_detail === "COMMENT" &&
    lead.name === "Khách bình luận Facebook" &&
    /ưu đãi đặc biệt|miễn phí làm phù hiệu/i.test(msgText)
  ) {
    return true;
  }
  return false;
}

function hasCustomerPhoneInStoredText(lead: LeadRecord): boolean {
  const texts = [
    lead.attrs?.noi_dung_tin_nhan,
    lead.attrs?.noi_dung_comment,
    lead.care_note,
  ].filter(Boolean) as string[];
  for (const t of texts) {
    // Strip Facebook system notice prefix if present
    const cleaned = t
      .split("|")
      .map((part) => part.trim())
      .filter((part) => !/^(\[Messenger\]\s*)?facebook tạo đoạn chat này vì\b/i.test(part))
      .join(" | ");
    if (extractPhoneFromText(cleaned)) return true;
  }
  return false;
}

function isUntouchedBySale(lead: LeadRecord): boolean {
  return (
    lead.contact_status === "CHUA_LIEN_HE" &&
    lead.category === "CHUA_PHAN_LOAI" &&
    lead.assignee_id === null &&
    (lead.contact_count ?? 0) === 0 &&
    lead.callback_at === null
  );
}

function isOnlyMetaFormEchoText(text: string | null | undefined): boolean {
  if (!text) return false;
  const cleaned = text.replace(/^\[Messenger\]\s*/i, "").trim();
  const parts = cleaned
    .split(" | ")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => isMetaLeadFormAutoMessage(p));
}

function leadScore(lead: LeadRecord): number {
  let score = 0;
  if (lead.contact_status === "DA_LIEN_HE") score += 1000;
  if (lead.category !== "CHUA_PHAN_LOAI") score += 800;
  if (lead.assignee_id) score += 500;
  if ((lead.contact_count ?? 0) > 0) score += 300;
  if (lead.callback_at) score += 200;
  if (lead.brand_id || lead.product_id || lead.location_id) score += 150;

  if (lead.source === "MANUAL") score += 100;
  else if (lead.channel_detail === "FORM") score += 80;
  else if (lead.channel_detail === "TIN_NHAN") score += 40;
  else if (lead.channel_detail === "COMMENT") score += 20;

  if (lead.campaign) score += 30;
  if (lead.facebook_ad_id) score += 15;
  if (lead.facebook_form_id) score += 15;
  return score;
}

async function main() {
  const rawUrl = process.env.DATABASE_URL?.trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
  if (!rawUrl) {
    throw new Error("Thiếu DATABASE_URL trong .env.local");
  }

  const sql = postgres(rawUrl, { prepare: false, max: 4, connect_timeout: 20 });

  try {
    console.log(`Mode: ${applyChanges ? "APPLY (ghi vào DB)" : "DRY-RUN (chỉ kiểm tra, thêm --apply để thực thi)"}`);

    const allLeads = await sql<LeadRecord[]>`
      select
        l.*,
        p.name as project_name
      from leads l
      left join projects p on p.id = l.project_id
      order by l.created_at asc
    `;

    console.log(`Tổng số lead hiện tại trong DB: ${allLeads.length}`);

    // 1. Xác định các dòng TIN_NHAN / COMMENT không có SĐT khách thực sự
    const emptyChatIds: string[] = [];
    const noPhoneInTextCandidates = new Map<string, LeadRecord[]>();
    const bogusHotlineIds = new Set<string>();

    for (const lead of allLeads) {
      const isFbChatOrComment =
        lead.source === "FACEBOOK" &&
        (lead.channel_detail === "TIN_NHAN" || lead.channel_detail === "COMMENT");
      if (!isFbChatOrComment) continue;

      if (!lead.phone || lead.phone.trim() === "") {
        if (isUntouchedBySale(lead)) {
          emptyChatIds.push(lead.id);
        }
        continue;
      }

      if (!isUntouchedBySale(lead)) continue;

      if (isPageHotlineOrPromoText(lead)) {
        bogusHotlineIds.add(lead.id);
        continue;
      }

      if (!hasCustomerPhoneInStoredText(lead)) {
        const key = `${lead.project_id ?? "__null__"}::${phoneKey(lead.phone)}`;
        const list = noPhoneInTextCandidates.get(key) ?? [];
        list.push(lead);
        noPhoneInTextCandidates.set(key, list);
      }
    }

    // Nếu cùng 1 SĐT xuất hiện trên >= 2 khách khác nhau mà trong nội dung tin nhắn của khách không hề có SĐT -> chắc chắn 100% là SĐT Hotline Page / ID URL
    for (const [, list] of noPhoneInTextCandidates) {
      const distinctCustomers = new Set(
        list.map((l) => l.attrs?.psid || (l.name ?? "").trim().toLowerCase() || l.id),
      );
      if (distinctCustomers.size >= 2) {
        for (const l of list) {
          bogusHotlineIds.add(l.id);
        }
      }
    }

    // Ngoài ra: nếu 1 SĐT đã được xác định là Hotline Page ở trên, kiểm tra các dòng TIN_NHAN/COMMENT còn lại cùng project + cùng SĐT Hotline đó mà khách cũng chỉ hỏi giá (không tự gõ SĐT khác)
    const knownHotlineProjectPhoneKeys = new Set<string>();
    for (const lead of allLeads) {
      if (bogusHotlineIds.has(lead.id)) {
        knownHotlineProjectPhoneKeys.add(`${lead.project_id ?? "__null__"}::${phoneKey(lead.phone)}`);
      }
    }
    for (const lead of allLeads) {
      const isFbChatOrComment =
        lead.source === "FACEBOOK" &&
        (lead.channel_detail === "TIN_NHAN" || lead.channel_detail === "COMMENT");
      if (!isFbChatOrComment || !lead.phone || !isUntouchedBySale(lead)) continue;
      const pk = `${lead.project_id ?? "__null__"}::${phoneKey(lead.phone)}`;
      if (knownHotlineProjectPhoneKeys.has(pk) && !isOnlyMetaFormEchoText(lead.care_note)) {
        bogusHotlineIds.add(lead.id);
      }
    }

    const purgeIds = new Set<string>([...emptyChatIds, ...bogusHotlineIds]);
    console.log(`- Lead TIN_NHAN/COMMENT rỗng SĐT cần dọn: ${emptyChatIds.length}`);
    console.log(`- Lead TIN_NHAN/COMMENT dính nhầm SĐT Hotline Page / URL ID cần dọn: ${bogusHotlineIds.size}`);

    // 2. Gom nhóm các lead hợp lệ còn lại theo (project_id, phoneKey) để gộp trùng
    const remainingLeads = allLeads.filter((l) => !purgeIds.has(l.id));
    const groupsByProjectPhone = new Map<string, LeadRecord[]>();

    for (const lead of remainingLeads) {
      if (!lead.phone || lead.phone.trim() === "") continue;
      const pk = phoneKey(lead.phone);
      if (pk.length < 9) continue;
      const groupKey = `${lead.project_id ?? "__null__"}::${pk}`;
      const list = groupsByProjectPhone.get(groupKey) ?? [];
      list.push(lead);
      groupsByProjectPhone.set(groupKey, list);
    }

    interface MergePlan {
      primary: LeadRecord;
      secondaries: LeadRecord[];
      patch: {
        phone: string;
        name: string | null;
        brand_id: string | null;
        product_id: string | null;
        location_id: string | null;
        assignee_id: string | null;
        fail_reason: string | null;
        callback_at: Date | null;
        last_contact_at: Date | null;
        contact_count: number;
        campaign: string | null;
        ad_content: string | null;
        cost_per_lead: number | null;
        facebook_form_id: string | null;
        facebook_page_id: string | null;
        facebook_ad_id: string | null;
        facebook_adset_id: string | null;
        facebook_campaign_id: string | null;
        care_note: string | null;
        attrs: Record<string, string>;
      };
    }

    const mergePlans: MergePlan[] = [];
    const standalonePhoneFixes: Array<{ id: string; oldPhone: string; newPhone: string }> = [];

    for (const [, group] of groupsByProjectPhone) {
      if (group.length === 1) {
        const single = group[0]!;
        const norm = normalizePhone(single.phone);
        if (norm && norm !== single.phone) {
          standalonePhoneFixes.push({ id: single.id, oldPhone: single.phone, newPhone: norm });
        }
        continue;
      }

      const sorted = [...group].sort((a, b) => {
        const diff = leadScore(b) - leadScore(a);
        if (diff !== 0) return diff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const primary = sorted[0]!;
      const secondaries = sorted.slice(1);

      const mergedAttrs: Record<string, string> = {};
      // Gộp từ bản phụ trước, bản chính ghi đè sau để ưu tiên dữ liệu bản chính
      for (const sec of [...secondaries].reverse()) {
        const secAttrs = { ...(sec.attrs ?? {}) };
        if (
          primary.channel_detail === "FORM" &&
          sec.channel_detail === "TIN_NHAN" &&
          isOnlyMetaFormEchoText(secAttrs.noi_dung_tin_nhan)
        ) {
          delete secAttrs.noi_dung_tin_nhan;
        }
        Object.assign(mergedAttrs, secAttrs);
      }
      Object.assign(mergedAttrs, primary.attrs ?? {});

      const pickFirst = <K extends keyof LeadRecord>(key: K): LeadRecord[K] => {
        if (primary[key] !== null && primary[key] !== undefined && primary[key] !== "") {
          return primary[key];
        }
        for (const sec of secondaries) {
          if (sec[key] !== null && sec[key] !== undefined && sec[key] !== "") {
            return sec[key];
          }
        }
        return primary[key];
      };

      let bestName = primary.name?.trim() || null;
      if (!bestName || bestName === "Khách bình luận Facebook") {
        for (const sec of secondaries) {
          const cand = sec.name?.trim();
          if (cand && cand !== "Khách bình luận Facebook") {
            bestName = cand;
            break;
          }
        }
      }

      const noteParts: string[] = [];
      if (primary.care_note?.trim()) {
        noteParts.push(primary.care_note.trim());
      }
      for (const sec of secondaries) {
        const secNote = sec.care_note?.trim();
        if (!secNote) continue;
        if (primary.channel_detail === "FORM" && isOnlyMetaFormEchoText(secNote)) {
          continue;
        }
        if (!noteParts.some((existing) => existing.includes(secNote))) {
          noteParts.push(secNote);
        }
      }

      const totalContacts = group.reduce((sum, item) => sum + (item.contact_count ?? 0), 0);

      mergePlans.push({
        primary,
        secondaries,
        patch: {
          phone: normalizePhone(primary.phone) || primary.phone,
          name: bestName,
          brand_id: pickFirst("brand_id"),
          product_id: pickFirst("product_id"),
          location_id: pickFirst("location_id"),
          assignee_id: pickFirst("assignee_id"),
          fail_reason: primary.category === "FAIL" ? pickFirst("fail_reason") : null,
          callback_at: pickFirst("callback_at"),
          last_contact_at: pickFirst("last_contact_at"),
          contact_count: totalContacts,
          campaign: pickFirst("campaign"),
          ad_content: pickFirst("ad_content"),
          cost_per_lead: pickFirst("cost_per_lead"),
          facebook_form_id: pickFirst("facebook_form_id"),
          facebook_page_id: pickFirst("facebook_page_id"),
          facebook_ad_id: pickFirst("facebook_ad_id"),
          facebook_adset_id: pickFirst("facebook_adset_id"),
          facebook_campaign_id: pickFirst("facebook_campaign_id"),
          care_note: noteParts.length > 0 ? noteParts.join("\n") : null,
          attrs: mergedAttrs,
        },
      });
    }

    const totalSecondaryToMerge = mergePlans.reduce((sum, p) => sum + p.secondaries.length, 0);
    console.log(`- Nhóm SĐT trùng sẽ gộp: ${mergePlans.length} nhóm (gộp & xóa ${totalSecondaryToMerge} dòng phụ)`);
    console.log(`- Lead đơn lẻ cần chuẩn hóa định dạng SĐT (+84 -> 0...): ${standalonePhoneFixes.length}`);
    console.log(
      `=> Dự kiến tổng lead sau làm sạch: ${allLeads.length - purgeIds.size - totalSecondaryToMerge}`,
    );

    // Thống kê theo dự án
    const byProj = new Map<string, { purged: number; merged: number; phoneNormalized: number }>();
    const bump = (proj: string | null, field: "purged" | "merged" | "phoneNormalized", delta = 1) => {
      const name = proj || "(Chưa gắn dự án)";
      const cur = byProj.get(name) ?? { purged: 0, merged: 0, phoneNormalized: 0 };
      cur[field] += delta;
      byProj.set(name, cur);
    };
    for (const l of allLeads) {
      if (purgeIds.has(l.id)) bump(l.project_name, "purged", 1);
    }
    for (const m of mergePlans) {
      bump(m.primary.project_name, "merged", m.secondaries.length);
    }
    for (const f of standalonePhoneFixes) {
      const l = allLeads.find((x) => x.id === f.id);
      bump(l?.project_name ?? null, "phoneNormalized", 1);
    }
    console.log("\nChi tiết theo dự án:");
    console.table(
      [...byProj.entries()]
        .map(([project, stats]) => ({ project, ...stats }))
        .sort((a, b) => b.merged + b.purged - (a.merged + a.purged)),
    );

    if (!applyChanges) {
      console.log("\n[DRY-RUN] Chưa ghi thay đổi nào vào DB. Chạy lại với cờ --apply để thực thi.");
      return;
    }

    console.log("\nĐang thực thi làm sạch và gộp lead trong transaction...");
    await sql.begin(async (tx) => {
      // 1. Xóa các dòng chat/comment rỗng SĐT hoặc dính Hotline Page
      const purgeList = [...purgeIds];
      for (let i = 0; i < purgeList.length; i += 200) {
        const chunk = purgeList.slice(i, i + 200);
        await tx`delete from leads where id in ${tx(chunk)}`;
      }

      // 2. Gộp từng nhóm trùng SĐT
      for (const plan of mergePlans) {
        const secIds = plan.secondaries.map((s) => s.id);
        await tx`
          update lead_comments
          set lead_id = ${plan.primary.id}
          where lead_id in ${tx(secIds)}
        `;
        await tx`
          update activity_logs
          set lead_id = ${plan.primary.id}
          where lead_id in ${tx(secIds)}
            and kind <> 'CREATE'
        `;
        await tx`delete from leads where id in ${tx(secIds)}`;

        await tx`
          update leads
          set
            phone = ${plan.patch.phone},
            name = ${plan.patch.name},
            brand_id = ${plan.patch.brand_id},
            product_id = ${plan.patch.product_id},
            location_id = ${plan.patch.location_id},
            assignee_id = ${plan.patch.assignee_id},
            fail_reason = ${plan.patch.fail_reason},
            callback_at = ${plan.patch.callback_at},
            last_contact_at = ${plan.patch.last_contact_at},
            contact_count = ${plan.patch.contact_count},
            campaign = ${plan.patch.campaign},
            ad_content = ${plan.patch.ad_content},
            cost_per_lead = ${plan.patch.cost_per_lead},
            facebook_form_id = ${plan.patch.facebook_form_id},
            facebook_page_id = ${plan.patch.facebook_page_id},
            facebook_ad_id = ${plan.patch.facebook_ad_id},
            facebook_adset_id = ${plan.patch.facebook_adset_id},
            facebook_campaign_id = ${plan.patch.facebook_campaign_id},
            care_note = ${plan.patch.care_note},
            attrs = ${tx.json(plan.patch.attrs)},
            updated_at = now()
          where id = ${plan.primary.id}
        `;
      }

      // 3. Chuẩn hóa SĐT (+84 -> 0...) cho các lead đơn lẻ còn lại
      for (const fix of standalonePhoneFixes) {
        await tx`
          update leads
          set phone = ${fix.newPhone}, updated_at = now()
          where id = ${fix.id}
        `;
      }
    });

    console.log("Hoàn tất làm sạch và gộp dữ liệu trùng thành công!");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

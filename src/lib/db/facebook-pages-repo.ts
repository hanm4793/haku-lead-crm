import { asc, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import { facebookPages } from "@/lib/db/schema";
import { parseFacebookPageIds } from "@/lib/facebook/env";
import { graphGet } from "@/lib/facebook/graph-client";

export type FacebookPageRow = {
  id: string;
  facebookPageId: string;
  name: string | null;
  active: boolean;
};

export async function listFacebookPages(): Promise<FacebookPageRow[]> {
  if (!isDatabaseConfigured()) return [];
  return getDb()
    .select({
      id: facebookPages.id,
      facebookPageId: facebookPages.facebookPageId,
      name: facebookPages.name,
      active: facebookPages.active,
    })
    .from(facebookPages)
    .orderBy(asc(facebookPages.name), asc(facebookPages.facebookPageId));
}

/** Page đang bật để sync lead. Nếu bảng trống → bootstrap từ env rồi trả về. */
export async function resolveActiveFacebookPageIds(): Promise<string[]> {
  if (!isDatabaseConfigured()) return parseFacebookPageIds();

  const db = getDb();
  const active = await db
    .select({ facebookPageId: facebookPages.facebookPageId })
    .from(facebookPages)
    .where(eq(facebookPages.active, true))
    .orderBy(asc(facebookPages.facebookPageId));

  if (active.length > 0) {
    return active.map((row) => row.facebookPageId);
  }

  const fromEnv = parseFacebookPageIds();
  if (fromEnv.length === 0) return [];

  await ensureFacebookPagesFromEnv(fromEnv);
  return fromEnv;
}

export async function ensureFacebookPagesFromEnv(pageIds = parseFacebookPageIds()): Promise<number> {
  if (!isDatabaseConfigured() || pageIds.length === 0) return 0;
  const db = getDb();
  let inserted = 0;
  for (const facebookPageId of pageIds) {
    const [existing] = await db
      .select({ id: facebookPages.id })
      .from(facebookPages)
      .where(eq(facebookPages.facebookPageId, facebookPageId))
      .limit(1);
    if (existing) continue;
    await db.insert(facebookPages).values({ facebookPageId, name: null, active: true });
    inserted += 1;
  }
  return inserted;
}

export async function addFacebookPage(facebookPageIdRaw: string, nameHint?: string | null) {
  const facebookPageId = facebookPageIdRaw.trim();
  if (!/^\d{5,}$/.test(facebookPageId)) {
    throw new Error("Page ID không hợp lệ (cần chuỗi số Meta).");
  }

  let name = nameHint?.trim() || null;
  try {
    const page = await graphGet<{ id?: string; name?: string }>(`/${facebookPageId}`, {
      fields: "id,name",
    });
    if (page.name?.trim()) name = page.name.trim();
  } catch {
    // Token có thể thiếu quyền page — vẫn cho lưu ID.
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: facebookPages.id })
    .from(facebookPages)
    .where(eq(facebookPages.facebookPageId, facebookPageId))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(facebookPages)
      .set({ name: name ?? undefined, active: true, updatedAt: new Date() })
      .where(eq(facebookPages.id, existing.id))
      .returning({
        id: facebookPages.id,
        facebookPageId: facebookPages.facebookPageId,
        name: facebookPages.name,
        active: facebookPages.active,
      });
    return row!;
  }

  const [row] = await db
    .insert(facebookPages)
    .values({ facebookPageId, name, active: true })
    .returning({
      id: facebookPages.id,
      facebookPageId: facebookPages.facebookPageId,
      name: facebookPages.name,
      active: facebookPages.active,
    });
  return row!;
}

export async function setFacebookPageActive(id: string, active: boolean) {
  const [row] = await getDb()
    .update(facebookPages)
    .set({ active, updatedAt: new Date() })
    .where(eq(facebookPages.id, id))
    .returning({
      id: facebookPages.id,
      facebookPageId: facebookPages.facebookPageId,
      name: facebookPages.name,
      active: facebookPages.active,
    });
  if (!row) throw new Error("Không tìm thấy Fanpage.");
  return row;
}

export async function removeFacebookPage(id: string) {
  const deleted = await getDb()
    .delete(facebookPages)
    .where(eq(facebookPages.id, id))
    .returning({ id: facebookPages.id });
  if (deleted.length === 0) throw new Error("Không tìm thấy Fanpage.");
}

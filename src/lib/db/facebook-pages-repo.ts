import { and, asc, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import { ensureDefaultProject } from "@/lib/db/project-repo";
import { facebookPages } from "@/lib/db/schema";
import { parseFacebookPageIds } from "@/lib/facebook/env";
import { graphGet } from "@/lib/facebook/graph-client";

export type FacebookPageRow = {
  id: string;
  facebookPageId: string;
  name: string | null;
  projectId: string | null;
  active: boolean;
};

async function defaultProjectId(): Promise<string | null> {
  try {
    return (await ensureDefaultProject()).id;
  } catch {
    return null;
  }
}

export async function listFacebookPages(options?: { projectId?: string }): Promise<FacebookPageRow[]> {
  if (!isDatabaseConfigured()) return [];
  const db = getDb();
  const where = options?.projectId ? eq(facebookPages.projectId, options.projectId) : undefined;
  return db
    .select({
      id: facebookPages.id,
      facebookPageId: facebookPages.facebookPageId,
      name: facebookPages.name,
      projectId: facebookPages.projectId,
      active: facebookPages.active,
    })
    .from(facebookPages)
    .where(where)
    .orderBy(asc(facebookPages.name), asc(facebookPages.facebookPageId));
}

/** Page đang bật để sync lead. Nếu bảng trống → bootstrap từ env rồi trả về. */
export async function resolveActiveFacebookPageIds(projectId?: string): Promise<string[]> {
  if (!isDatabaseConfigured()) return parseFacebookPageIds();

  const db = getDb();
  const conditions = [eq(facebookPages.active, true)];
  if (projectId) conditions.push(eq(facebookPages.projectId, projectId));

  const active = await db
    .select({ facebookPageId: facebookPages.facebookPageId })
    .from(facebookPages)
    .where(and(...conditions))
    .orderBy(asc(facebookPages.facebookPageId));

  if (active.length > 0) {
    return active.map((row) => row.facebookPageId);
  }

  if (projectId) return [];

  const fromEnv = parseFacebookPageIds();
  if (fromEnv.length === 0) return [];

  await ensureFacebookPagesFromEnv(fromEnv);
  return fromEnv;
}

export async function getFacebookPageProjectId(facebookPageId: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const [row] = await getDb()
    .select({ projectId: facebookPages.projectId })
    .from(facebookPages)
    .where(eq(facebookPages.facebookPageId, facebookPageId))
    .limit(1);
  return row?.projectId ?? null;
}

export async function ensureFacebookPagesFromEnv(
  pageIds = parseFacebookPageIds(),
  projectId?: string,
): Promise<number> {
  if (!isDatabaseConfigured() || pageIds.length === 0) return 0;
  const resolvedProjectId = projectId ?? (await defaultProjectId());
  const db = getDb();
  let inserted = 0;
  for (const facebookPageId of pageIds) {
    const [existing] = await db
      .select({ id: facebookPages.id })
      .from(facebookPages)
      .where(eq(facebookPages.facebookPageId, facebookPageId))
      .limit(1);
    if (existing) continue;
    await db.insert(facebookPages).values({
      facebookPageId,
      name: null,
      active: true,
      projectId: resolvedProjectId,
    });
    inserted += 1;
  }
  return inserted;
}

/** Ghi nhận fanpage xuất hiện trên ads. Không đổi trạng thái active của page đã có. */
export async function ensureDiscoveredFacebookPages(
  pageIds: string[],
  projectId?: string,
): Promise<void> {
  const unique = [...new Set(pageIds.map((id) => id.trim()).filter((id) => /^\d{5,}$/.test(id)))];
  if (!isDatabaseConfigured() || unique.length === 0) return;

  const resolvedProjectId = projectId ?? (await defaultProjectId());
  const db = getDb();
  for (const facebookPageId of unique) {
    const [existing] = await db
      .select({ id: facebookPages.id, name: facebookPages.name })
      .from(facebookPages)
      .where(eq(facebookPages.facebookPageId, facebookPageId))
      .limit(1);
    if (existing?.name) continue;

    let name: string | null = null;
    try {
      const page = await graphGet<{ name?: string }>(`/${facebookPageId}`, { fields: "name" });
      name = page.name?.trim() || null;
    } catch {
      name = null;
    }

    if (existing) {
      if (name) {
        await db
          .update(facebookPages)
          .set({ name, updatedAt: new Date() })
          .where(eq(facebookPages.id, existing.id));
      }
      continue;
    }

    await db.insert(facebookPages).values({
      facebookPageId,
      name,
      active: true,
      projectId: resolvedProjectId,
    });
  }
}

export async function addFacebookPage(
  facebookPageIdRaw: string,
  nameHint?: string | null,
  projectId?: string,
) {
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

  const resolvedProjectId = projectId ?? (await defaultProjectId());
  const db = getDb();
  const [existing] = await db
    .select({ id: facebookPages.id })
    .from(facebookPages)
    .where(eq(facebookPages.facebookPageId, facebookPageId))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(facebookPages)
      .set({
        name: name ?? undefined,
        active: true,
        projectId: resolvedProjectId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(facebookPages.id, existing.id))
      .returning({
        id: facebookPages.id,
        facebookPageId: facebookPages.facebookPageId,
        name: facebookPages.name,
        projectId: facebookPages.projectId,
        active: facebookPages.active,
      });
    return row!;
  }

  const [row] = await db
    .insert(facebookPages)
    .values({ facebookPageId, name, active: true, projectId: resolvedProjectId })
    .returning({
      id: facebookPages.id,
      facebookPageId: facebookPages.facebookPageId,
      name: facebookPages.name,
      projectId: facebookPages.projectId,
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
      projectId: facebookPages.projectId,
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

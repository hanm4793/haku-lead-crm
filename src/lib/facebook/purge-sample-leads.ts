import { isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";

export async function purgeSampleLeads(): Promise<{ deleted: number }> {
  const deleted = await getDb()
    .delete(leads)
    .where(isNull(leads.facebookLeadId))
    .returning({ id: leads.id });

  return { deleted: deleted.length };
}

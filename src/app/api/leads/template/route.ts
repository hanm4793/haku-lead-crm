import { NextResponse } from "next/server";

import { canImportLeads } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { catalogOptionsFromReference, DEFAULT_LEAD_CATALOG } from "@/lib/catalog";
import { listAttrFields } from "@/lib/db/attr-fields-repo";
import { getReferenceData } from "@/lib/db/leads-repo";
import { listAssignableStaff } from "@/lib/db/users-repo";
import { buildLeadImportTemplateWorkbook } from "@/lib/leads/import-leads";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getScopedViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  if (!canImportLeads(viewer.role)) {
    return NextResponse.json({ error: "Bạn không có quyền tải file mẫu." }, { status: 403 });
  }

  const projectId = viewer.activeProjectId ?? undefined;
  const [reference, attrFields, assignees] = await Promise.all([
    getReferenceData(projectId).catch(() => null),
    projectId ? listAttrFields(projectId, { activeOnly: true }).catch(() => []) : Promise.resolve([]),
    listAssignableStaff(viewer).catch(() => []),
  ]);

  const catalog = reference ? catalogOptionsFromReference(reference) : DEFAULT_LEAD_CATALOG;
  const buffer = await buildLeadImportTemplateWorkbook({
    catalog,
    attrFields,
    assignees,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="lead-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

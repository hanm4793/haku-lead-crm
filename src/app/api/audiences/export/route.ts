import { NextResponse } from "next/server";
import { z } from "zod";

import {
  formatAudienceExport,
  type AudienceExportFormat,
} from "@/lib/audiences/customer-audience";
import { canManageAudiences } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import {
  buildAudienceContacts,
  getAudienceSegmentById,
} from "@/lib/db/audiences-repo";
import type { AudienceFilterConfig } from "@/lib/db/schema";

const EXPORT_FORMATS = ["meta_csv", "google_csv", "tiktok_csv", "zalo_txt"] as const;

const getQuerySchema = z.object({
  segmentId: z.string().uuid(),
  format: z.enum(EXPORT_FORMATS).default("meta_csv"),
});

const postBodySchema = z.object({
  name: z.string().trim().max(200).optional(),
  projectId: z.string().uuid().nullable().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  format: z.enum(EXPORT_FORMATS).default("meta_csv"),
});

function slugifyFileName(raw: string): string {
  const ascii = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return ascii || "tep-khach-hang";
}

function buildDownloadResponse(
  baseName: string,
  format: AudienceExportFormat,
  content: string,
  mimeType: string,
  extension: "csv" | "txt",
) {
  const slug = slugifyFileName(baseName);
  const platformSuffix = format.replace(/_(csv|txt)$/, "");
  const fileName = `${slug}-${platformSuffix}.${extension}`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const viewer = await getScopedViewer();
  if (!viewer || !canManageAudiences(viewer.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = getQuerySchema.safeParse({
    segmentId: url.searchParams.get("segmentId"),
    format: url.searchParams.get("format") ?? "meta_csv",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Tham số xuất tệp không hợp lệ." }, { status: 400 });
  }

  const segment = await getAudienceSegmentById(parsed.data.segmentId);
  if (!segment) {
    return NextResponse.json({ error: "Không tìm thấy tệp khách hàng." }, { status: 404 });
  }

  const built = await buildAudienceContacts({
    projectId: segment.projectId,
    filters: segment.filters ?? {},
  });

  const exported = formatAudienceExport(built.contacts, parsed.data.format);
  return buildDownloadResponse(
    segment.name,
    parsed.data.format,
    exported.content,
    exported.mimeType,
    exported.extension,
  );
}

export async function POST(request: Request) {
  const viewer = await getScopedViewer();
  if (!viewer || !canManageAudiences(viewer.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON không hợp lệ." }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu xuất tệp không hợp lệ." }, { status: 400 });
  }

  const built = await buildAudienceContacts({
    projectId: parsed.data.projectId ?? null,
    filters: (parsed.data.filters ?? {}) as AudienceFilterConfig,
  });

  const exported = formatAudienceExport(built.contacts, parsed.data.format);
  return buildDownloadResponse(
    parsed.data.name || "tep-khach-hang-crm",
    parsed.data.format,
    exported.content,
    exported.mimeType,
    exported.extension,
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectDetailTabs } from "@/components/projects/project-detail-tabs";
import {
  canManageAttrFieldsInProject,
  canManageCatalogsInProject,
  canManageProjects,
  canViewProjects,
} from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { listAttrFields } from "@/lib/db/attr-fields-repo";
import { listCatalog, type CatalogSnapshot } from "@/lib/db/catalog-repo";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import {
  assertCanAccessProject,
  getCatalogLabels,
  getProjectById,
  listAdAccounts,
  listPartnersInProject,
  listPartnersNotInProject,
  toProjectInfo,
  toProjectViewer,
} from "@/lib/db/project-repo";
import { DEFAULT_CATALOG_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const EMPTY_CATALOG: CatalogSnapshot = { brands: [], products: [], locations: [] };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || !canViewProjects(viewer.role)) redirect("/leads");
  if (!isDatabaseConfigured()) redirect("/projects");

  const projectRow = await getProjectById(id);
  if (!projectRow) notFound();

  try {
    await assertCanAccessProject(toProjectViewer(viewer), id);
  } catch {
    redirect("/projects");
  }

  const project = toProjectInfo(projectRow);
  const labels = getCatalogLabels(projectRow);
  const catalog = await listCatalog(id).catch(() => EMPTY_CATALOG);
  const attrFields = await listAttrFields(id).catch(() => []);
  const pages = await listFacebookPages({ projectId: id }).catch(() => []);
  const allPages = await listFacebookPages().catch(() => []);
  const canManageProject = canManageProjects(viewer.role);
  const unassignedPages = allPages.filter((p) => !p.projectId);
  const pagesForPanel = canManageProject ? [...pages, ...unassignedPages] : pages;
  const partners = await listPartnersInProject(id).catch(() => []);
  const partnersAvailable = canManageProject ? await listPartnersNotInProject(id).catch(() => []) : [];
  const adAccounts = await listAdAccounts(id).catch(() => []);
  const canEditLabels = canManageProject || canManageCatalogsInProject(viewer, id);
  const canManageCatalog = canManageCatalogsInProject(viewer, id) || canManageAttrFieldsInProject(viewer, id);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <Link href="/projects" className="hover:text-primary hover:underline">
          Dự án
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{project.name}</span>
      </div>
      <div>
        <h1 className="text-xl font-bold">{project.name}</h1>
        <p className="text-[13px] text-muted-foreground">
          Slug <span className="font-mono">{project.slug}</span> · Nhãn catalog: {labels.brand}, {labels.product},{" "}
          {labels.location || DEFAULT_CATALOG_LABELS.location}
        </p>
      </div>
      <ProjectDetailTabs
        project={project}
        catalog={catalog}
        labels={labels}
        attrFields={attrFields}
        pages={pagesForPanel}
        partners={partners.map((p) => ({ ...p, projectId: id }))}
        partnersAvailable={partnersAvailable}
        adAccounts={adAccounts}
        canManageProject={canManageProject}
        canEditLabels={canEditLabels}
        canManageCatalog={canManageCatalog}
        dbConfigured
      />
    </div>
  );
}

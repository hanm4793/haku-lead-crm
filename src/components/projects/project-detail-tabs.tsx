"use client";

import {
  Building2,
  FolderKanban,
  Layers,
  Megaphone,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { AttrFieldsPanel } from "@/components/settings/attr-fields-panel";
import { CatalogPanel } from "@/components/settings/catalog-panel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type { CatalogSnapshot } from "@/lib/db/catalog-repo";
import type { ProjectAdAccountRow } from "@/lib/db/project-repo";
import type { CatalogLabels, ProjectInfo } from "@/lib/types";

import { ProjectFacebookSync, type LastSyncInfo } from "./project-facebook-sync";
import { ProjectOverviewForm } from "./project-overview-form";
import {
  ProjectAdAccountsTable,
  ProjectPagesTable,
  ProjectPartnersTable,
  type PageRow,
  type PartnerRow,
} from "./project-resources";

export function ProjectDetailTabs({
  project,
  catalog,
  labels,
  attrFields,
  pages,
  partners,
  partnersAvailable,
  adAccounts,
  canManageProject,
  canEditLabels,
  canManageCatalog,
  dbConfigured,
  facebook,
}: {
  project: ProjectInfo;
  catalog: CatalogSnapshot;
  labels: CatalogLabels;
  attrFields: AttrFieldRow[];
  pages: PageRow[];
  partners: PartnerRow[];
  partnersAvailable: PartnerRow[];
  adAccounts: ProjectAdAccountRow[];
  canManageProject: boolean;
  canEditLabels: boolean;
  canManageCatalog: boolean;
  dbConfigured: boolean;
  facebook: {
    tokenConfigured: boolean;
    lastLeadSync: LastSyncInfo;
  };
}) {
  const projectPages = pages.filter((p) => p.projectId === project.id);
  const totalCatalogItems =
    catalog.brands.length + catalog.products.length + catalog.locations.length;

  return (
    <Tabs defaultValue="catalog" className="space-y-4">
      <div className="border-b border-border/80 pb-1.5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-slate-100/90 p-1 sm:flex sm:w-auto sm:flex-wrap sm:justify-start">
          <TabsTrigger value="catalog" className="min-w-0 justify-start gap-1.5 rounded-lg border-b-0 px-2.5 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-2xs sm:py-1.5 sm:text-[13px]">
            <Layers className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">Catalog</span>
            <Badge variant="muted" className="ml-auto px-1.5 py-0 text-[10px] tabular-nums sm:ml-0.5">
              {totalCatalogItems}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="attrs" className="min-w-0 justify-start gap-1.5 rounded-lg border-b-0 px-2.5 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-2xs sm:py-1.5 sm:text-[13px]">
            <SlidersHorizontal className="size-3.5 shrink-0 text-slate-600" />
            <span className="truncate">Field phụ</span>
            <Badge variant="muted" className="ml-auto px-1.5 py-0 text-[10px] tabular-nums sm:ml-0.5">
              {attrFields.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="fanpages" className="min-w-0 justify-start gap-1.5 rounded-lg border-b-0 px-2.5 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-2xs sm:py-1.5 sm:text-[13px]">
            <Building2 className="size-3.5 shrink-0 text-blue-600" />
            <span className="truncate">Fanpage</span>
            <Badge variant="muted" className="ml-auto px-1.5 py-0 text-[10px] tabular-nums sm:ml-0.5">
              {projectPages.length}
            </Badge>
          </TabsTrigger>

          {canManageProject && (
            <TabsTrigger value="ads" className="min-w-0 justify-start gap-1.5 rounded-lg border-b-0 px-2.5 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-2xs sm:py-1.5 sm:text-[13px]">
              <Megaphone className="size-3.5 shrink-0 text-amber-600" />
              <span className="truncate">TK Ads</span>
              <Badge variant="muted" className="ml-auto px-1.5 py-0 text-[10px] tabular-nums sm:ml-0.5">
                {adAccounts.length}
              </Badge>
            </TabsTrigger>
          )}

          <TabsTrigger value="partners" className="min-w-0 justify-start gap-1.5 rounded-lg border-b-0 px-2.5 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-2xs sm:py-1.5 sm:text-[13px]">
            <Users className="size-3.5 shrink-0 text-emerald-600" />
            <span className="truncate">Đối tác</span>
            <Badge variant="muted" className="ml-auto px-1.5 py-0 text-[10px] tabular-nums sm:ml-0.5">
              {partners.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="overview" className="min-w-0 justify-start gap-1.5 rounded-lg border-b-0 px-2.5 py-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-2xs sm:py-1.5 sm:text-[13px]">
            <FolderKanban className="size-3.5 shrink-0 text-slate-600" />
            <span className="truncate">Cài đặt &amp; Nhãn</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="catalog" className="pt-1 sm:pt-2">
        <CatalogPanel
          catalog={catalog}
          labels={labels}
          isAdmin={canManageCatalog}
          dbConfigured={dbConfigured}
          projectId={project.id}
        />
      </TabsContent>

      <TabsContent value="attrs" className="pt-1 sm:pt-2">
        <AttrFieldsPanel
          fields={attrFields}
          isAdmin={canManageCatalog}
          dbConfigured={dbConfigured}
          projectId={project.id}
        />
      </TabsContent>

      <TabsContent value="fanpages" className="space-y-3 pt-1 sm:pt-2">
        {canManageProject && (
          <ProjectFacebookSync
            projectId={project.id}
            tokenConfigured={facebook.tokenConfigured}
            activePageCount={projectPages.filter((p) => p.active).length}
            lastLeadSync={facebook.lastLeadSync}
          />
        )}
        <ProjectPagesTable projectId={project.id} pages={pages} canManage={canManageProject} />
      </TabsContent>

      {canManageProject && (
        <TabsContent value="ads" className="pt-1 sm:pt-2">
          <ProjectAdAccountsTable projectId={project.id} accounts={adAccounts} canManage={canManageProject} />
        </TabsContent>
      )}

      <TabsContent value="partners" className="pt-1 sm:pt-2">
        <ProjectPartnersTable
          projectId={project.id}
          partners={partners}
          available={partnersAvailable}
          canManage={canManageProject}
        />
      </TabsContent>

      <TabsContent value="overview" className="pt-1 sm:pt-2">
        <div className="max-w-2xl rounded-xl border border-border/80 bg-card p-4 shadow-xs sm:p-5">
          <h3 className="mb-1 text-base font-semibold text-slate-900">
            Cấu hình Dự án &amp; Nhãn ngành hàng
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Đổi tên nhãn thương hiệu, loại sản phẩm, địa chỉ/chi nhánh để phù hợp với từng ngành nghề kinh doanh
            (Ô tô, Bất động sản, Spa, v.v.).
          </p>
          <ProjectOverviewForm
            project={project}
            canEditName={canManageProject}
            canEditLabels={canEditLabels}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

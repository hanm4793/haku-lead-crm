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
      <div className="no-scrollbar -mx-3 overflow-x-auto border-b border-border/80 px-3 pb-1 sm:mx-0 sm:px-0">
        <TabsList className="flex h-auto w-max justify-start gap-1 bg-slate-100/90 p-1 sm:w-auto sm:flex-wrap">
          <TabsTrigger value="catalog" className="shrink-0 gap-1.5 text-[13px] font-medium">
            <Layers className="size-3.5 text-primary" />
            <span>Catalog danh mục</span>
            <Badge variant="muted" className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums">
              {totalCatalogItems}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="attrs" className="shrink-0 gap-1.5 text-[13px] font-medium">
            <SlidersHorizontal className="size-3.5 text-slate-600" />
            <span>Field phụ</span>
            <Badge variant="muted" className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums">
              {attrFields.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="fanpages" className="shrink-0 gap-1.5 text-[13px] font-medium">
            <Building2 className="size-3.5 text-blue-600" />
            <span>Fanpage</span>
            <Badge variant="muted" className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums">
              {projectPages.length}
            </Badge>
          </TabsTrigger>

          {canManageProject && (
            <TabsTrigger value="ads" className="shrink-0 gap-1.5 text-[13px] font-medium">
              <Megaphone className="size-3.5 text-amber-600" />
              <span>Tài khoản Ads</span>
              <Badge variant="muted" className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums">
                {adAccounts.length}
              </Badge>
            </TabsTrigger>
          )}

          <TabsTrigger value="partners" className="shrink-0 gap-1.5 text-[13px] font-medium">
            <Users className="size-3.5 text-emerald-600" />
            <span>Đối tác / Partner</span>
            <Badge variant="muted" className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums">
              {partners.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="overview" className="shrink-0 gap-1.5 text-[13px] font-medium">
            <FolderKanban className="size-3.5 text-slate-600" />
            <span>Cài đặt &amp; Nhãn</span>
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

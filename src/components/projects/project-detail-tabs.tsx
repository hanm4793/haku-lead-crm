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
import { ProjectsPanel } from "@/components/settings/projects-panel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type { CatalogSnapshot } from "@/lib/db/catalog-repo";
import type { ProjectAdAccountRow } from "@/lib/db/project-repo";
import type { CatalogLabels, ProjectInfo } from "@/lib/types";

import { ProjectOverviewForm } from "./project-overview-form";

type PageRow = {
  id: string;
  facebookPageId: string;
  name: string | null;
  projectId: string | null;
  active: boolean;
};
type PartnerRow = {
  id: string;
  fullName: string;
  email: string | null;
  projectId: string | null;
};

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
}) {
  const projectPages = pages.filter((p) => p.projectId === project.id);
  const totalCatalogItems =
    catalog.brands.length + catalog.products.length + catalog.locations.length;

  return (
    <Tabs defaultValue="catalog" className="space-y-4">
      <div className="border-b border-border/80 pb-1">
        <TabsList className="bg-slate-100/90 p-1 flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="catalog" className="gap-2 text-[13px] font-medium">
            <Layers className="size-3.5 text-primary" />
            <span>Catalog danh mục</span>
            <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
              {totalCatalogItems}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="attrs" className="gap-2 text-[13px] font-medium">
            <SlidersHorizontal className="size-3.5 text-slate-600" />
            <span>Field phụ</span>
            <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
              {attrFields.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="fanpages" className="gap-2 text-[13px] font-medium">
            <Building2 className="size-3.5 text-blue-600" />
            <span>Fanpage</span>
            <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
              {projectPages.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="ads" className="gap-2 text-[13px] font-medium">
            <Megaphone className="size-3.5 text-amber-600" />
            <span>Tài khoản Ads</span>
            <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
              {adAccounts.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="partners" className="gap-2 text-[13px] font-medium">
            <Users className="size-3.5 text-emerald-600" />
            <span>Đối tác / Partner</span>
            <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
              {partners.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="overview" className="gap-2 text-[13px] font-medium">
            <FolderKanban className="size-3.5 text-slate-600" />
            <span>Cài đặt & Nhãn</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="catalog" className="pt-2">
        <CatalogPanel
          catalog={catalog}
          labels={labels}
          isAdmin={canManageCatalog}
          dbConfigured={dbConfigured}
          projectId={project.id}
        />
      </TabsContent>

      <TabsContent value="attrs" className="pt-2">
        <AttrFieldsPanel
          fields={attrFields}
          isAdmin={canManageCatalog}
          dbConfigured={dbConfigured}
          projectId={project.id}
        />
      </TabsContent>

      <TabsContent value="fanpages" className="pt-2">
        <ProjectsPanel
          projects={[project]}
          activeProjectId={project.id}
          embeddedProjectId={project.id}
          pages={pages}
          partners={[]}
          adAccounts={[]}
          canManage={canManageProject}
          sections={["pages"]}
        />
      </TabsContent>

      <TabsContent value="ads" className="pt-2">
        <ProjectsPanel
          projects={[project]}
          activeProjectId={project.id}
          embeddedProjectId={project.id}
          pages={[]}
          partners={[]}
          adAccounts={adAccounts}
          canManage={canManageProject}
          sections={["ads"]}
        />
      </TabsContent>

      <TabsContent value="partners" className="pt-2">
        <ProjectsPanel
          projects={[project]}
          activeProjectId={project.id}
          embeddedProjectId={project.id}
          pages={[]}
          partners={partners}
          partnersAvailable={partnersAvailable}
          adAccounts={[]}
          canManage={canManageProject}
          sections={["partners"]}
        />
      </TabsContent>

      <TabsContent value="overview" className="pt-2">
        <div className="max-w-2xl rounded-xl border border-border/80 bg-card p-5 shadow-xs">
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            Cấu hình Dự án & Nhãn ngành hàng
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Đổi tên nhãn thương hiệu, sản phẩm, địa điểm để phù hợp với từng ngành nghề kinh doanh
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

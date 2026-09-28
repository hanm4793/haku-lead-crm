"use client";

import { AttrFieldsPanel } from "@/components/settings/attr-fields-panel";
import { CatalogPanel } from "@/components/settings/catalog-panel";
import { ProjectsPanel } from "@/components/settings/projects-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type { CatalogSnapshot } from "@/lib/db/catalog-repo";
import type { ProjectAdAccountRow } from "@/lib/db/project-repo";
import type { CatalogLabels, ProjectInfo } from "@/lib/types";

import { ProjectOverviewForm } from "./project-overview-form";

type PageRow = { id: string; facebookPageId: string; name: string | null; projectId: string | null; active: boolean };
type PartnerRow = { id: string; fullName: string; email: string | null; projectId: string | null };

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
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap justify-start gap-1">
        <TabsTrigger value="overview">Tổng quan</TabsTrigger>
        <TabsTrigger value="fanpages">Fanpage</TabsTrigger>
        <TabsTrigger value="ads">Ads</TabsTrigger>
        <TabsTrigger value="partners">Partner</TabsTrigger>
        <TabsTrigger value="catalog">Catalog</TabsTrigger>
        <TabsTrigger value="attrs">Field phụ</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <ProjectOverviewForm project={project} canEditName={canManageProject} canEditLabels={canEditLabels} />
      </TabsContent>

      <TabsContent value="fanpages">
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

      <TabsContent value="ads">
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

      <TabsContent value="partners">
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

      <TabsContent value="catalog">
        <CatalogPanel
          catalog={catalog}
          labels={labels}
          isAdmin={canManageCatalog}
          dbConfigured={dbConfigured}
          projectId={project.id}
        />
      </TabsContent>

      <TabsContent value="attrs">
        <AttrFieldsPanel
          fields={attrFields}
          isAdmin={canManageCatalog}
          dbConfigured={dbConfigured}
          projectId={project.id}
        />
      </TabsContent>
    </Tabs>
  );
}

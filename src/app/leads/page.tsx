import { redirect } from "next/navigation";

import { LeadsPage } from "@/components/leads/leads-page";
import { NowProvider } from "@/components/providers/now-provider";
import { isPageVisible } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import { queryLeadPage } from "@/lib/db/leads-repo";
import { listAssignableStaff } from "@/lib/db/users-repo";
import { EMPTY_FILTERS } from "@/lib/filters";
import type { LeadSearchInput } from "@/lib/leads/query";

export const metadata = { title: "Lead — SEMTOP Marketing CRM" };
export const dynamic = "force-dynamic";

/** Trang đầu tiên được render sẵn ở server; các lần lọc sau đi qua /api/leads/search. */
const INITIAL_REQUEST: LeadSearchInput = {
  filters: EMPTY_FILTERS,
  sortBy: "createdAt",
  sortOrder: "desc",
  page: 1,
  pageSize: 50,
};

export default async function Page() {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-xl font-bold">Chưa cấu hình database</h1>
        <p className="text-[13px] text-muted-foreground">
          Điền <code className="rounded bg-secondary px-1">DATABASE_URL</code> và{" "}
          <code className="rounded bg-secondary px-1">DIRECT_URL</code> từ Supabase vào{" "}
          <code className="rounded bg-secondary px-1">.env.local</code>, rồi chạy:
        </p>
        <pre className="rounded-lg border border-border bg-card p-3 text-[12px]">
          {`pnpm db:migrate\npnpm db:seed\npnpm dev`}
        </pre>
        <p className="text-[13px] text-muted-foreground">Chi tiết nằm trong README.md.</p>
      </div>
    );
  }

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const now = new Date();
  const [initialData, facebookPages, assignees] = await Promise.all([
    queryLeadPage({ ...INITIAL_REQUEST, now }, viewer),
    listFacebookPages(),
    listAssignableStaff(viewer),
  ]);

  const fanpageOptions = facebookPages
    .filter((page) => page.active && isPageVisible(viewer, page.facebookPageId))
    .map((page) => ({
      value: page.facebookPageId,
      label: page.name?.trim() || page.facebookPageId,
    }));

  return (
    <NowProvider value={now.toISOString()}>
      <LeadsPage
        initialData={initialData}
        initialRequest={INITIAL_REQUEST}
        fanpageOptions={fanpageOptions}
        assignees={assignees}
        editor={{ role: viewer.role, appUserId: viewer.appUserId }}
      />
    </NowProvider>
  );
}

import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import {
  FacebookSyncPanel,
  type LastSyncInfo,
} from "@/components/settings/facebook-sync-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { estimateCostUsd, getModelId, getProvider, isAiConfigured, PROVIDERS } from "@/lib/ai/model";
import { getViewer, listUnlinkedUsers } from "@/lib/auth/viewer";
import { ASSIGNEES, SALES_ROOMS, SHOWROOMS, SOURCE_OPTIONS } from "@/lib/constants";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import { getReferenceData } from "@/lib/db/leads-repo";
import { metaSyncRuns } from "@/lib/db/schema";
import { getFacebookConfig } from "@/lib/facebook/env";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Cài đặt — CRM THACO Auto" };
export const dynamic = "force-dynamic";

const AI_ROADMAP = [
  { phase: "Đang có", items: ["AI Chat", "Export thông minh từ mô tả bằng lời"] },
  { phase: "Tiếp theo", items: ["Chấm điểm chất lượng lead", "Phát hiện trùng lead", "Phân phối lead tự động"] },
  {
    phase: "Cần dữ liệu lịch sử",
    items: ["Dự đoán CPL / CPA", "Dự đoán khả năng chốt", "Churn & CLV", "Tệp lookalike"],
  },
];

/** Một lượt hỏi export tiêu tốn xấp xỉ bằng này token. */
const TOKENS_PER_CALL = { input: 2000, output: 400 };
const USD_TO_VND = 26000;

async function loadLastFacebookSync(kind: "leads" | "insights"): Promise<{
  lastSync: LastSyncInfo;
  syncError: string | null;
}> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        startedAt: metaSyncRuns.startedAt,
        status: metaSyncRuns.status,
        message: metaSyncRuns.message,
      })
      .from(metaSyncRuns)
      .where(eq(metaSyncRuns.kind, kind))
      .orderBy(desc(metaSyncRuns.startedAt))
      .limit(1);
    if (!row) {
      return { lastSync: null, syncError: null };
    }
    return {
      lastSync: {
        at: row.startedAt.toISOString(),
        status: row.status,
        message: row.message,
      },
      syncError: null,
    };
  } catch (error) {
    console.error(`[settings] loadLastFacebookSync(${kind}) failed`, error);
    const message =
      error instanceof Error ? error.message : "Không đọc được lịch sử đồng bộ từ database.";
    return { lastSync: null, syncError: message };
  }
}

export default async function Page() {
  const provider = getProvider();
  const modelId = getModelId(provider);
  const aiConfigured = isAiConfigured(provider);
  const costPerCall = estimateCostUsd(modelId, TOKENS_PER_CALL.input, TOKENS_PER_CALL.output);
  const dbConfigured = isDatabaseConfigured();
  const authConfigured = isSupabaseConfigured();
  const viewer = await getViewer();

  const reference = dbConfigured
    ? await getReferenceData().catch(() => null)
    : null;
  const unlinked = dbConfigured ? await listUnlinkedUsers().catch(() => []) : [];
  const facebookConfig = getFacebookConfig();
  const facebookConfigured = facebookConfig !== null;
  const insightsConfigured = Boolean(facebookConfig?.adAccountId);
  const [leadSyncState, insightsSyncState] = dbConfigured
    ? await Promise.all([loadLastFacebookSync("leads"), loadLastFacebookSync("insights")])
    : [
        { lastSync: null, syncError: null },
        { lastSync: null, syncError: null },
      ];
  const isAdmin = viewer?.role === "ADMIN";

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Cài đặt App</h1>
        <p className="text-[13px] text-muted-foreground">Danh mục dùng chung và trạng thái tích hợp</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cơ sở dữ liệu &amp; đăng nhập</CardTitle>
            <CardDescription>Supabase Postgres + Auth</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">DATABASE_URL</span>
              <Badge variant={dbConfigured ? "success" : "warning"}>
                {dbConfigured ? "Đã cấu hình" : "Chưa có"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Supabase Auth</span>
              <Badge variant={authConfigured ? "success" : "warning"}>
                {authConfigured ? "Đã cấu hình" : "Chế độ demo"}
              </Badge>
            </div>
            <Row label="Người đang xem" value={viewer?.fullName ?? "—"} />
            <Row label="Vai trò" value={viewer?.role ?? "—"} />
            {unlinked.length > 0 && (
              <p className="pt-1 text-xs text-muted-foreground">
                {unlinked.length} nhân sự chưa gắn tài khoản đăng nhập (gán email ở mục Tài khoản).
              </p>
            )}
            {viewer?.role === "ADMIN" && (
              <div className="pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/users">Quản lý tài khoản &amp; phân quyền</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trợ lý AI</CardTitle>
            <CardDescription>Model dùng cho AI Chat và Export thông minh</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px]">
            <Row label="Nhà cung cấp" value={PROVIDERS[provider].label} />
            <Row label="Model" value={modelId} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Trạng thái</span>
              {aiConfigured ? (
                <Badge variant="success">Đã cấu hình</Badge>
              ) : (
                <Badge variant="warning">Chưa có key — đang chạy chế độ từ khóa</Badge>
              )}
            </div>
            <Row
              label="Chi phí ước tính / lượt hỏi"
              value={
                costPerCall === null
                  ? "Miễn phí"
                  : `${(costPerCall * USD_TO_VND).toFixed(1)} đ · ${(costPerCall * 1000 * USD_TO_VND).toFixed(0)} đ / 1.000 lượt`
              }
            />
            <p className="pt-1 text-xs text-muted-foreground">
              Dữ liệu khách hàng không được gửi tới model. Prompt chỉ chứa mô tả schema và danh mục giá trị hợp lệ.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lộ trình tính năng AI</CardTitle>
            <CardDescription>Thứ tự triển khai theo mức độ phụ thuộc dữ liệu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            {AI_ROADMAP.map((group) => (
              <div key={group.phase}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.phase}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <Badge key={item} variant="muted">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danh mục</CardTitle>
            <CardDescription>
              {reference ? "Đọc từ database" : "Nguồn dự phòng từ constants.ts (chưa có DB)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <Group title="Nguồn lead" items={SOURCE_OPTIONS.map((o) => o.label)} />
            <Group title="Showroom" items={reference?.showrooms ?? [...SHOWROOMS]} />
            <Group title="Phòng bán hàng" items={reference?.salesRooms ?? [...SALES_ROOMS]} />
            <Group title="Nhân sự phụ trách" items={reference?.assignees ?? [...ASSIGNEES]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tích hợp</CardTitle>
            <CardDescription>Kết nối hệ thống ngoài</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <Row label="B10 (DDMS)" value="Đồng bộ thủ công — chưa nối API" />
            <FacebookSyncPanel
              configured={facebookConfigured}
              insightsConfigured={insightsConfigured}
              dbConfigured={dbConfigured}
              lastLeadSync={leadSyncState.lastSync}
              leadSyncError={leadSyncState.syncError}
              lastInsightsSync={insightsSyncState.lastSync}
              insightsSyncError={insightsSyncState.syncError}
              isAdmin={isAdmin}
            />
            <Row label="Google Ads" value="Chưa kết nối" />
            <Row label="Zalo OA" value="Chưa kết nối" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-slate-800">{value}</span>
    </div>
  );
}

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

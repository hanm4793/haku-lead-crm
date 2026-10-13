import Link from "next/link";
import { redirect } from "next/navigation";

import { FacebookSyncPanel } from "@/components/settings/facebook-sync-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { estimateCostUsd, getModelId, getProvider, isAiConfigured, PROVIDERS } from "@/lib/ai/model";
import { canManageSettings } from "@/lib/auth/roles";
import { getScopedViewer, listUnlinkedUsers } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getFacebookConfig, isFacebookTokenConfigured } from "@/lib/facebook/env";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Cài đặt — SEMTOP Marketing CRM" };
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

export default async function Page() {
  const provider = getProvider();
  const modelId = getModelId(provider);
  const aiConfigured = isAiConfigured(provider);
  const costPerCall = estimateCostUsd(modelId, TOKENS_PER_CALL.input, TOKENS_PER_CALL.output);
  const dbConfigured = isDatabaseConfigured();
  const authConfigured = isSupabaseConfigured();
  const viewer = await getScopedViewer();
  if (!viewer) redirect("/login?next=%2Fsettings");
  if (!canManageSettings(viewer.role)) redirect("/leads");

  const unlinked = dbConfigured ? await listUnlinkedUsers().catch(() => []) : [];
  const facebookConfig = getFacebookConfig();
  const tokenConfigured = isFacebookTokenConfigured();
  const insightsConfigured = Boolean(facebookConfig?.adAccountId);
  const isAdmin = Boolean(viewer && canManageSettings(viewer.role));

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Cài đặt App</h1>
        <p className="text-[13px] text-muted-foreground">Tích hợp toàn hệ thống và trợ lý AI</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-[13px]">
          <p>Quản lý dự án, catalog và field phụ tại menu <strong>Dự án</strong>.</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/projects">Mở Dự án</Link>
          </Button>
        </CardContent>
      </Card>

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
            {viewer?.role === "SUPER_ADMIN" && (
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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tích hợp</CardTitle>
            <CardDescription>Kết nối hệ thống ngoài</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <FacebookSyncPanel
              tokenConfigured={tokenConfigured}
              insightsConfigured={insightsConfigured}
              dbConfigured={dbConfigured}
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


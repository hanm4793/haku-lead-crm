"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  assignPageToProjectAction,
  assignPartnerToProjectAction,
  createProjectAction,
  removeAdAccountAction,
  setAdAccountActiveAction,
  upsertAdAccountAction,
} from "@/app/projects/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AdPlatform, ProjectAdAccountRow } from "@/lib/db/project-repo";
import type { ProjectInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type PageRow = { id: string; facebookPageId: string; name: string | null; projectId: string | null; active: boolean };
type PartnerRow = { id: string; fullName: string; email: string | null; projectId: string | null };

const PLATFORMS: { value: AdPlatform; label: string }[] = [
  { value: "google", label: "Google Ads" },
  { value: "tiktok", label: "TikTok Ads" },
  { value: "zalo", label: "Zalo OA" },
];

export function ProjectsPanel({
  projects,
  activeProjectId,
  pages,
  partners,
  partnersAvailable,
  adAccounts,
  embeddedProjectId,
  canManage = true,
  sections,
}: {
  projects: ProjectInfo[];
  activeProjectId: string;
  pages: PageRow[];
  /** Partner đã thuộc project (legacy: partners with projectId). */
  partners: PartnerRow[];
  /** Partner có thể gán thêm vào project hiện tại. */
  partnersAvailable?: PartnerRow[];
  adAccounts: ProjectAdAccountRow[];
  embeddedProjectId?: string;
  canManage?: boolean;
  sections?: Array<"pages" | "partners" | "ads">;
}) {
  const showPages = !sections || sections.includes("pages");
  const showPartners = !sections || sections.includes("partners");
  const showAds = !sections || sections.includes("ads");
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState(embeddedProjectId ?? activeProjectId);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");

  const [editName, setEditName] = React.useState("");
  const [editBrand, setEditBrand] = React.useState("");
  const [editProduct, setEditProduct] = React.useState("");
  const [editLocation, setEditLocation] = React.useState("");

  const [adPlatform, setAdPlatform] = React.useState<AdPlatform>("google");
  const [adAccountId, setAdAccountId] = React.useState("");
  const [adName, setAdName] = React.useState("");

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];

  React.useEffect(() => {
    if (selected) {
      setEditName(selected.name);
      setEditBrand(selected.labels.brand);
      setEditProduct(selected.labels.product);
      setEditLocation(selected.labels.location);
    }
  }, [selected]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setPending(true);
    setError(null);
    setFeedback(null);
    try {
      const outcome = await fn();
      if (!outcome.ok) {
        setError(outcome.error ?? "Thao tác thất bại.");
        return;
      }
      setFeedback(done);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const projectPages = pages.filter((p) => p.projectId === selectedId);
  const unassignedPages = pages.filter((p) => !p.projectId);
  const projectPartners = partners;
  const unassignedPartners = partnersAvailable ?? partners.filter((p) => !p.projectId);
  const projectAdAccounts = adAccounts.filter((a) => a.projectId === selectedId);

  return (
    <div className="space-y-4">
      {!embeddedProjectId && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Project đang cấu hình
              </Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {canManage && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tạo project</div>
              <div className="flex flex-wrap gap-2">
                <Input placeholder="slug (vd: semtop-auto)" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} className="max-w-[180px]" />
                <Input placeholder="Tên hiển thị" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-[200px]" />
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      () => createProjectAction({ slug: newSlug, name: newName }),
                      "Đã tạo project.",
                    )
                  }
                >
                  Thêm
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {showPages && (
      <Section title="Fanpage trong project" count={projectPages.length}>
        {projectPages.length === 0 && <p className="text-xs text-muted-foreground">Chưa gán fanpage.</p>}
        {projectPages.map((page) => (
          <Row key={page.id} label={page.name?.trim() || page.facebookPageId} />
        ))}
        {canManage && unassignedPages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select onValueChange={(pageId) => void run(() => assignPageToProjectAction({ pageId, projectId: selectedId }), "Đã gán fanpage.")}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Gán fanpage chưa thuộc project…" />
              </SelectTrigger>
              <SelectContent>
                {unassignedPages.map((page) => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.name?.trim() || page.facebookPageId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Section>
      )}

      {showPartners && (
      <Section title="Partner admin" count={projectPartners.length}>
        {projectPartners.map((p) => (
          <Row key={p.id} label={`${p.fullName}${p.email ? ` · ${p.email}` : ""}`} />
        ))}
        {canManage && unassignedPartners.length > 0 && (
          <Select
            onValueChange={(partnerId) =>
              void run(
                () => assignPartnerToProjectAction({ partnerId, projectId: selectedId }),
                "Đã gán partner (và staff).",
              )
            }
          >
            <SelectTrigger className="mt-2 w-[280px]">
              <SelectValue placeholder="Gán partner chưa có project…" />
            </SelectTrigger>
            <SelectContent>
              {unassignedPartners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Section>
      )}

      {showAds && (
      <Section title="Tài khoản ads / leads (lưu cấu hình)" count={projectAdAccounts.length}>
        {projectAdAccounts.map((acc) => (
          <div key={acc.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/70 px-2 py-1.5">
            <div className="text-[13px]">
              <Badge variant="outline" className="mr-2 capitalize">
                {acc.platform}
              </Badge>
              {acc.name || acc.externalAccountId}
            </div>
            {canManage && (
            <div className="flex items-center gap-2">
              <Switch
                checked={acc.active}
                disabled={pending}
                onCheckedChange={(active) =>
                  void run(() => setAdAccountActiveAction({ id: acc.id, active }), "Đã cập nhật.")
                }
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600"
                disabled={pending}
                onClick={() => void run(() => removeAdAccountAction(acc.id), "Đã xóa.")}
              >
                Xóa
              </Button>
            </div>
            )}
          </div>
        ))}
        {canManage && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Select value={adPlatform} onValueChange={(v) => setAdPlatform(v as AdPlatform)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Account ID" value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} className="max-w-[200px]" />
          <Input placeholder="Tên (tuỳ chọn)" value={adName} onChange={(e) => setAdName(e.target.value)} className="max-w-[160px]" />
          <Button
            size="sm"
            disabled={pending || !adAccountId.trim()}
            onClick={() =>
              void run(
                () =>
                  upsertAdAccountAction({
                    projectId: selectedId,
                    platform: adPlatform,
                    externalAccountId: adAccountId,
                    name: adName || null,
                  }),
                "Đã lưu kết nối.",
              )
            }
          >
            Thêm / cập nhật
          </Button>
        </div>
        )}
      </Section>
      )}

      {feedback && <p className="text-[13px] text-emerald-700">{feedback}</p>}
      {error && <p className="text-[13px] text-rose-600">{error}</p>}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({count})
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label }: { label: string }) {
  return <div className={cn("rounded border border-border/60 px-2 py-1.5 text-[13px]")}>{label}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

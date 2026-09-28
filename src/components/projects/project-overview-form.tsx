"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { updateProjectAction } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectInfo } from "@/lib/types";

export function ProjectOverviewForm({
  project,
  canEditName,
  canEditLabels,
}: {
  project: ProjectInfo;
  canEditName: boolean;
  canEditLabels: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(project.name);
  const [brand, setBrand] = React.useState(project.labels.brand);
  const [product, setProduct] = React.useState(project.labels.product);
  const [location, setLocation] = React.useState(project.labels.location);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const save = async () => {
    setPending(true);
    setError(null);
    setFeedback(null);
    const result = await updateProjectAction({
      id: project.id,
      name: canEditName ? name : undefined,
      brandLabel: canEditLabels ? brand : undefined,
      productLabel: canEditLabels ? product : undefined,
      locationLabel: canEditLabels ? location : undefined,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFeedback("Đã lưu.");
    router.refresh();
  };

  if (!canEditName && !canEditLabels) {
    return (
      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Tên</dt>
          <dd className="font-medium">{project.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Slug</dt>
          <dd className="font-mono">{project.slug}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {canEditName && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Tên project</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        {!canEditName && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Tên project</Label>
            <p className="text-[13px] font-medium">{project.name}</p>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Slug</Label>
          <p className="font-mono text-[13px] text-muted-foreground">{project.slug}</p>
        </div>
        {canEditLabels && (
          <>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Nhãn thương hiệu</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Nhãn sản phẩm</Label>
              <Input value={product} onChange={(e) => setProduct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Nhãn địa điểm</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <Button size="sm" disabled={pending} onClick={() => void save()}>
        Lưu thông tin
      </Button>
      {feedback && <p className="text-[13px] text-emerald-700">{feedback}</p>}
      {error && <p className="text-[13px] text-rose-600">{error}</p>}
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  createBrandAction,
  createLocationAction,
  createProductAction,
  deleteBrandAction,
  deleteLocationAction,
  deleteProductAction,
  setBrandActiveAction,
  setLocationActiveAction,
  setProductActiveAction,
  type CatalogActionResult,
} from "@/app/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CatalogSnapshot } from "@/lib/db/catalog-repo";
import type { CatalogLabels } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Quản lý 3 danh mục dimension trên trang Cài đặt. Tắt (`active = false`) ẩn
 * khỏi dropdown nhưng giữ lịch sử; xóa chỉ được khi chưa có lead trỏ tới.
 */
export function CatalogPanel({
  catalog,
  labels,
  isAdmin,
  dbConfigured,
  projectId,
}: {
  catalog: CatalogSnapshot;
  labels: CatalogLabels;
  isAdmin: boolean;
  dbConfigured: boolean;
  /** Khi quản lý từ /projects/[id] — gửi kèm server actions. */
  projectId?: string;
}) {
  const scope = projectId ? { projectId } : {};
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const [brandName, setBrandName] = React.useState("");
  const [brandCode, setBrandCode] = React.useState("");
  const [productBrandId, setProductBrandId] = React.useState<string>(catalog.brands[0]?.id ?? "");
  const [productName, setProductName] = React.useState("");
  const [locationName, setLocationName] = React.useState("");

  const run = async (action: () => Promise<CatalogActionResult>, done: string) => {
    setPending(true);
    setError(null);
    setFeedback(null);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        setError(outcome.error);
        return false;
      }
      setFeedback(done);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  };

  if (!dbConfigured) {
    return <p className="text-xs text-amber-800">Cần DATABASE_URL để quản lý danh mục.</p>;
  }

  const activeBrands = catalog.brands.filter((b) => b.active);

  return (
    <div className="space-y-4">
      {/* Brands */}
      <Section title={labels.brand} count={catalog.brands.length}>
        <ul className="space-y-1.5">
          {catalog.brands.map((brand) => (
            <CatalogRow
              key={brand.id}
              primary={brand.name}
              secondary={brand.code}
              active={brand.active}
              isAdmin={isAdmin}
              pending={pending}
              onToggle={(active) =>
                run(() => setBrandActiveAction({ ...scope, id: brand.id, active }), `Đã ${active ? "bật" : "tắt"} ${brand.name}.`)
              }
              onDelete={() => run(() => deleteBrandAction({ ...scope, id: brand.id }), `Đã xóa ${brand.name}.`)}
            />
          ))}
          {catalog.brands.length === 0 && <Empty label={labels.brand} />}
        </ul>
        {isAdmin && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => createBrandAction({ ...scope, name: brandName, code: brandCode }), `Đã thêm ${brandName}.`).then(
                (ok) => {
                  if (ok) {
                    setBrandName("");
                    setBrandCode("");
                  }
                },
              );
            }}
          >
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={`Tên ${labels.brand.toLowerCase()}`}
              className="h-8 max-w-[200px]"
            />
            <Input
              value={brandCode}
              onChange={(e) => setBrandCode(e.target.value)}
              placeholder="Mã (tự sinh nếu trống)"
              className="h-8 max-w-[180px] font-mono uppercase"
            />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !brandName.trim()}>
              Thêm
            </Button>
          </form>
        )}
      </Section>

      {/* Products */}
      <Section title={labels.product} count={catalog.products.length}>
        <ul className="space-y-1.5">
          {catalog.products.map((product) => (
            <CatalogRow
              key={product.id}
              primary={product.name}
              secondary={product.brandName}
              active={product.active}
              isAdmin={isAdmin}
              pending={pending}
              onToggle={(active) =>
                run(
                  () => setProductActiveAction({ ...scope, id: product.id, active }),
                  `Đã ${active ? "bật" : "tắt"} ${product.name}.`,
                )
              }
              onDelete={() => run(() => deleteProductAction({ ...scope, id: product.id }), `Đã xóa ${product.name}.`)}
            />
          ))}
          {catalog.products.length === 0 && <Empty label={labels.product} />}
        </ul>
        {isAdmin && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => createProductAction({ ...scope, brandId: productBrandId, name: productName }),
                `Đã thêm ${productName}.`,
              ).then((ok) => ok && setProductName(""));
            }}
          >
            <Select value={productBrandId} onValueChange={setProductBrandId}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue placeholder={`Chọn ${labels.brand.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {activeBrands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder={`Tên ${labels.product.toLowerCase()}`}
              className="h-8 max-w-[220px]"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={pending || !productName.trim() || !productBrandId}
            >
              Thêm
            </Button>
          </form>
        )}
        {isAdmin && activeBrands.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Thêm {labels.brand.toLowerCase()} trước rồi mới thêm {labels.product.toLowerCase()}.
          </p>
        )}
      </Section>

      {/* Locations */}
      <Section title={labels.location} count={catalog.locations.length}>
        <ul className="space-y-1.5">
          {catalog.locations.map((location) => (
            <CatalogRow
              key={location.id}
              primary={location.name}
              active={location.active}
              isAdmin={isAdmin}
              pending={pending}
              onToggle={(active) =>
                run(
                  () => setLocationActiveAction({ ...scope, id: location.id, active }),
                  `Đã ${active ? "bật" : "tắt"} ${location.name}.`,
                )
              }
              onDelete={() => run(() => deleteLocationAction({ ...scope, id: location.id }), `Đã xóa ${location.name}.`)}
            />
          ))}
          {catalog.locations.length === 0 && <Empty label={labels.location} />}
        </ul>
        {isAdmin && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => createLocationAction({ ...scope, name: locationName }), `Đã thêm ${locationName}.`).then(
                (ok) => ok && setLocationName(""),
              );
            }}
          >
            <Input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder={`Tên ${labels.location.toLowerCase()}`}
              className="h-8 max-w-[260px]"
            />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !locationName.trim()}>
              Thêm
            </Button>
          </form>
        )}
      </Section>

      {error && (
        <p className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="text-xs text-emerald-800" role="status">
          {feedback}
        </p>
      )}
      {!isAdmin && <p className="text-xs text-muted-foreground">Chỉ super admin mới sửa danh mục.</p>}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({count})
      </div>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <li className="text-xs text-muted-foreground">Chưa có {label.toLowerCase()} nào.</li>;
}

function CatalogRow({
  primary,
  secondary,
  active,
  isAdmin,
  pending,
  onToggle,
  onDelete,
}: {
  primary: string;
  secondary?: string;
  active: boolean;
  isAdmin: boolean;
  pending: boolean;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-card px-2 py-1.5 text-[13px]",
        !active && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <span className="font-medium text-slate-800">{primary}</span>
        {secondary && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{secondary}</span>}
      </div>
      {isAdmin ? (
        <div className="flex items-center gap-2">
          <Switch checked={active} disabled={pending} onCheckedChange={onToggle} />
          <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={onDelete}>
            Xóa
          </Button>
        </div>
      ) : (
        <Badge variant={active ? "success" : "muted"}>{active ? "Bật" : "Tắt"}</Badge>
      )}
    </li>
  );
}

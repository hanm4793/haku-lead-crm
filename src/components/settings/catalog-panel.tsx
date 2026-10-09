"use client";

import * as React from "react";
import { Plus, Tag } from "lucide-react";
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
  updateBrandAction,
  updateLocationAction,
  updateProductAction,
  type CatalogActionResult,
} from "@/app/settings/actions";
import { ConfirmDialog, FormDialog, FormField, RowActions } from "@/components/common/crud-dialogs";
import { DataTable, ListPanel, type DataColumn } from "@/components/common/data-table";
import {
  ActiveSwitch,
  CountTabs,
  FilterSelect,
  ListToolbar,
  matchesStatus,
  STATUS_FILTER_OPTIONS,
} from "@/components/common/list-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BrandRow, CatalogSnapshot, LocationRow, ProductWithBrand } from "@/lib/db/catalog-repo";
import type { CatalogLabels } from "@/lib/types";
import { useToast } from "@/components/providers/toast-provider";

type Kind = "brands" | "products" | "locations";
type Editing = { kind: Kind; item?: BrandRow | ProductWithBrand | LocationRow } | null;

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
  projectId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const scope = React.useMemo(() => (projectId ? { projectId } : {}), [projectId]);

  const [kind, setKind] = React.useState<Kind>("brands");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [brandFilter, setBrandFilter] = React.useState("all");
  const [pending, setPending] = React.useState(false);

  const [editing, setEditing] = React.useState<Editing>(null);
  const [form, setForm] = React.useState({ name: "", code: "", brandId: "" });
  const [deleting, setDeleting] = React.useState<{ kind: Kind; id: string; name: string } | null>(null);

  const singular: Record<Kind, string> = {
    brands: labels.brand,
    products: labels.product,
    locations: labels.location,
  };
  const activeBrands = catalog.brands.filter((b) => b.active);

  const run = async (action: () => Promise<CatalogActionResult>, success: string) => {
    setPending(true);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        toast.error("Không thực hiện được", outcome.error);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  };

  const toggle = (action: () => Promise<CatalogActionResult>) => void run(action, "Đã cập nhật trạng thái.");

  const changeKind = (next: Kind) => {
    setKind(next);
    setQuery("");
    setStatus("all");
    setBrandFilter("all");
  };

  const openCreate = () => {
    setForm({ name: "", code: "", brandId: activeBrands[0]?.id ?? "" });
    setEditing({ kind });
  };

  const openEdit = (target: Kind, item: BrandRow | ProductWithBrand | LocationRow) => {
    setForm({
      name: item.name,
      code: "code" in item ? item.code : "",
      brandId: "brandId" in item ? item.brandId : "",
    });
    setEditing({ kind: target, item });
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.item?.id;
    const action = (): Promise<CatalogActionResult> => {
      if (editing.kind === "brands") {
        return id
          ? updateBrandAction({ ...scope, id, name: form.name, code: form.code })
          : createBrandAction({ ...scope, name: form.name, code: form.code });
      }
      if (editing.kind === "products") {
        return id
          ? updateProductAction({ ...scope, id, name: form.name, brandId: form.brandId })
          : createProductAction({ ...scope, name: form.name, brandId: form.brandId });
      }
      return id
        ? updateLocationAction({ ...scope, id, name: form.name })
        : createLocationAction({ ...scope, name: form.name });
    };
    const label = singular[editing.kind].toLowerCase();
    if (await run(action, id ? `Đã cập nhật ${label}.` : `Đã thêm ${label}.`)) setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { id } = deleting;
    const action =
      deleting.kind === "brands"
        ? () => deleteBrandAction({ ...scope, id })
        : deleting.kind === "products"
          ? () => deleteProductAction({ ...scope, id })
          : () => deleteLocationAction({ ...scope, id });
    await run(action, `Đã xóa «${deleting.name}».`);
    setDeleting(null);
  };

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (kind === "brands") {
      return catalog.brands.filter(
        (b) => matchesStatus(status, b.active) && (!q || b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)),
      );
    }
    if (kind === "products") {
      return catalog.products.filter(
        (p) =>
          matchesStatus(status, p.active) &&
          (brandFilter === "all" || p.brandId === brandFilter) &&
          (!q || p.name.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q)),
      );
    }
    return catalog.locations.filter((l) => matchesStatus(status, l.active) && (!q || l.name.toLowerCase().includes(q)));
  }, [catalog, kind, query, status, brandFilter]);

  const activeColumn = <T extends { id: string; active: boolean }>(
    setActive: (input: { id: string; active: boolean }) => Promise<CatalogActionResult>,
  ): DataColumn<T> => ({
    id: "active",
    header: "Trạng thái",
    sortValue: (r) => r.active,
    cell: (r) => (
      <ActiveSwitch
        checked={r.active}
        disabled={!isAdmin || pending}
        onChange={(active) => toggle(() => setActive({ ...scope, id: r.id, active } as never))}
      />
    ),
  });

  const actionColumn = <T extends BrandRow | ProductWithBrand | LocationRow>(target: Kind): DataColumn<T> => ({
    id: "actions",
    header: "",
    align: "right",
    width: 90,
    cell: (r) => (
      <RowActions
        editTitle={`Sửa ${singular[target].toLowerCase()}`}
        deleteTitle={`Xóa ${singular[target].toLowerCase()}`}
        onEdit={() => openEdit(target, r)}
        onDelete={() => setDeleting({ kind: target, id: r.id, name: r.name })}
      />
    ),
  });

  const brandColumns: DataColumn<BrandRow>[] = [
    { id: "name", header: `Tên ${labels.brand}`, sortValue: (b) => b.name, cell: (b) => <span className="font-semibold text-slate-800">{b.name}</span> },
    {
      id: "code",
      header: "Mã",
      sortValue: (b) => b.code,
      cell: (b) => <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] font-semibold uppercase text-slate-600">{b.code}</span>,
    },
    activeColumn<BrandRow>(setBrandActiveAction),
    ...(isAdmin ? [actionColumn<BrandRow>("brands")] : []),
  ];

  const productColumns: DataColumn<ProductWithBrand>[] = [
    { id: "name", header: `Tên ${labels.product}`, sortValue: (p) => p.name, cell: (p) => <span className="font-semibold text-slate-800">{p.name}</span> },
    {
      id: "brand",
      header: labels.brand,
      sortValue: (p) => p.brandName,
      cell: (p) => (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 ring-1 ring-purple-200">
          <Tag className="size-3" />
          {p.brandName}
        </span>
      ),
    },
    activeColumn<ProductWithBrand>(setProductActiveAction),
    ...(isAdmin ? [actionColumn<ProductWithBrand>("products")] : []),
  ];

  const locationColumns: DataColumn<LocationRow>[] = [
    { id: "name", header: `Tên ${labels.location}`, sortValue: (l) => l.name, cell: (l) => <span className="font-semibold text-slate-800">{l.name}</span> },
    activeColumn<LocationRow>(setLocationActiveAction),
    ...(isAdmin ? [actionColumn<LocationRow>("locations")] : []),
  ];

  if (!dbConfigured) {
    return <p className="text-sm text-amber-800">Cần cấu hình DATABASE_URL để quản lý danh mục.</p>;
  }

  const lower = singular[kind].toLowerCase();
  const table =
    kind === "brands" ? (
      <DataTable columns={brandColumns} rows={rows as BrandRow[]} getRowKey={(r) => r.id} unit={lower} defaultSort={{ columnId: "name", order: "asc" }} emptyMessage={`Không có ${lower} nào khớp bộ lọc hiện tại.`} />
    ) : kind === "products" ? (
      <DataTable columns={productColumns} rows={rows as ProductWithBrand[]} getRowKey={(r) => r.id} unit={lower} defaultSort={{ columnId: "name", order: "asc" }} emptyMessage={`Không có ${lower} nào khớp bộ lọc hiện tại.`} />
    ) : (
      <DataTable columns={locationColumns} rows={rows as LocationRow[]} getRowKey={(r) => r.id} unit={lower} defaultSort={{ columnId: "name", order: "asc" }} emptyMessage={`Không có ${lower} nào khớp bộ lọc hiện tại.`} />
    );

  const dialogKind = editing?.kind ?? kind;
  const dialogLabel = singular[dialogKind].toLowerCase();

  return (
    <div className="space-y-3">
      <ListPanel
        toolbar={
          <ListToolbar
            tabs={
              <CountTabs
                value={kind}
                onChange={changeKind}
                tabs={[
                  { id: "brands", label: labels.brand, count: catalog.brands.length },
                  { id: "products", label: labels.product, count: catalog.products.length },
                  { id: "locations", label: labels.location, count: catalog.locations.length },
                ]}
              />
            }
            search={{ value: query, onChange: setQuery, placeholder: `Tìm ${lower}` }}
            filters={
              <>
                <FilterSelect value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />
                {kind === "products" && (
                  <FilterSelect
                    value={brandFilter}
                    onChange={setBrandFilter}
                    options={[
                      { value: "all", label: `Mọi ${labels.brand.toLowerCase()}` },
                      ...catalog.brands.map((b) => ({ value: b.id, label: b.name })),
                    ]}
                  />
                )}
              </>
            }
            actions={
              isAdmin && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={openCreate}
                  disabled={kind === "products" && activeBrands.length === 0}
                  title={kind === "products" && activeBrands.length === 0 ? `Cần ít nhất một ${labels.brand.toLowerCase()} đang bật` : undefined}
                >
                  <Plus className="size-3.5" />
                  Thêm {lower}
                </Button>
              )
            }
          />
        }
      >
        {table}
      </ListPanel>

      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={`${editing?.item ? "Sửa" : "Thêm"} ${dialogLabel}`}
        submitLabel={editing?.item ? "Lưu thay đổi" : "Thêm mới"}
        pending={pending}
        disabled={!form.name.trim() || (dialogKind === "products" && !form.brandId)}
        onSubmit={() => void submit()}
      >
        {dialogKind === "products" && (
          <FormField label={`Thuộc ${labels.brand.toLowerCase()}`} required>
            <Select value={form.brandId} onValueChange={(brandId) => setForm((f) => ({ ...f, brandId }))}>
              <SelectTrigger className="text-[13px]">
                <SelectValue placeholder={`Chọn ${labels.brand.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {catalog.brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField label={`Tên ${dialogLabel}`} required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </FormField>
        {dialogKind === "brands" && (
          <FormField label="Mã" hint="Tự sinh nếu để trống.">
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="font-mono text-[13px] uppercase"
            />
          </FormField>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Xác nhận xóa"
        description={
          <>
            Bạn có chắc muốn xóa <strong>«{deleting?.name}»</strong>?
          </>
        }
        note="Nếu đã có lead hoặc dữ liệu liên kết, hệ thống sẽ từ chối xóa để giữ lịch sử. Hãy chọn Tắt thay vì xóa."
        pending={pending}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

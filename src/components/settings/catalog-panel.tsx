"use client";

import * as React from "react";
import {
  Building2,
  Edit2,
  Filter,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BrandRow, CatalogSnapshot, LocationRow, ProductWithBrand } from "@/lib/db/catalog-repo";
import type { CatalogLabels } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CatalogPanelProps {
  catalog: CatalogSnapshot;
  labels: CatalogLabels;
  isAdmin: boolean;
  dbConfigured: boolean;
  projectId?: string;
}

export function CatalogPanel({
  catalog,
  labels,
  isAdmin,
  dbConfigured,
  projectId,
}: CatalogPanelProps) {
  const router = useRouter();
  const scope = React.useMemo(() => (projectId ? { projectId } : {}), [projectId]);

  const [activeTab, setActiveTab] = React.useState<"brands" | "products" | "locations">("brands");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "inactive">("all");
  const [selectedBrandFilter, setSelectedBrandFilter] = React.useState<string>("all");

  const [pending, setPending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Dialog State
  const [brandDialog, setBrandDialog] = React.useState<{
    open: boolean;
    mode: "create" | "edit";
    item?: BrandRow;
  }>({ open: false, mode: "create" });
  const [brandForm, setBrandForm] = React.useState({ name: "", code: "" });

  const [productDialog, setProductDialog] = React.useState<{
    open: boolean;
    mode: "create" | "edit";
    item?: ProductWithBrand;
  }>({ open: false, mode: "create" });
  const [productForm, setProductForm] = React.useState({ name: "", brandId: "" });

  const [locationDialog, setLocationDialog] = React.useState<{
    open: boolean;
    mode: "create" | "edit";
    item?: LocationRow;
  }>({ open: false, mode: "create" });
  const [locationForm, setLocationForm] = React.useState({ name: "" });

  const [deleteConfirm, setDeleteConfirm] = React.useState<{
    open: boolean;
    type: "brand" | "product" | "location";
    id: string;
    name: string;
  } | null>(null);

  const run = async (action: () => Promise<CatalogActionResult>) => {
    setPending(true);
    setActionError(null);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        setActionError(outcome.error);
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  };

  if (!dbConfigured) {
    return <p className="text-sm text-amber-800">Cần cấu hình DATABASE_URL để quản lý danh mục.</p>;
  }

  const activeBrands = catalog.brands.filter((b) => b.active);

  // Filter dữ liệu
  const filteredBrands = catalog.brands.filter((b) => {
    const matchQuery =
      !searchQuery ||
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && b.active) ||
      (statusFilter === "inactive" && !b.active);
    return matchQuery && matchStatus;
  });

  const filteredProducts = catalog.products.filter((p) => {
    const matchQuery =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brandName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && p.active) ||
      (statusFilter === "inactive" && !p.active);
    const matchBrand = selectedBrandFilter === "all" || p.brandId === selectedBrandFilter;
    return matchQuery && matchStatus && matchBrand;
  });

  const filteredLocations = catalog.locations.filter((l) => {
    const matchQuery =
      !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && l.active) ||
      (statusFilter === "inactive" && !l.active);
    return matchQuery && matchStatus;
  });

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as typeof activeTab);
          setSearchQuery("");
          setStatusFilter("all");
          setSelectedBrandFilter("all");
        }}
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-3">
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="brands" className="gap-2 text-[13px]">
              <Tag className="size-3.5" />
              <span>{labels.brand}</span>
              <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
                {catalog.brands.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2 text-[13px]">
              <Sparkles className="size-3.5" />
              <span>{labels.product}</span>
              <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
                {catalog.products.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="locations" className="gap-2 text-[13px]">
              <Building2 className="size-3.5" />
              <span>{labels.location}</span>
              <Badge variant="muted" className="ml-1 px-1.5 py-0 text-[10px]">
                {catalog.locations.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {isAdmin && (
            <div>
              {activeTab === "brands" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setBrandForm({ name: "", code: "" });
                    setBrandDialog({ open: true, mode: "create" });
                  }}
                  className="gap-1.5 shadow-xs"
                >
                  <Plus className="size-3.5" />
                  <span>Thêm {labels.brand.toLowerCase()}</span>
                </Button>
              )}
              {activeTab === "products" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setProductForm({ name: "", brandId: activeBrands[0]?.id ?? "" });
                    setProductDialog({ open: true, mode: "create" });
                  }}
                  disabled={activeBrands.length === 0}
                  className="gap-1.5 shadow-xs"
                >
                  <Plus className="size-3.5" />
                  <span>Thêm {labels.product.toLowerCase()}</span>
                </Button>
              )}
              {activeTab === "locations" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setLocationForm({ name: "" });
                    setLocationDialog({ open: true, mode: "create" });
                  }}
                  className="gap-1.5 shadow-xs"
                >
                  <Plus className="size-3.5" />
                  <span>Thêm {labels.location.toLowerCase()}</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Toolbar Lọc và Tìm kiếm */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] max-w-[280px] flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Tìm kiếm ${
                  activeTab === "brands"
                    ? labels.brand.toLowerCase()
                    : activeTab === "products"
                      ? labels.product.toLowerCase()
                      : labels.location.toLowerCase()
                }…`}
                className="h-8.5 pl-8 text-[12.5px]"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="h-8.5 w-[140px] text-[12px]">
                <Filter className="mr-1.5 size-3 text-muted-foreground" />
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="active">Đang bật</SelectItem>
                <SelectItem value="inactive">Đang tắt</SelectItem>
              </SelectContent>
            </Select>

            {activeTab === "products" && (
              <Select
                value={selectedBrandFilter}
                onValueChange={(v) => setSelectedBrandFilter(v)}
              >
                <SelectTrigger className="h-8.5 w-[170px] text-[12px]">
                  <Tag className="mr-1.5 size-3 text-muted-foreground" />
                  <SelectValue placeholder={`Lọc theo ${labels.brand}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả {labels.brand.toLowerCase()}</SelectItem>
                  {catalog.brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="text-[12px] text-muted-foreground">
            Hiển thị{" "}
            <strong>
              {activeTab === "brands"
                ? filteredBrands.length
                : activeTab === "products"
                  ? filteredProducts.length
                  : filteredLocations.length}
            </strong>{" "}
            mục
          </div>
        </div>

        {/* TAB 1: BRANDS */}
        <TabsContent value="brands" className="space-y-4 pt-1">
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-border/80 bg-slate-50/80 text-[11.5px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3 w-14">#</th>
                    <th className="px-3 py-2.5">Tên {labels.brand}</th>
                    <th className="px-3 py-2.5">Mã định danh (Code)</th>
                    <th className="px-3 py-2.5">Trạng thái</th>
                    {isAdmin && <th className="py-2.5 pl-3 pr-4 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredBrands.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-[12.5px]">
                        Không tìm thấy {labels.brand.toLowerCase()} nào.
                      </td>
                    </tr>
                  ) : (
                    filteredBrands.map((b, idx) => (
                      <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 pl-4 pr-3 text-muted-foreground text-[12px] font-mono">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">{b.name}</td>
                        <td className="px-3 py-3 font-mono text-[12px] text-slate-600">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold uppercase">
                            {b.code}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={b.active}
                              disabled={!isAdmin || pending}
                              onCheckedChange={(active) =>
                                run(() => setBrandActiveAction({ ...scope, id: b.id, active }))
                              }
                            />
                            <span
                              className={cn(
                                "text-[11.5px] font-medium",
                                b.active ? "text-emerald-700" : "text-muted-foreground",
                              )}
                            >
                              {b.active ? "Đang bật" : "Đang tắt"}
                            </span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="py-3 pl-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="iconSm"
                                title={`Sửa ${labels.brand}`}
                                onClick={() => {
                                  setBrandForm({ name: b.name, code: b.code });
                                  setBrandDialog({ open: true, mode: "edit", item: b });
                                }}
                              >
                                <Edit2 className="size-3.5 text-slate-600 hover:text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                title={`Xóa ${labels.brand}`}
                                onClick={() =>
                                  setDeleteConfirm({
                                    open: true,
                                    type: "brand",
                                    id: b.id,
                                    name: b.name,
                                  })
                                }
                              >
                                <Trash2 className="size-3.5 text-slate-400 hover:text-rose-600" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: PRODUCTS */}
        <TabsContent value="products" className="space-y-4 pt-1">
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-border/80 bg-slate-50/80 text-[11.5px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3 w-14">#</th>
                    <th className="px-3 py-2.5">Tên {labels.product}</th>
                    <th className="px-3 py-2.5">Thuộc {labels.brand}</th>
                    <th className="px-3 py-2.5">Trạng thái</th>
                    {isAdmin && <th className="py-2.5 pl-3 pr-4 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-[12.5px]">
                        Không tìm thấy {labels.product.toLowerCase()} nào.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 pl-4 pr-3 text-muted-foreground text-[12px] font-mono">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">{p.name}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 ring-1 ring-purple-200">
                            <Tag className="size-3" />
                            {p.brandName}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={p.active}
                              disabled={!isAdmin || pending}
                              onCheckedChange={(active) =>
                                run(() => setProductActiveAction({ ...scope, id: p.id, active }))
                              }
                            />
                            <span
                              className={cn(
                                "text-[11.5px] font-medium",
                                p.active ? "text-emerald-700" : "text-muted-foreground",
                              )}
                            >
                              {p.active ? "Đang bật" : "Đang tắt"}
                            </span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="py-3 pl-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="iconSm"
                                title={`Sửa ${labels.product}`}
                                onClick={() => {
                                  setProductForm({ name: p.name, brandId: p.brandId });
                                  setProductDialog({ open: true, mode: "edit", item: p });
                                }}
                              >
                                <Edit2 className="size-3.5 text-slate-600 hover:text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                title={`Xóa ${labels.product}`}
                                onClick={() =>
                                  setDeleteConfirm({
                                    open: true,
                                    type: "product",
                                    id: p.id,
                                    name: p.name,
                                  })
                                }
                              >
                                <Trash2 className="size-3.5 text-slate-400 hover:text-rose-600" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: LOCATIONS */}
        <TabsContent value="locations" className="space-y-4 pt-1">
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-border/80 bg-slate-50/80 text-[11.5px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3 w-14">#</th>
                    <th className="px-3 py-2.5">Tên {labels.location}</th>
                    <th className="px-3 py-2.5">Trạng thái</th>
                    {isAdmin && <th className="py-2.5 pl-3 pr-4 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredLocations.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground text-[12.5px]">
                        Không tìm thấy {labels.location.toLowerCase()} nào.
                      </td>
                    </tr>
                  ) : (
                    filteredLocations.map((l, idx) => (
                      <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 pl-4 pr-3 text-muted-foreground text-[12px] font-mono">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">{l.name}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={l.active}
                              disabled={!isAdmin || pending}
                              onCheckedChange={(active) =>
                                run(() => setLocationActiveAction({ ...scope, id: l.id, active }))
                              }
                            />
                            <span
                              className={cn(
                                "text-[11.5px] font-medium",
                                l.active ? "text-emerald-700" : "text-muted-foreground",
                              )}
                            >
                              {l.active ? "Đang bật" : "Đang tắt"}
                            </span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="py-3 pl-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="iconSm"
                                title={`Sửa ${labels.location}`}
                                onClick={() => {
                                  setLocationForm({ name: l.name });
                                  setLocationDialog({ open: true, mode: "edit", item: l });
                                }}
                              >
                                <Edit2 className="size-3.5 text-slate-600 hover:text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="iconSm"
                                title={`Xóa ${labels.location}`}
                                onClick={() =>
                                  setDeleteConfirm({
                                    open: true,
                                    type: "location",
                                    id: l.id,
                                    name: l.name,
                                  })
                                }
                              >
                                <Trash2 className="size-3.5 text-slate-400 hover:text-rose-600" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* DIALOG BRAND (THÊM / SỬA) */}
      <Dialog
        open={brandDialog.open}
        onOpenChange={(open) => setBrandDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {brandDialog.mode === "create"
                ? `Thêm ${labels.brand.toLowerCase()} mới`
                : `Chỉnh sửa ${labels.brand.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              {brandDialog.mode === "create"
                ? `Nhập tên và mã đại diện cho ${labels.brand.toLowerCase()} này.`
                : `Cập nhật thông tin ${labels.brand.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Tên {labels.brand} <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={brandForm.name}
                onChange={(e) => setBrandForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={`VD: Kia, Mazda, Vinhomes...`}
                className="text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">Mã định danh (Code)</Label>
              <Input
                value={brandForm.code}
                onChange={(e) => setBrandForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="VD: KIA, MZD, VHM (tự sinh nếu để trống)"
                className="font-mono text-[13px] uppercase"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBrandDialog((prev) => ({ ...prev, open: false }))}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={pending || !brandForm.name.trim()}
              onClick={async () => {
                let ok = false;
                if (brandDialog.mode === "create") {
                  ok = await run(() =>
                    createBrandAction({
                      ...scope,
                      name: brandForm.name,
                      code: brandForm.code,
                    }),
                  );
                } else if (brandDialog.item) {
                  ok = await run(() =>
                    updateBrandAction({
                      ...scope,
                      id: brandDialog.item!.id,
                      name: brandForm.name,
                      code: brandForm.code,
                    }),
                  );
                }
                if (ok) setBrandDialog((prev) => ({ ...prev, open: false }));
              }}
            >
              {brandDialog.mode === "create" ? "Thêm mới" : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG PRODUCT (THÊM / SỬA) */}
      <Dialog
        open={productDialog.open}
        onOpenChange={(open) => setProductDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {productDialog.mode === "create"
                ? `Thêm ${labels.product.toLowerCase()} mới`
                : `Chỉnh sửa ${labels.product.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              {productDialog.mode === "create"
                ? `Chọn ${labels.brand.toLowerCase()} và nhập tên ${labels.product.toLowerCase()}.`
                : `Cập nhật thông tin ${labels.product.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Thuộc {labels.brand} <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={productForm.brandId}
                onValueChange={(brandId) => setProductForm((f) => ({ ...f, brandId }))}
              >
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
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Tên {labels.product} <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={`VD: Seltos, Carnival, Căn 2PN...`}
                className="text-[13px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProductDialog((prev) => ({ ...prev, open: false }))}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={pending || !productForm.name.trim() || !productForm.brandId}
              onClick={async () => {
                let ok = false;
                if (productDialog.mode === "create") {
                  ok = await run(() =>
                    createProductAction({
                      ...scope,
                      brandId: productForm.brandId,
                      name: productForm.name,
                    }),
                  );
                } else if (productDialog.item) {
                  ok = await run(() =>
                    updateProductAction({
                      ...scope,
                      id: productDialog.item!.id,
                      name: productForm.name,
                      brandId: productForm.brandId,
                    }),
                  );
                }
                if (ok) setProductDialog((prev) => ({ ...prev, open: false }));
              }}
            >
              {productDialog.mode === "create" ? "Thêm mới" : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG LOCATION (THÊM / SỬA) */}
      <Dialog
        open={locationDialog.open}
        onOpenChange={(open) => setLocationDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {locationDialog.mode === "create"
                ? `Thêm ${labels.location.toLowerCase()} mới`
                : `Chỉnh sửa ${labels.location.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              Nhập tên {labels.location.toLowerCase()} (chi nhánh, cơ sở, đại lý).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Tên {labels.location} <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={locationForm.name}
                onChange={(e) => setLocationForm({ name: e.target.value })}
                placeholder={`VD: Showroom Hà Nam, Chi nhánh Cầu Giấy...`}
                className="text-[13px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocationDialog((prev) => ({ ...prev, open: false }))}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={pending || !locationForm.name.trim()}
              onClick={async () => {
                let ok = false;
                if (locationDialog.mode === "create") {
                  ok = await run(() =>
                    createLocationAction({
                      ...scope,
                      name: locationForm.name,
                    }),
                  );
                } else if (locationDialog.item) {
                  ok = await run(() =>
                    updateLocationAction({
                      ...scope,
                      id: locationDialog.item!.id,
                      name: locationForm.name,
                    }),
                  );
                }
                if (ok) setLocationDialog((prev) => ({ ...prev, open: false }));
              }}
            >
              {locationDialog.mode === "create" ? "Thêm mới" : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG CONFIRM DELETE */}
      <Dialog
        open={Boolean(deleteConfirm?.open)}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-rose-600">Xác nhận xóa</DialogTitle>
            <DialogDescription className="text-slate-600">
              Bạn có chắc chắn muốn xóa mục <strong>«{deleteConfirm?.name}»</strong> không?
            </DialogDescription>
          </DialogHeader>

          <p className="text-[12px] text-muted-foreground bg-slate-50 p-2.5 rounded-lg border border-border/80">
            ⚠️ Nếu đã có lead hoặc dữ liệu liên kết với mục này, hệ thống sẽ từ chối xóa để bảo vệ
            lịch sử. Bạn có thể chọn <strong>Tắt</strong> mục này thay vì xóa.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirm(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (!deleteConfirm) return;
                let ok = false;
                if (deleteConfirm.type === "brand") {
                  ok = await run(() => deleteBrandAction({ ...scope, id: deleteConfirm.id }));
                } else if (deleteConfirm.type === "product") {
                  ok = await run(() => deleteProductAction({ ...scope, id: deleteConfirm.id }));
                } else if (deleteConfirm.type === "location") {
                  ok = await run(() => deleteLocationAction({ ...scope, id: deleteConfirm.id }));
                }
                if (ok) setDeleteConfirm(null);
              }}
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

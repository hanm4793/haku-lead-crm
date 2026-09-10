"use client";

import { Columns3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

export interface ColumnToggle {
  id: string;
  header: string;
}

export function ColumnVisibilityPopover({
  columns,
  visible,
  onChange,
  defaults,
}: {
  columns: ColumnToggle[];
  visible: string[];
  onChange: (next: string[]) => void;
  defaults: string[];
}) {
  const toggle = (id: string) => {
    onChange(visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Columns3 className="size-3.5" />
          Cột hiển thị
          <span className="rounded bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground">
            {visible.length}/{columns.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Chọn cột hiển thị</div>
          <Button variant="ghost" size="xs" onClick={() => onChange(defaults)}>
            Mặc định
          </Button>
        </div>
        <div className="thin-scrollbar max-h-80 space-y-0.5 overflow-y-auto pr-1">
          {columns.map((column) => (
            <label
              key={column.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
            >
              <span className="truncate">{column.header}</span>
              <Switch checked={visible.includes(column.id)} onCheckedChange={() => toggle(column.id)} />
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2 border-t border-border pt-2">
          <Button variant="outline" size="xs" className="flex-1" onClick={() => onChange(columns.map((c) => c.id))}>
            Chọn tất cả
          </Button>
          <Button variant="outline" size="xs" className="flex-1" onClick={() => onChange(columns.slice(0, 3).map((c) => c.id))}>
            Tối giản
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

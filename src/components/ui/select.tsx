"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface MobileSelectContextValue {
  isMobile: true;
  value: string;
  onValueChange: (next: string) => void;
  open: boolean;
  setOpen: (next: boolean) => void;
  disabled: boolean;
  items: Map<string, React.ReactNode>;
}

const MobileSelectContext = React.createContext<MobileSelectContextValue | null>(null);

const SELECT_ITEM_MARKER = Symbol("SelectItem");

function collectSelectItems(
  children: React.ReactNode,
  map: Map<string, React.ReactNode>,
) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const type = child.type as { [SELECT_ITEM_MARKER]?: boolean } | string;
    const props = child.props as { value?: unknown; children?: React.ReactNode };
    if (typeof type === "function" && type[SELECT_ITEM_MARKER] && typeof props.value === "string") {
      map.set(props.value, props.children);
      return;
    }
    if (props && props.children) {
      collectSelectItems(props.children, map);
    }
  });
}

function Select({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  disabled = false,
  children,
  ...rest
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const isMobile = useIsMobile();
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "");
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);

  const currentValue = value !== undefined ? value : uncontrolledValue;
  const currentOpen = open !== undefined ? open : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  const handleValueChange = React.useCallback(
    (next: string) => {
      if (value === undefined) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [value, onValueChange],
  );

  const items = React.useMemo(() => {
    const map = new Map<string, React.ReactNode>();
    if (isMobile) {
      collectSelectItems(children, map);
    }
    return map;
  }, [isMobile, children]);

  const mobileCtx = React.useMemo<MobileSelectContextValue | null>(
    () =>
      isMobile
        ? {
            isMobile: true,
            value: currentValue,
            onValueChange: handleValueChange,
            open: currentOpen,
            setOpen: handleOpenChange,
            disabled: Boolean(disabled),
            items,
          }
        : null,
    [isMobile, currentValue, handleValueChange, currentOpen, handleOpenChange, disabled, items],
  );

  if (isMobile && mobileCtx) {
    return (
      <MobileSelectContext.Provider value={mobileCtx}>
        <Dialog open={currentOpen} onOpenChange={handleOpenChange}>
          {children}
        </Dialog>
      </MobileSelectContext.Provider>
    );
  }

  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      disabled={disabled}
      {...rest}
    >
      {children}
    </SelectPrimitive.Root>
  );
}

function SelectGroup({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  const ctx = React.useContext(MobileSelectContext);
  if (ctx?.isMobile) {
    return (
      <div role="group" className={cn("flex flex-col gap-0.5", className)}>
        {children}
      </div>
    );
  }
  return (
    <SelectPrimitive.Group className={className} {...props}>
      {children}
    </SelectPrimitive.Group>
  );
}

function SelectValue({
  placeholder,
  children,
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  const ctx = React.useContext(MobileSelectContext);
  if (ctx?.isMobile) {
    const hasSelected = Boolean(ctx.value !== "" && ctx.items.has(ctx.value));
    const display = children ?? (hasSelected ? ctx.items.get(ctx.value) : placeholder);
    return (
      <span
        className={cn(
          "pointer-events-none min-w-0 flex-1 truncate text-left",
          !hasSelected && !children && "text-muted-foreground",
          className,
        )}
      >
        {display}
      </span>
    );
  }
  return (
    <SelectPrimitive.Value placeholder={placeholder} className={className} {...props}>
      {children}
    </SelectPrimitive.Value>
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  disabled,
  onClick,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "default" | "sm" }) {
  const ctx = React.useContext(MobileSelectContext);
  const triggerClass = cn(
    "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs touch-manipulation outline-none transition-[color,border-color,box-shadow]",
    "data-[size=default]:h-9 data-[size=sm]:h-8 max-md:data-[size=default]:h-10 max-md:data-[size=sm]:h-9 data-[placeholder]:text-muted-foreground",
    "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
    "[&>span]:truncate [&>span]:text-left",
    className,
  );

  if (ctx?.isMobile) {
    const isDisabled = ctx.disabled || Boolean(disabled);
    const hasSelected = Boolean(ctx.value !== "" && ctx.items.has(ctx.value));
    return (
      <DialogTrigger asChild>
        <button
          type="button"
          data-size={size}
          data-placeholder={!hasSelected ? "" : undefined}
          disabled={isDisabled}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(e as never);
          }}
          className={triggerClass}
        >
          {children}
          <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
        </button>
      </DialogTrigger>
    );
  }

  return (
    <SelectPrimitive.Trigger
      data-size={size}
      disabled={disabled}
      onClick={onClick}
      className={triggerClass}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  collisionPadding = 10,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const ctx = React.useContext(MobileSelectContext);
  if (ctx?.isMobile) {
    return (
      <DialogContent
        showClose={false}
        className="gap-1 p-3 pt-1 max-md:!w-full max-md:!max-w-none"
      >
        <DialogTitle className="sr-only">Chọn giá trị</DialogTitle>
        <div className="px-1 pt-0.5 pb-1 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Chọn một mục
        </div>
        <div className="thin-scrollbar flex max-h-[68dvh] flex-col gap-1 overflow-y-auto overscroll-contain pb-1">
          {children}
        </div>
      </DialogContent>
    );
  }

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        collisionPadding={collisionPadding}
        className={cn(
          "relative z-50 max-h-80 min-w-[8rem] max-w-[calc(100vw-1.5rem)] overflow-hidden overscroll-contain rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center">
          <ChevronUpIcon className="size-4" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center">
          <ChevronDownIcon className="size-4" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  const ctx = React.useContext(MobileSelectContext);
  if (ctx?.isMobile) {
    return (
      <div className={cn("px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)}>
        {children}
      </div>
    );
  }
  return (
    <SelectPrimitive.Label
      className={cn("px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)}
      {...props}
    >
      {children}
    </SelectPrimitive.Label>
  );
}

type SelectItemComponent = React.FC<React.ComponentProps<typeof SelectPrimitive.Item>> & {
  [SELECT_ITEM_MARKER]?: boolean;
};

const SelectItem: SelectItemComponent = function SelectItem({
  className,
  children,
  value,
  disabled,
  ...props
}) {
  const ctx = React.useContext(MobileSelectContext);
  if (ctx?.isMobile) {
    const isSelected = ctx.value === value;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          ctx.onValueChange(value);
          ctx.setOpen(false);
        }}
        className={cn(
          "relative flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-[14px] transition-colors active:bg-accent",
          isSelected
            ? "bg-primary/10 font-semibold text-primary"
            : "text-slate-800 hover:bg-accent/60",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
      >
        <span className="min-w-0 flex-1 break-words">{children}</span>
        {isSelected && <CheckIcon className="size-4.5 shrink-0 text-primary" />}
      </button>
    );
  }

  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-sm outline-none",
        "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
};
SelectItem[SELECT_ITEM_MARKER] = true;

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  const ctx = React.useContext(MobileSelectContext);
  if (ctx?.isMobile) {
    return <div className={cn("my-1 h-px bg-border/80", className)} />;
  }
  return <SelectPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue };

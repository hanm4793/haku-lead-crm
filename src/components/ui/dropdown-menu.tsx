"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Slot } from "@radix-ui/react-slot";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface MobileDropdownContextValue {
  isMobile: true;
  close: () => void;
}

const MobileDropdownContext = React.createContext<MobileDropdownContextValue | null>(null);

function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...rest
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const isMobile = useIsMobile();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isOpen = open !== undefined ? open : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  const mobileCtx = React.useMemo<MobileDropdownContextValue | null>(
    () => (isMobile ? { isMobile: true, close: () => handleOpenChange(false) } : null),
    [isMobile, handleOpenChange],
  );

  if (isMobile && mobileCtx) {
    return (
      <MobileDropdownContext.Provider value={mobileCtx}>
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
          {children}
        </Dialog>
      </MobileDropdownContext.Provider>
    );
  }

  return (
    <DropdownMenuPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      {...rest}
    >
      {children}
    </DropdownMenuPrimitive.Root>
  );
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const ctx = React.useContext(MobileDropdownContext);
  if (ctx?.isMobile) {
    return <DialogTrigger {...props} />;
  }
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

function DropdownMenuGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  const ctx = React.useContext(MobileDropdownContext);
  if (ctx?.isMobile) {
    return (
      <div role="group" className={cn("flex flex-col gap-0.5", className)}>
        {children}
      </div>
    );
  }
  return (
    <DropdownMenuPrimitive.Group className={className} {...props}>
      {children}
    </DropdownMenuPrimitive.Group>
  );
}

const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger;

function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = 10,
  children,
  onClick,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const ctx = React.useContext(MobileDropdownContext);
  if (ctx?.isMobile) {
    return (
      <DialogContent
        showClose={false}
        onClick={onClick}
        className="gap-1 p-3 pt-1 max-md:!w-full max-md:!max-w-none"
      >
        <DialogTitle className="sr-only">Tùy chọn thao tác</DialogTitle>
        <div className="thin-scrollbar flex max-h-[72dvh] flex-col gap-1 overflow-y-auto overscroll-contain pb-1">
          {children}
        </div>
      </DialogContent>
    );
  }

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onClick={onClick}
        className={cn(
          "z-50 min-w-[10rem] max-w-[calc(100vw-1.25rem)] overflow-hidden overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  inset,
  asChild,
  disabled,
  onSelect,
  onClick,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }) {
  const ctx = React.useContext(MobileDropdownContext);
  if (ctx?.isMobile) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        {...(asChild ? {} : { type: "button", disabled })}
        data-disabled={disabled ? "" : undefined}
        onClick={(e: React.MouseEvent<HTMLElement>) => {
          e.stopPropagation();
          if (disabled) {
            e.preventDefault();
            return;
          }
          onClick?.(e as never);
          let prevented = e.defaultPrevented;
          if (onSelect) {
            const selectEvent = new Event("select", { bubbles: false, cancelable: true });
            onSelect(selectEvent);
            if (selectEvent.defaultPrevented) prevented = true;
          }
          if (!prevented) {
            ctx.close();
          }
        }}
        className={cn(
          "relative flex min-h-[46px] w-full cursor-pointer select-none items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[14px] font-medium text-slate-800 outline-none transition-colors hover:bg-accent active:bg-accent",
          disabled && "pointer-events-none opacity-50",
          inset && "pl-8",
          className,
        )}
      >
        {children}
      </Comp>
    );
  }

  return (
    <DropdownMenuPrimitive.Item
      asChild={asChild}
      disabled={disabled}
      onSelect={onSelect}
      onClick={onClick}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors",
        "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className,
      )}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  disabled,
  onCheckedChange,
  onSelect,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  const ctx = React.useContext(MobileDropdownContext);
  if (ctx?.isMobile) {
    const isChecked = checked === true;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          onCheckedChange?.(!isChecked);
          if (onSelect) {
            const selectEvent = new Event("select", { bubbles: false, cancelable: true });
            onSelect(selectEvent);
          }
        }}
        className={cn(
          "relative flex min-h-[46px] w-full cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-[14px] outline-none transition-colors active:bg-accent",
          isChecked ? "bg-primary/10 font-semibold text-primary" : "text-slate-800",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {isChecked && <CheckIcon className="size-4.5 shrink-0 text-primary" />}
      </button>
    );
  }

  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pl-8 pr-2.5 text-sm outline-none transition-colors",
        "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      onSelect={onSelect}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  const ctx = React.useContext(MobileDropdownContext);
  if (ctx?.isMobile) {
    return (
      <div
        className={cn(
          "px-2.5 pt-1 pb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground",
          inset && "pl-8",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", inset && "pl-8", className)}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Label>
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  const ctx = React.useContext(MobileDropdownContext);
  if (ctx?.isMobile) {
    return <div className={cn("my-1 h-px bg-border/80", className)} />;
  }
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        className={cn("z-50 min-w-[8rem] overflow-hidden overscroll-contain rounded-xl border border-border bg-popover p-1 shadow-lg", className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  ChevronRightIcon as DropdownMenuChevron,
};

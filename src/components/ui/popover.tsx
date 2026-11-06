"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface MobilePopoverContextValue {
  isMobile: boolean;
  close: () => void;
}

const MobilePopoverContext = React.createContext<MobilePopoverContextValue | null>(null);

export function usePopoverControls() {
  return React.useContext(MobilePopoverContext);
}

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...rest
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
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

  const ctxValue = React.useMemo<MobilePopoverContextValue>(
    () => ({ isMobile, close: () => handleOpenChange(false) }),
    [isMobile, handleOpenChange],
  );

  if (isMobile) {
    return (
      <MobilePopoverContext.Provider value={ctxValue}>
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
          {children}
        </Dialog>
      </MobilePopoverContext.Provider>
    );
  }

  return (
    <MobilePopoverContext.Provider value={ctxValue}>
      <PopoverPrimitive.Root
        open={isOpen}
        onOpenChange={handleOpenChange}
        {...rest}
      >
        {children}
      </PopoverPrimitive.Root>
    </MobilePopoverContext.Provider>
  );
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const ctx = React.useContext(MobilePopoverContext);
  if (ctx?.isMobile) {
    return <DialogTrigger {...props} />;
  }
  return <PopoverPrimitive.Trigger {...props} />;
}

function PopoverAnchor({ children, ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  const ctx = React.useContext(MobilePopoverContext);
  if (ctx?.isMobile) {
    return <>{children}</>;
  }
  return <PopoverPrimitive.Anchor {...props}>{children}</PopoverPrimitive.Anchor>;
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  collisionPadding = 12,
  children,
  onClick,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const ctx = React.useContext(MobilePopoverContext);
  if (ctx?.isMobile) {
    return (
      <DialogContent
        showClose={false}
        onClick={onClick}
        className={cn(
          "gap-2 p-4 pt-1 max-md:!w-full max-md:!min-w-0 max-md:!max-w-none",
          className,
        )}
      >
        <DialogTitle className="sr-only">Bảng tùy chọn</DialogTitle>
        <div className="w-full min-w-0">{children}</div>
      </DialogContent>
    );
  }

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onClick={onClick}
        className={cn(
          "z-50 w-72 max-w-[calc(100vw-1.5rem)] overscroll-contain rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

export interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  showClose?: boolean;
  /**
   * - `modal`: Hộp căn giữa trên Desktop, tự động chuyển thành Bottom Sheet trên Mobile (`< 768px`).
   * - `drawer-right`: Slide-over Drawer trượt từ cạnh phải trên Desktop/Tablet (`>= 768px`), Bottom Sheet trên Mobile.
   */
  variant?: "modal" | "drawer-right";
  /** Bật/tắt chế độ Bottom Sheet có thanh kéo vuốt đóng trên màn hình điện thoại (`< 768px`). Mặc định `true`. */
  mobileSheet?: boolean;
}

function DialogContent({
  className,
  children,
  showClose = true,
  variant = "modal",
  mobileSheet = true,
  ...props
}: DialogContentProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const dragState = React.useRef<{ startY: number; startTime: number; deltaY: number; active: boolean }>({
    startY: 0,
    startTime: 0,
    deltaY: 0,
    active: false,
  });

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch || !contentRef.current) return;
    dragState.current = {
      startY: touch.clientY,
      startTime: performance.now(),
      deltaY: 0,
      active: true,
    };
    contentRef.current.style.transition = "none";
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!dragState.current.active || !contentRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rawDelta = touch.clientY - dragState.current.startY;
    const clampedDelta = rawDelta > 0 ? rawDelta : rawDelta * 0.15;
    dragState.current.deltaY = clampedDelta;
    if (clampedDelta > 0) {
      contentRef.current.style.transform = `translate3d(0, ${clampedDelta}px, 0)`;
    }
  };

  const handleTouchEnd = () => {
    if (!dragState.current.active || !contentRef.current) return;
    const { deltaY, startTime } = dragState.current;
    dragState.current.active = false;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = deltaY / elapsed;

    const el = contentRef.current;
    el.style.transition = "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)";

    if (deltaY > 90 || (deltaY > 36 && velocity > 0.55)) {
      // Reset lại vị trí nếu hàm onOpenChange chặn đóng (ví dụ còn thay đổi chưa lưu)
      el.style.transform = "";
      closeBtnRef.current?.click();
      setTimeout(() => {
        if (contentRef.current) contentRef.current.style.transition = "";
      }, 220);
    } else {
      el.style.transform = "";
      setTimeout(() => {
        if (contentRef.current) contentRef.current.style.transition = "";
      }, 220);
    }
  };

  const isDrawerRight = variant === "drawer-right";
  const isFlush = isDrawerRight || /\bp-0\b/.test(className ?? "");

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        className={cn(
          "fixed z-50 border border-border bg-card shadow-2xl duration-200 outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          isDrawerRight
            ? [
                "flex flex-col gap-0 overflow-hidden p-0",
                "md:inset-y-0 md:right-0 md:left-auto md:top-0 md:h-dvh md:max-h-dvh md:w-[min(880px,calc(100vw-4.25rem))] md:max-w-none md:rounded-l-2xl md:rounded-r-none md:border-y-0 md:border-r-0",
                "md:data-[state=open]:slide-in-from-right md:data-[state=closed]:slide-out-to-right",
              ]
            : [
                "grid max-h-[90dvh] w-full max-w-lg gap-4 overflow-y-auto overscroll-contain p-6",
                "md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl",
                "md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95",
              ],
          mobileSheet
            ? [
                "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0",
                "max-md:max-h-[94dvh] max-md:overscroll-contain max-md:rounded-t-2xl max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0",
                !isFlush && "max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-md:pt-2",
                "max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom",
              ]
            : [
                "max-md:left-1/2 max-md:top-1/2 max-md:w-[calc(100vw-1.5rem)] max-md:-translate-x-1/2 max-md:-translate-y-1/2 max-md:rounded-xl",
              ],
          className,
        )}
        {...props}
      >
        {mobileSheet && (
          <div
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className="flex shrink-0 cursor-grab touch-none items-center justify-center pt-2 pb-1 md:hidden"
          >
            <span className="h-1.5 w-10 rounded-full bg-slate-300/90" />
          </div>
        )}

        {children}

        {/* Nút đóng ẩn hỗ trợ thao tác kéo thả đóng Bottom Sheet ngay cả khi showClose=false */}
        <DialogPrimitive.Close
          ref={closeBtnRef}
          tabIndex={showClose ? 0 : -1}
          aria-hidden={!showClose}
          className={cn(
            "absolute right-3.5 top-3.5 flex size-8 items-center justify-center rounded-full text-muted-foreground opacity-80 transition-colors hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none max-md:top-3 max-md:bg-slate-100/90",
            !showClose && "pointer-events-none sr-only opacity-0",
          )}
        >
          <XIcon className="size-4.5" />
          <span className="sr-only">Đóng</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end max-md:pb-[env(safe-area-inset-bottom,0px)]",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-snug", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};

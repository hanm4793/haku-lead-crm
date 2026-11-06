"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto sm:inline-flex",
        className,
      )}
      {...props}
    />
  );
}

/** Kiểu tab gạch chân — giống thanh điều hướng báo cáo của hệ thống hiện tại. */
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-[13px] font-medium text-muted-foreground touch-manipulation transition-colors sm:gap-2 sm:px-3 sm:text-sm",
        "hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("min-w-0 outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };

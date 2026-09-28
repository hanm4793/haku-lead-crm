"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { vi } from "date-fns/locale";

import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={vi}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col gap-3 sm:flex-row",
        month: "space-y-3",
        month_caption: "flex items-center justify-center pt-1 relative",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center gap-1",
        button_previous:
          "absolute left-1 top-0 inline-flex size-7 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        button_next:
          "absolute right-1 top-0 inline-flex size-7 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        weekdays: "flex",
        weekday: "w-9 text-[0.7rem] font-medium text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative p-0 text-center text-sm",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:bg-accent [&>button]:font-semibold [&>button]:text-accent-foreground",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground opacity-40",
        range_middle: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        range_start: "[&>button]:rounded-l-md",
        range_end: "[&>button]:rounded-r-md",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}

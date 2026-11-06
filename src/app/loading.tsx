export default function RootLoading() {
  return (
    <div className="space-y-3.5 p-3 sm:space-y-4 sm:p-4 animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2 max-md:hidden">
          <div className="h-6 w-48 rounded-md bg-slate-200/80" />
          <div className="h-3.5 w-72 rounded-md bg-slate-100" />
        </div>
        <div className="flex w-full items-center justify-between gap-2 md:w-auto">
          <div className="h-8 flex-1 rounded-md bg-slate-200/70 md:w-28 md:flex-initial" />
          <div className="h-8 w-24 rounded-md bg-slate-200/70 md:w-28" />
        </div>
      </div>

      <div className="no-scrollbar -mx-3 flex gap-2.5 overflow-hidden px-3 md:mx-0 md:grid md:grid-cols-4 md:gap-3 md:px-0 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-18 min-w-[132px] shrink-0 rounded-xl border border-border bg-card p-3 shadow-2xs md:h-20 md:min-w-0 md:p-3.5"
          >
            <div className="h-3 w-16 rounded bg-slate-200/70 sm:w-20" />
            <div className="mt-2.5 h-6 w-20 rounded bg-slate-200 sm:mt-3 sm:w-24" />
          </div>
        ))}
      </div>

      {/* Mobile card skeletons */}
      <div className="space-y-2.5 md:hidden">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="space-y-2.5 rounded-xl border border-border bg-card p-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-36 rounded bg-slate-200" />
              <div className="h-5 w-20 rounded-full bg-slate-100" />
            </div>
            <div className="h-3.5 w-28 rounded bg-slate-100" />
            <div className="flex items-center justify-between pt-1">
              <div className="h-7 w-24 rounded-md bg-slate-100" />
              <div className="flex gap-1.5">
                <div className="size-8 rounded-lg bg-slate-100" />
                <div className="size-8 rounded-lg bg-slate-100" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table skeleton */}
      <div className="hidden h-[460px] rounded-xl border border-border bg-card p-4 shadow-2xs md:block">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-8 w-56 rounded-md bg-slate-100" />
          <div className="h-8 w-40 rounded-md bg-slate-100" />
          <div className="h-8 w-40 rounded-md bg-slate-100" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-10 w-full rounded-md bg-slate-100/80" />
          ))}
        </div>
      </div>
    </div>
  );
}

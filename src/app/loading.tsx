export default function RootLoading() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-md bg-slate-200/80" />
          <div className="h-3.5 w-72 rounded-md bg-slate-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 rounded-md bg-slate-200/70" />
          <div className="h-8 w-28 rounded-md bg-slate-200/70" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-20 rounded-lg border border-border bg-card p-3.5 shadow-2xs"
          >
            <div className="h-3 w-20 rounded bg-slate-200/70" />
            <div className="mt-3 h-6 w-24 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="h-[460px] rounded-xl border border-border bg-card p-4 shadow-2xs">
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

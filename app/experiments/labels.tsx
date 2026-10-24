// Required on every screen that shows drafts or outcomes (PRD P0 #2, E2E #8).
export function DemoLabels() {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold">
      <span className="rounded-full bg-amber-900 px-3 py-1 text-amber-100">
        Hypothetical product — demonstration only
      </span>
      <span className="rounded-full bg-violet-900 px-3 py-1 text-violet-100">
        Simulated, pre-authored outcomes
      </span>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-cyan-900 text-cyan-100",
  closed: "bg-slate-700 text-slate-200",
  needs_human_approval: "bg-amber-900 text-amber-100",
  approved: "bg-emerald-900 text-emerald-100",
  rejected: "bg-red-900 text-red-100",
  error: "bg-red-900 text-red-100",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[status] ?? "bg-slate-700 text-slate-200"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

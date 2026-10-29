import Link from "next/link";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/page-access";
import { ControllerError } from "@/lib/controller/errors";
import { listExperiments, type ExperimentSummary } from "@/lib/controller/overview";
import { getDb } from "@/lib/db";
import { DemoLabels, StatusBadge } from "./labels";

export default function ExperimentsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Analytics &amp; Experiment Agent
          </p>
          <h1 className="text-4xl font-bold">Experiments</h1>
          <DemoLabels />
        </header>
        <Suspense fallback={<p className="text-slate-400">Loading experiments…</p>}>
          <ExperimentList />
        </Suspense>
      </div>
    </main>
  );
}

async function ExperimentList() {
  await requirePageAccess();

  let experiments: ExperimentSummary[];
  try {
    experiments = await listExperiments(getDb());
  } catch (error) {
    if (error instanceof ControllerError) {
      return <p role="alert" className="rounded-lg bg-red-950 p-4 text-red-200">{error.message}</p>;
    }
    throw error;
  }

  if (experiments.length === 0) {
    return (
      <p className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-300">
        No experiments yet. Cycle 1 starts when the controller creates exp_001
        with the Content Agent&apos;s approved drafts.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {experiments.map((experiment) => (
        <li key={experiment.id}>
          <Link
            href={`/experiments/${experiment.id}`}
            className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-5 hover:border-cyan-500"
          >
            <span>
              <span className="text-xl font-bold">{experiment.id}</span>
              <span className="ml-3 text-slate-400">Cycle {experiment.cycle}</span>
              {experiment.parent_experiment_id && (
                <span className="ml-3 text-slate-400">
                  from {experiment.parent_experiment_id}
                </span>
              )}
            </span>
            <StatusBadge status={experiment.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { requirePageAccess } from "@/lib/auth/page-access";
import { maxExperimentCycles, primaryKpiCalculable } from "@/lib/controller/cycle-rules";
import { ControllerError } from "@/lib/controller/errors";
import {
  loadExperimentOverview,
  type ExperimentOverview,
} from "@/lib/controller/overview";
import { getDb } from "@/lib/db";
import type { ProposalRecord } from "@/schemas/analytics";
import type { MetricRecord } from "@/schemas/metrics";
import { DemoLabels, StatusBadge } from "../labels";
import {
  GenerateContentPanel,
  DraftDecision,
  LoadMetricsPanel,
  ProposalDecision,
  RunAnalysisButton,
} from "./controls";

export default function ExperimentPage({
  params,
}: PageProps<"/experiments/[experimentId]">) {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-8">
        <Link href="/experiments" className="text-sm text-cyan-300 hover:underline">
          ← All experiments
        </Link>
        <Suspense fallback={<p className="text-slate-400">Loading experiment…</p>}>
          <ExperimentDetail params={params} />
        </Suspense>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function formatRate(metric: Extract<MetricRecord, { kind: "rate" }>): string {
  return metric.value === null
    ? `not calculable (${metric.not_calculable_reason})`
    : `${(metric.value * 100).toFixed(1)}% (${metric.numerator} / ${metric.denominator})`;
}

async function ExperimentDetail({
  params,
}: {
  params: Promise<{ experimentId: string }>;
}) {
  await requirePageAccess();
  const { experimentId } = await params;

  let overview: ExperimentOverview | null;
  try {
    overview = await loadExperimentOverview(getDb(), experimentId);
  } catch (error) {
    if (error instanceof ControllerError) {
      return <p role="alert" className="rounded-lg bg-red-950 p-4 text-red-200">{error.message}</p>;
    }
    throw error;
  }
  if (!overview) {
    notFound();
  }

  const { experiment, drafts, metrics, proposals, handoff } = overview;
  const isOpen = experiment.status === "open";
  const hasPending = proposals.some((p) => p.status === "needs_human_approval");
  const maxCycles = maxExperimentCycles();

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-bold">{experiment.id}</h1>
          <span className="text-slate-400">Cycle {experiment.cycle}</span>
          <StatusBadge status={experiment.status} />
        </div>
        <DemoLabels />
        {experiment.hypothesis && (
          <p className="text-slate-300">
            <span className="font-semibold">Hypothesis:</span> {experiment.hypothesis}
            {experiment.primary_test_variable && (
              <> · testing <code>{experiment.primary_test_variable}</code></>
            )}
          </p>
        )}
        <p className="flex flex-wrap gap-4 text-sm">
          {experiment.parent_experiment_id && (
            <Link href={`/experiments/${experiment.parent_experiment_id}`} className="text-cyan-300 hover:underline">
              ← Parent: {experiment.parent_experiment_id}
            </Link>
          )}
          {experiment.child_experiment_id && (
            <Link href={`/experiments/${experiment.child_experiment_id}`} className="text-cyan-300 hover:underline">
              Next cycle: {experiment.child_experiment_id} →
            </Link>
          )}
          <a href={`/api/experiments/${experiment.id}/trace`} className="text-cyan-300 hover:underline">
            Trace (JSON)
          </a>
        </p>
      </header>

      {handoff && (
        <Section title={`Approved findings from ${handoff.parent_experiment_id}`}>
          <p className="text-slate-300">
            This handoff (schema {handoff.schema_version}) tells the Content Agent
            what to test in this cycle.
          </p>
          <dl className="grid gap-2 text-slate-200">
            <div><dt className="inline font-semibold">Test variable: </dt><dd className="inline"><code>{handoff.primary_test_variable}</code></dd></div>
            <div><dt className="inline font-semibold">Hold constant: </dt><dd className="inline">{handoff.control_conditions.join(" ")}</dd></div>
            <div><dt className="inline font-semibold">Uncertainty: </dt><dd className="inline">{handoff.uncertainty}</dd></div>
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            {handoff.findings.map((finding) => (
              <li key={finding.statement}>{finding.statement}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Content drafts">
        {drafts.length === 0 ? (
          <p className="text-slate-400">
            No drafts yet. The Content Agent generates the control and variant
            drafts for this cycle.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {drafts.map((draft) => (
              <article key={draft.content_id} className="space-y-3 rounded-xl border border-slate-600 bg-slate-800 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold">{draft.content_id} · {draft.variant_role}</h3>
                  <StatusBadge status={draft.status} />
                </div>
                <p className="whitespace-pre-wrap text-slate-200">{draft.body}</p>
                {isOpen && <DraftDecision contentId={draft.content_id} status={draft.status} />}
              </article>
            ))}
          </div>
        )}
      </Section>

      {isOpen && drafts.length === 0 && !experiment.parent_experiment_id && (
        <Section title="Generate Content"><GenerateContentPanel experimentId={experiment.id} /></Section>
      )}
      <Section title="Simulated metrics">
        <MetricsTable metrics={metrics} />
        {isOpen && (
          <LoadMetricsPanel
            experimentId={experiment.id}
            loadedDatasetId={metrics[0]?.dataset_id ?? null}
          />
        )}
      </Section>

      <Section title="Analysis and proposals">
        {proposals.length === 0 && (
          <p className="text-slate-400">No analysis has run for this experiment yet.</p>
        )}
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.proposal_id}
            proposal={proposal}
            primaryCalculable={primaryKpiCalculable(metrics)}
            lastCycle={
              experiment.cycle >= maxCycles ? { cycle: experiment.cycle, max: maxCycles } : null
            }
          />
        ))}
        {isOpen && metrics.length > 0 && !hasPending && (
          <RunAnalysisButton experimentId={experiment.id} />
        )}
      </Section>
    </div>
  );
}

function MetricsTable({ metrics }: { metrics: MetricRecord[] }) {
  if (metrics.length === 0) {
    return <p className="text-slate-400">No metrics loaded.</p>;
  }

  const roles = [...new Set(metrics.map((m) => m.variant_role))];
  const rate = (role: string, name: string) =>
    metrics.find(
      (m): m is Extract<MetricRecord, { kind: "rate" }> =>
        m.kind === "rate" && m.variant_role === role && m.metric === name
    );
  const count = (role: string, name: string) =>
    metrics.find((m) => m.kind === "count" && m.variant_role === role && m.metric === name)?.value;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400">
          <tr>
            <th className="py-2 pr-4">Variant</th>
            <th className="py-2 pr-4">Primary: qualified demos / visit</th>
            <th className="py-2 pr-4">Secondary: qualified demos / click</th>
            <th className="py-2 pr-4">Impressions</th>
            <th className="py-2 pr-4">Clicks</th>
            <th className="py-2 pr-4">Visits</th>
            <th className="py-2 pr-4">Demos</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const primary = rate(role, "qualified_demo_rate_per_visit");
            const secondary = rate(role, "qualified_demo_rate_per_click");
            return (
              <tr key={role} className="border-t border-slate-700">
                <td className="py-2 pr-4 font-semibold">{role}</td>
                <td className="py-2 pr-4">{primary ? formatRate(primary) : "—"}</td>
                <td className="py-2 pr-4">{secondary ? formatRate(secondary) : "—"}</td>
                <td className="py-2 pr-4">{count(role, "impressions") ?? "—"}</td>
                <td className="py-2 pr-4">{count(role, "link_clicks") ?? "—"}</td>
                <td className="py-2 pr-4">{count(role, "landing_page_visits") ?? "—"}</td>
                <td className="py-2 pr-4">{count(role, "demo_requests") ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const OUTCOME_LABELS = {
  control_better: "control did better",
  variant_better: "variant did better",
  inconclusive: "inconclusive",
} as const;

function ProposalCard({
  proposal,
  primaryCalculable,
  lastCycle,
}: {
  proposal: ProposalRecord;
  primaryCalculable: boolean;
  lastCycle: { cycle: number; max: number } | null;
}) {
  const { analysis } = proposal;

  return (
    <article className="space-y-4 rounded-xl border border-slate-600 bg-slate-800 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{proposal.proposal_id}</h3>
        <StatusBadge status={proposal.status} />
      </div>

      {proposal.errors.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 rounded-lg bg-red-950 p-3 pl-8 text-red-200">
          {proposal.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
      {proposal.review_flags.length > 0 && (
        <div className="rounded-lg bg-amber-950 p-3 text-amber-100">
          <p className="font-semibold">Check before approving:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {proposal.review_flags.map((flag) => <li key={flag}>{flag}</li>)}
          </ul>
        </div>
      )}

      <p className="text-slate-200">{analysis.summary}</p>
      <div>
        <h4 className="font-semibold">Findings</h4>
        <ul className="mt-1 space-y-2">
          {analysis.findings.map((finding) => (
            <li key={finding.statement} className="text-slate-200">
              {finding.statement}
              <span className="block text-xs text-slate-400">
                Cites {finding.metric_ids.join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-slate-300"><span className="font-semibold">Uncertainty:</span> {analysis.uncertainty}</p>

      <div className="space-y-1 rounded-lg bg-slate-900 p-4 text-slate-200">
        <h4 className="font-semibold">Proposed next experiment</h4>
        <p>{analysis.proposal.hypothesis}</p>
        <p>Change only <code>{analysis.proposal.primary_test_variable}</code>.</p>
        <p>Hold constant: {analysis.proposal.control_conditions.join(" ")}</p>
        <p>Stop rule: {analysis.proposal.stop_rule}</p>
        <div>
          <p>Agent&apos;s suggested baseline: <code>{analysis.proposal.content_change.baseline_content_id}</code> (your outcome below decides)</p>
          <p className="whitespace-pre-wrap">Proposed replacement: {analysis.proposal.content_change.variant_value}</p>
        </div>
      </div>

      {proposal.decided_at && (
        <p className="text-sm text-slate-400">
          {proposal.status} by {proposal.decided_by_role?.replaceAll("_", " ")} at{" "}
          {new Date(proposal.decided_at).toISOString()}
          {proposal.outcome && `; outcome: ${OUTCOME_LABELS[proposal.outcome]}`}
        </p>
      )}
      {proposal.status === "needs_human_approval" && (
        <ProposalDecision
          proposalId={proposal.proposal_id}
          primaryCalculable={primaryCalculable}
          lastCycle={lastCycle}
        />
      )}
    </article>
  );
}

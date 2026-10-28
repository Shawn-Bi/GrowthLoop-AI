"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type QuarantinedRow = { index: number; reasons: string[] };

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">
      {message}
    </p>
  ) : null;
}

export function LoadMetricsPanel({
  experimentId,
  loadedDatasetId,
}: {
  experimentId: string;
  loadedDatasetId: string | null;
}) {
  const router = useRouter();
  const [datasetId, setDatasetId] = useState("demo_fixture_v1");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    saved: number;
    quarantined: QuarantinedRow[];
    ignored_rows: number;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const response = await postJson(`/api/experiments/${experimentId}/metrics`, {
      dataset_id: datasetId,
    });
    setPending(false);

    if (!response.ok) {
      setError(response.data.error ?? `Request failed (${response.status}).`);
      return;
    }
    setResult(response.data);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {loadedDatasetId ? (
        <p className="text-slate-300">
          Loaded from simulated dataset <code>{loadedDatasetId}</code>.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Simulated dataset (data/fixtures)</span>
            <input
              value={datasetId}
              onChange={(event) => setDatasetId(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
          >
            {pending ? "Loading…" : "Load metrics"}
          </button>
        </form>
      )}
      <ErrorMessage message={error} />
      {result && (
        <div className="rounded-lg bg-slate-800 p-4 text-sm text-slate-200">
          <p>
            Saved {result.saved} metric records.
            {result.ignored_rows > 0 &&
              ` Ignored ${result.ignored_rows} rows for other experiments.`}
          </p>
          {result.quarantined.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-200">
              {result.quarantined.map((row) => (
                <li key={row.index}>
                  Row {row.index} quarantined: {row.reasons.join("; ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function RunAnalysisButton({ experimentId }: { experimentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setPending(true);
    setError("");
    const response = await postJson(`/api/experiments/${experimentId}/analysis`);
    setPending(false);

    if (!response.ok) {
      setError(response.data.error ?? `Request failed (${response.status}).`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
      >
        {pending ? "Analysing… this can take a minute" : "Run Analytics Agent"}
      </button>
      <ErrorMessage message={error} />
    </div>
  );
}

export function ProposalDecision({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState("");

  async function decide(decision: "approved" | "rejected") {
    setPending(decision);
    setError("");
    const response = await postJson(`/api/proposals/${proposalId}/decision`, {
      decision,
      reviewer_role: "experiment_approver",
    });
    setPending(null);

    if (!response.ok) {
      setError(response.data.error ?? `Request failed (${response.status}).`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Deciding as the experiment approver (a demo role, not a verified identity).
        Approving creates the next experiment and hands these findings to the
        Content Agent.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => decide("approved")}
          disabled={pending !== null}
          className="rounded-lg bg-emerald-500 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {pending === "approved" ? "Approving…" : "Approve proposal"}
        </button>
        <button
          type="button"
          onClick={() => decide("rejected")}
          disabled={pending !== null}
          className="rounded-lg border border-red-400 px-5 py-3 font-bold text-red-200 hover:bg-red-950 disabled:opacity-40"
        >
          {pending === "rejected" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      <ErrorMessage message={error} />
    </div>
  );
}

export function GenerateContentPanel({ experimentId }: { experimentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await postJson(`/api/experiments/${experimentId}/drafts`, {
        brief: { audience: form.get("audience"), campaignGoal: form.get("goal"), keyMessage: form.get("message") },
        approved_claim_ids: String(form.get("claims")).split(",").map((id) => id.trim()).filter(Boolean),
      });
      if (!response.ok) setError(response.data.error ?? "Generation failed.");
      else router.refresh();
    } catch { setError("Generation request failed. Refresh before retrying."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="grid gap-3">
    <p>Generate two hypothetical drafts using reviewed registry claims. Both require human approval.</p>
    {[["audience", "Audience"], ["goal", "Campaign goal"], ["message", "Approved key message"], ["claims", "Approved claim IDs (comma-separated)"]].map(([name, label]) =>
      <label key={name} className="grid gap-1">{label}<input required name={name} className="rounded bg-slate-800 p-2" /></label>)}
    <button disabled={pending} className="rounded bg-cyan-500 p-2 text-slate-950">{pending ? "Generating…" : "Generate A/B drafts"}</button>
    <ErrorMessage message={error} />
  </form>;
}

export function DraftDecision({ contentId, status }: { contentId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function decide(action: string) {
    setPending(true); setError("");
    try {
      const response = await postJson(`/api/drafts/${contentId}/decision`, { action, reviewer_role: "content_reviewer" });
      if (!response.ok) setError(response.data.error ?? "Decision failed.");
      else router.refresh();
    } catch { setError("Decision request failed. Refresh to check its status."); }
    finally { setPending(false); }
  }
  const actions = status === "approved" ? ["mark_ready"] : ["pending_approval", "needs_review"].includes(status) ? ["approve", "reject"] : [];
  return <div className="space-y-2"><p className="text-sm text-slate-400">Recorded role: content reviewer (not a verified identity).</p>
    {actions.map((action) => <button key={action} disabled={pending} onClick={() => decide(action)} className="mr-3 rounded border border-cyan-400 px-3 py-2">{action === "mark_ready" ? "Ready for manual publication" : action}</button>)}
    <ErrorMessage message={error} />
  </div>;
}

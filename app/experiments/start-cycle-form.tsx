"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function StartCycleForm({ testVariables }: { testVariables: string[] }) {
  const router = useRouter();
  const [hypothesis, setHypothesis] = useState("");
  const [testVariable, setTestVariable] = useState(testVariables[0] ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const response = await fetch("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothesis, primary_test_variable: testVariable }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setError(body.error ?? `Request failed (${response.status}).`);
      return;
    }
    router.push(`/experiments/${body.experiment_id}`);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
    >
      <h2 className="text-2xl font-semibold">Start Cycle 1</h2>
      <p className="text-sm text-slate-400">
        Creates exp_001. The Content Agent then drafts the control and variant
        posts for review.
      </p>
      <label className="grid gap-2">
        <span className="text-sm text-slate-300">Hypothesis</span>
        <textarea
          value={hypothesis}
          onChange={(event) => setHypothesis(event.target.value)}
          required
          maxLength={500}
          className="min-h-24 rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
        />
      </label>
      <label className="grid gap-2">
        <span className="text-sm text-slate-300">Variable to test (one Content DNA dimension)</span>
        <select
          value={testVariable}
          onChange={(event) => setTestVariable(event.target.value)}
          className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
        >
          {testVariables.map((variable) => (
            <option key={variable} value={variable}>
              {variable}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending || hypothesis.trim().length === 0}
        className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
      >
        {pending ? "Creating…" : "Create exp_001"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">
          {error}
        </p>
      )}
    </form>
  );
}

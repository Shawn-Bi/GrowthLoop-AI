
"use client";

import { useState } from "react";
import {
  startRevisionLoop,
  revisePosts,
  type RevisionLoop
} from "../lib/content-agent/revision-loop";
import { approvePost } from "../lib/content-agent/approve-posts";
import type { CampaignBrief } from "../lib/content-agent/validate-brief";

const initialBrief: CampaignBrief = {
  audience: "NYC nonprofit leaders",
  campaignGoal: "Increase LinkedIn engagement",
  keyMessage: "Better housing outcomes start with collaboration",
  approvedClaims: [
    "Our program supports housing access"
  ]
};

export default function GrowthLoopDashboard() {
  const [brief, setBrief] = useState(initialBrief);
  const [loop, setLoop] = useState<RevisionLoop | null>(null);
  const [feedback, setFeedback] = useState("");
  const [approvedPost, setApprovedPost] = useState<string | null>(null);
  const [error, setError] = useState("");

  const currentPosts = loop?.history.at(-1)?.posts ?? [];

  function generate() {
    try {
      setLoop(startRevisionLoop(brief));
      setApprovedPost(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    }
  }

  function revise() {
    if (!loop || approvedPost) return;

    try {
      setLoop(revisePosts(loop, brief, feedback));
      setFeedback("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revision failed");
    }
  }

  function approve(id: "A" | "B") {
    if (!loop) return;

    try {
      const result = approvePost(currentPosts, id, true);
      setApprovedPost(result.id);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Pursuit L2 · Marketing Experiment Agent
          </p>
          <h1 className="mt-3 text-4xl font-bold">GrowthLoop AI</h1>
          <p className="mt-3 text-slate-300">
            Generate, review, revise, and approve LinkedIn campaign posts.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Campaign Brief</h2>

          <div className="grid gap-4">
            {([
              ["audience", "Target audience"],
              ["campaignGoal", "Campaign goal"],
              ["keyMessage", "Key message"]
            ] as const).map(([field, label]) => (
              <label key={field} className="grid gap-2">
                <span className="text-sm text-slate-300">{label}</span>
                <input
                  className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
                  value={brief[field]}
                  onChange={(event) =>
                    setBrief({ ...brief, [field]: event.target.value })
                  }
                  disabled={loop !== null}
                />
              </label>
            ))}

            <label className="grid gap-2">
              <span className="text-sm text-slate-300">Approved claim</span>
              <input
                className="rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
                value={brief.approvedClaims[0] ?? ""}
                onChange={(event) =>
                  setBrief({
                    ...brief,
                    approvedClaims: [event.target.value]
                  })
                }
                disabled={loop !== null}
              />
            </label>
          </div>

          <button
            onClick={generate}
            className="mt-5 rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400"
          >
            {loop ? "Start New Campaign" : "Generate A/B Posts"}
          </button>
        </section>

        {loop && (
          <>
            <section className="rounded-2xl border border-cyan-700 bg-slate-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Content Agent Loop</h2>
                <span className="rounded-full bg-cyan-900 px-4 py-2 font-bold text-cyan-200">
                  Cycle {loop.currentCycle} of 3
                </span>
              </div>

              <p className="mt-3 text-slate-300">
                Status: {approvedPost
                  ? `Post ${approvedPost} approved by human reviewer`
                  : "Awaiting human review"}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {currentPosts.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-xl border border-slate-600 bg-slate-800 p-5"
                  >
                    <h3 className="text-xl font-bold">Variation {post.id}</h3>
                    <p className="mt-4 whitespace-pre-wrap text-slate-200">
                      {post.content}
                    </p>
                    <button
                      onClick={() => approve(post.id)}
                      disabled={approvedPost !== null}
                      className="mt-5 rounded-lg bg-emerald-500 px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
                    >
                      Approve Variation {post.id}
                    </button>
                  </article>
                ))}
              </div>

              {!approvedPost && (
                <div className="mt-6">
                  <label className="grid gap-2">
                    <span className="font-semibold">Human revision feedback</span>
                    <textarea
                      className="min-h-28 rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
                      placeholder="Explain what should change..."
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                    />
                  </label>
                  <button
                    onClick={revise}
                    className="mt-3 rounded-lg border border-cyan-400 px-5 py-3 font-bold text-cyan-300 hover:bg-slate-800"
                  >
                    Request Revision ↻
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-2xl font-semibold">Loop History</h2>
              <ol className="mt-4 space-y-3">
                {loop.history.map((entry) => (
                  <li
                    key={entry.cycle}
                    className="rounded-lg bg-slate-800 p-4"
                  >
                    <strong>Cycle {entry.cycle}</strong>
                    <p className="mt-1 text-slate-300">
                      {entry.feedback}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-950 p-4 text-red-200">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}


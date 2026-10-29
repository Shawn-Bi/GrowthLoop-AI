
"use client";

import { useState } from "react";
import "./content-studio.css";
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

  const activeStage = !loop ? 0 : approvedPost ? 4 : feedback.trim() && loop.currentCycle < 3 ? 3 : 2;
  const workflow = [
    { title: "Campaign Brief", detail: "Set your direction", icon: "brief" },
    { title: "Generate A/B Drafts", detail: "Two distinct perspectives", icon: "spark" },
    { title: "Human Review", detail: "Your judgment matters", icon: "review" },
    { title: "Revision", detail: "Refine with intention", icon: "revision" },
    { title: "Approval", detail: "A human decision", icon: "check" },
  ] as const;

  return (
    <main className="studio">
      <div className="studio-shell">
        <header className="studio-header">
          <div className="studio-brand"><LoopMark /><span>GrowthLoop <b>AI</b></span></div>
          <span className="studio-kicker"><span className="studio-dot" /> Pursuit L2 · Content Agent</span>
        </header>

        <section className="studio-intro">
          <div><p className="studio-eyebrow">CREATE WITH INTENTION. REFINE TOGETHER.</p>
            <h1><span className="studio-sr-only">GrowthLoop AI | </span>Content <em>Studio</em><span className="studio-title-dot">.</span></h1>
            <p className="studio-subtitle">Human-guided content creation, revision, and approval.</p>
          </div>
          <div className="studio-intro-note"><LoopMark /><p>Good content is a conversation.<br /><strong>You keep it moving.</strong></p></div>
        </section>

        <section className={`studio-workflow ${approvedPost || loop?.currentCycle === 3 ? "studio-loop-stopped" : ""}`} aria-labelledby="workflow-title">
          <div className="studio-section-head"><div><p className="studio-eyebrow">THE PROCESS</p><h2 id="workflow-title">Human-in-the-Loop Content Workflow</h2></div>
            <span className="studio-cycle">{loop ? `Cycle ${loop.currentCycle} of 3` : "Ready for cycle 1 of 3"}</span>
          </div>
          <div className="studio-workflow-graphic">
            <ol className="studio-stages">
              {workflow.map((stage, index) => {
                const completed = Boolean(loop) && (index < 2 || (Boolean(approvedPost) && index === 2));
                return <li key={stage.title} aria-current={activeStage === index ? "step" : undefined} className={`${activeStage === index ? "is-active" : ""} ${completed ? "is-complete" : ""}`}>
                  <span className="studio-stage-number">0{index + 1}</span><span className="studio-stage-icon"><StudioIcon name={stage.icon} /></span>
                  <div><h3>{stage.title}</h3><p>{stage.detail}</p></div><span className="studio-stage-arrow" aria-hidden="true">→</span>
                </li>;
              })}
            </ol>
            <div className="studio-return" aria-hidden="true">
              <svg viewBox="0 0 1000 95" preserveAspectRatio="none"><defs><marker id="studio-return-head" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs><path className="studio-return-track" d="M700 1 V24 Q700 67 650 67 H350 Q300 67 300 24 V5" markerEnd="url(#studio-return-head)" /></svg>
              <span><StudioIcon name="revision" /> Improve with Feedback</span>
            </div>
          </div>
          <div className="studio-workflow-footer" role="status"><span className="studio-status-dot" /><p>{approvedPost ? `Variation ${approvedPost} approved. The revision loop is complete.` : !loop ? "Start with a brief. Your first drafts begin the conversation." : loop.currentCycle === 3 ? "Revision limit reached. Review and approve a draft, or start a new campaign." : feedback.trim() ? "Your feedback guides the next revision. Submit it when you’re ready." : "Your drafts are ready for human review. Refine them or approve one."}</p><span>Approval ends this loop · No automatic publishing</span></div>
        </section>

        <section className="studio-brief" aria-labelledby="brief-title">
          <div className="studio-brief-intro"><span className="studio-section-icon"><StudioIcon name="brief" /></span><p className="studio-eyebrow">01 / THE FOUNDATION</p><h2 id="brief-title">A clear brief.<br />A stronger starting point.</h2><p>Give your drafts a purpose, an audience, and a message worth sharing.</p><span className="studio-small-note"><StudioIcon name="lock" /> Approved claims stay in your drafts.</span></div>
          <div className="studio-brief-form">
            <div className="studio-field-grid">{([
              ["audience", "Target audience"], ["campaignGoal", "Campaign goal"], ["keyMessage", "Key message"]
            ] as const).map(([field, label]) => <label key={field} className={field === "keyMessage" ? "studio-field-wide" : ""}><span>{label}</span><input value={brief[field]} onChange={(event) => setBrief({ ...brief, [field]: event.target.value })} disabled={loop !== null} /></label>)}
              <label className="studio-field-wide"><span>Approved claim <small>Preserved in both variations</small></span><input value={brief.approvedClaims[0] ?? ""} onChange={(event) => setBrief({ ...brief, approvedClaims: [event.target.value] })} disabled={loop !== null} /></label>
            </div>
            <div className="studio-form-footer"><span>{loop ? "Brief locked for this revision loop" : "Two drafts. One human-led process."}</span><button className="studio-button studio-button-primary" onClick={generate}><StudioIcon name="spark" />{loop ? "Start New Campaign" : "Generate A/B Posts"}<span aria-hidden="true">↗</span></button></div>
          </div>
        </section>

        {loop ? <>
          <section className="studio-drafts" aria-labelledby="drafts-title">
            <div className="studio-section-head"><div><p className="studio-eyebrow">02 / EXPLORE THE POSSIBILITIES</p><h2 id="drafts-title">One message. Two perspectives.</h2><p className="studio-section-description">LinkedIn-style previews · Drafts only, never automatically published.</p></div><span className="studio-cycle">Cycle {loop.currentCycle} of 3</span></div>
            <div className="studio-preview-grid">{currentPosts.map((post) => <article key={post.id} className={`studio-preview ${post.id === "A" ? "studio-preview-a" : "studio-preview-b"} ${approvedPost === post.id ? "is-approved" : ""}`}>
              <div className="studio-preview-label"><span className="studio-variation-letter">{post.id}</span><div><p>VARIATION {post.id}</p><h3>{post.id === "A" ? "Human-Centered" : "Action-Oriented"}</h3></div><StudioIcon name={post.id === "A" ? "people" : "spark"} /></div>
              <div className="studio-post">
                <div className="studio-post-author"><span className="studio-avatar"><LoopMark /></span><div><strong>GrowthLoop AI</strong><span>Campaign content · Draft preview</span><span>Not published <span aria-hidden="true">· ◉</span></span></div><span className="studio-linkedin-mark" aria-hidden="true">in</span></div>
                <p className="studio-post-copy">{post.content}</p>
                <div className="studio-social" aria-hidden="true"><span><StudioIcon name="like" /> Like</span><span><StudioIcon name="comment" /> Comment</span><span><StudioIcon name="revision" /> Repost</span><span><StudioIcon name="send" /> Send</span></div>
              </div>
              <div className="studio-preview-action"><span className={`studio-draft-status ${approvedPost === post.id ? "is-approved" : ""}`}><StudioIcon name={approvedPost === post.id ? "check" : "review"} />{approvedPost === post.id ? "Human approved" : "Pending approval"}</span><button onClick={() => approve(post.id)} disabled={approvedPost !== null} className="studio-button studio-approve"><StudioIcon name="check" />{approvedPost === post.id ? `Variation ${post.id} approved` : `Approve Variation ${post.id}`}</button></div>
            </article>)}</div>
          </section>

          {!approvedPost && <section className="studio-feedback" aria-labelledby="feedback-title"><div><span className="studio-section-icon"><StudioIcon name="revision" /></span><p className="studio-eyebrow">03 / YOUR DIRECTION</p><h2 id="feedback-title">Make it more <em>you.</em></h2><p>Your feedback refines the drafts.<br />Approval closes the revision loop.</p></div><div><label htmlFor="studio-feedback-input">Human revision feedback</label><textarea id="studio-feedback-input" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Try “Make it shorter” or “Ask the audience a question”…" /><div className="studio-form-footer"><span>{loop.currentCycle < 3 ? `${3 - loop.currentCycle} revision${3 - loop.currentCycle === 1 ? "" : "s"} remaining` : "Revision limit reached · Human review required"}</span><button className="studio-button studio-button-outline" onClick={revise}><StudioIcon name="revision" />Request Revision</button></div></div></section>}

          <section className="studio-history" aria-labelledby="history-title"><div className="studio-section-head"><div><p className="studio-eyebrow">THE EVOLUTION</p><h2 id="history-title">Every refinement has a story.</h2></div><span className="studio-history-count">{loop.history.length} actual cycle{loop.history.length === 1 ? "" : "s"}</span></div><ol className="studio-timeline">{loop.history.map((entry) => <li key={entry.cycle} className={entry.cycle === loop.currentCycle ? "is-current" : ""}><span className="studio-timeline-node">{entry.cycle}</span><div><div className="studio-timeline-heading"><h3>{entry.cycle === 1 ? "The first perspective" : "Refined with your feedback"}</h3><span>Cycle {entry.cycle}{entry.cycle === loop.currentCycle ? " · Current" : ""}</span></div><p>{entry.feedback}</p><span className="studio-timeline-caption">Two draft variations {entry.cycle === 1 ? "generated" : "revised"}{entry.cycle === loop.currentCycle && approvedPost ? ` · Variation ${approvedPost} approved` : ""}</span></div></li>)}</ol>{approvedPost && <p className="studio-history-approved"><StudioIcon name="check" />Human approval received. No further revision cycle was started.</p>}</section>
        </> : <section className="studio-empty"><span className="studio-empty-orbit"><StudioIcon name="spark" /></span><h2>Your next great draft starts here.</h2><p>Generate your first A/B posts to bring the review and revision loop to life.</p></section>}
        {error && <p role="alert" className="studio-error"><StudioIcon name="review" />{error}</p>}
        <footer className="studio-footer"><span><LoopMark />GrowthLoop AI <span aria-hidden="true">/</span> Content Studio</span><p>Created with AI. Guided by people.</p></footer>
      </div>
    </main>
  );
}

function LoopMark() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 10C9-1-1 22 13 28c8 4 14-9 22-7 15 3 8 28-7 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /><path d="M24 38C9 49-1 26 13 20c8-4 14 9 22 7 15-3 8-28-7-18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".45" /><circle cx="24" cy="24" r="3" fill="currentColor" /></svg>;
}

type IconName = "brief" | "spark" | "review" | "revision" | "check" | "lock" | "people" | "like" | "comment" | "send";
function StudioIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    brief: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="m20 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" /></>,
    review: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    revision: <><path d="M20 8a8 8 0 0 0-13-3L3 9m0-6v6h6M4 16a8 8 0 0 0 13 3l4-4m0 6v-6h-6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
    people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" /></>,
    like: <path d="M7 10v11H3V10h4Zm0 1 5-8c3 0 2 4 1 7h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7" />,
    comment: <path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z" />,
    send: <><path d="m22 2-7 20-4-9-9-4L22 2ZM11 13 22 2" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

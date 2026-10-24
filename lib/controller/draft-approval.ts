import type { Decision, ReviewerRole } from "@/schemas/audit";
import type { DraftAction, DraftStatus } from "@/schemas/drafts";
import { TransitionError } from "./errors";

type Transition = { from: DraftStatus[]; to: DraftStatus; decision: Decision };

// The only moves a human can make on a content draft. Unapproved drafts can
// never become ready_for_manual_publication (PRD P0 #3).
export const DRAFT_TRANSITIONS: Record<DraftAction, Transition> = {
  approve: {
    from: ["pending_approval", "needs_review"],
    to: "approved",
    decision: "approved",
  },
  reject: {
    from: ["pending_approval", "needs_review"],
    to: "rejected",
    decision: "rejected",
  },
  mark_ready: {
    from: ["approved"],
    to: "ready_for_manual_publication",
    decision: "approved",
  },
};

// Only the content reviewer decides drafts (PRD fixed operating policy).
export function planDraftTransition(
  draftId: string,
  current: DraftStatus,
  action: DraftAction,
  reviewerRole: ReviewerRole
): Transition {
  if (reviewerRole !== "content_reviewer") {
    throw new TransitionError(
      "Only the content reviewer can decide content drafts.",
      403
    );
  }

  const transition = DRAFT_TRANSITIONS[action];
  if (!transition.from.includes(current)) {
    throw new TransitionError(
      `Draft ${draftId} is ${current}; "${action}" needs ${transition.from.join(" or ")}.`,
      409
    );
  }

  return transition;
}

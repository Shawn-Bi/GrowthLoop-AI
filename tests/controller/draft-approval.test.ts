import { describe, expect, it } from "vitest";
import { planDraftTransition } from "@/lib/controller/draft-approval";
import { TransitionError } from "@/lib/controller/errors";
import type { DraftAction, DraftStatus } from "@/schemas/drafts";

function statusOf(fn: () => unknown): number | "ok" {
  try {
    fn();
    return "ok";
  } catch (error) {
    if (error instanceof TransitionError) return error.httpStatus;
    throw error;
  }
}

describe("planDraftTransition", () => {
  it.each<[DraftStatus, DraftAction, DraftStatus]>([
    ["pending_approval", "approve", "approved"],
    ["needs_review", "approve", "approved"],
    ["pending_approval", "reject", "rejected"],
    ["needs_review", "reject", "rejected"],
    ["approved", "mark_ready", "ready_for_manual_publication"],
  ])("%s --%s--> %s", (from, action, to) => {
    expect(planDraftTransition("cnt_001", from, action, "content_reviewer").to).toBe(to);
  });

  it.each<[DraftStatus, DraftAction]>([
    ["draft", "approve"],
    ["approved", "approve"],
    ["rejected", "approve"],
    ["rejected", "mark_ready"],
    ["pending_approval", "mark_ready"],
    ["needs_review", "mark_ready"],
    ["ready_for_manual_publication", "reject"],
  ])("refuses %s --%s--> with 409", (from, action) => {
    expect(statusOf(() => planDraftTransition("cnt_001", from, action, "content_reviewer"))).toBe(409);
  });

  it("lets only the content reviewer decide drafts (403)", () => {
    expect(
      statusOf(() => planDraftTransition("cnt_001", "pending_approval", "approve", "experiment_approver"))
    ).toBe(403);
  });
});

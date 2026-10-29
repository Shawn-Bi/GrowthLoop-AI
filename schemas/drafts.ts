import { z } from "zod";

// Content draft statuses (PRD §7). The Content Agent's output lands as
// pending_approval, or needs_review when checks flag it; only a human moves
// it further.
export const draftStatusSchema = z.enum([
  "draft",
  "needs_review",
  "pending_approval",
  "approved",
  "rejected",
  "ready_for_manual_publication",
]);
export type DraftStatus = z.infer<typeof draftStatusSchema>;

export const draftActionSchema = z.enum(["approve", "reject", "mark_ready"]);
export type DraftAction = z.infer<typeof draftActionSchema>;

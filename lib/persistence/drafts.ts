import type { PrismaClient } from "@/generated/prisma/client";
import { planDraftTransition } from "@/lib/controller/draft-approval";
import { TransitionError } from "@/lib/controller/errors";
import type { AuditEvent, ReviewerRole } from "@/schemas/audit";
import type { DraftAction, DraftStatus } from "@/schemas/drafts";
import { loadUsableClaimIds } from "./claims";

export type DraftDecisionInput = {
  draftId: string;
  action: DraftAction;
  reviewerRole: ReviewerRole;
  now: Date;
};

export type DraftDecisionResult = {
  draft: { content_id: string; experiment_id: string; status: DraftStatus };
  audit: AuditEvent;
};

// Applies a human decision to a content draft in one transaction: the
// transition table, a claim check on approval, a conditional status update
// (so a repeated or concurrent click gets 409) and an audit event.
export async function decideDraft(
  db: PrismaClient,
  input: DraftDecisionInput
): Promise<DraftDecisionResult> {
  return db.$transaction(async (tx) => {
    const draft = await tx.contentDraft.findUnique({
      where: { id: input.draftId },
    });
    if (!draft) {
      throw new TransitionError(`Draft ${input.draftId} not found.`, 404);
    }

    const transition = planDraftTransition(
      draft.id,
      draft.status,
      input.action,
      input.reviewerRole
    );

    // Claims can be rejected after a draft was generated, so check again at
    // the moment a human approves.
    if (input.action === "approve" || input.action === "mark_ready") {
      const usable = new Set(await loadUsableClaimIds(tx));
      const unusable = draft.claimIdsUsed.filter((id) => !usable.has(id));
      if (draft.claimIdsUsed.length === 0) {
        throw new TransitionError(`Draft ${draft.id} has no registry claims to check.`, 409);
      }
      if (unusable.length > 0) {
        throw new TransitionError(
          `Draft ${draft.id} uses claims that aren't approved: ${unusable.join(", ")}.`,
          409
        );
      }
    }

    if (input.action === "approve" || input.action === "mark_ready") {
      const claims = await tx.claim.findMany({ where: { id: { in: draft.claimIdsUsed } } });
      if (claims.some((claim) => !draft.body.includes(claim.text) || (claim.status === "approved_demo_claim" &&
          (!claim.demoOnly || !draft.body.includes("Hypothetical product — demonstration only"))))) {
        throw new TransitionError("Draft claim text or demo label no longer matches the registry.", 409);
      }
    }
    const updated = await tx.contentDraft.updateMany({
      where: { id: draft.id, status: { in: transition.from } },
      data: {
        status: transition.to,
        decidedByRole: input.reviewerRole,
        decidedAt: input.now,
      },
    });
    if (updated.count !== 1) {
      throw new TransitionError(`Draft ${draft.id} was already decided.`, 409);
    }

    const audit: AuditEvent = {
      event_type: "approval_decision",
      record_type: "content_draft",
      record_id: draft.id,
      decision: transition.decision,
      reviewer_role: input.reviewerRole,
      from_status: draft.status,
      to_status: transition.to,
      occurred_at: input.now.toISOString(),
    };
    await tx.auditEvent.create({
      data: {
        eventType: audit.event_type,
        recordType: audit.record_type,
        recordId: audit.record_id,
        decision: audit.decision,
        reviewerRole: audit.reviewer_role,
        fromStatus: audit.from_status,
        toStatus: audit.to_status,
        occurredAt: input.now,
      },
    });

    return {
      draft: {
        content_id: draft.id,
        experiment_id: draft.experimentId,
        status: transition.to,
      },
      audit,
    };
  });
}

import { z } from "zod";
import { contentChangeSchema, findingSchema, testVariableSchema } from "./analytics";

const id = z.string().min(1);

// Versioned controller → Content Agent handoff (PRD §7). Cycle 1 has no
// parent; every later cycle must carry the parent experiment's evidence and
// the approved content change. v1.1 (agreed on PR #13) makes content_change
// required from Cycle 2; both the controller and the Content Agent parse
// with this schema, so a v1.0 payload is rejected at either end.
export const handoffSchema = z
  .object({
    schema_version: z.literal("1.1"),
    task_id: id,
    correlation_id: id,
    idempotency_key: id,
    experiment_id: id,
    parent_experiment_id: id.nullable(),
    source_content_ids: z.array(id),
    approved_claim_ids: z.array(id),
    hypothesis: z.string().min(1),
    content_change: contentChangeSchema.optional(),
    primary_test_variable: testVariableSchema,
    control_conditions: z.array(z.string().min(1)).min(1),
    metric_ids: z.array(id),
    findings: z.array(findingSchema),
    uncertainty: z.string().min(1),
    approval_state: z.enum(["needs_human_approval", "approved", "rejected"]),
    next_action: z.literal("generate_content_drafts"),
  })
  .superRefine((handoff, ctx) => {
    if (handoff.parent_experiment_id === null) {
      return;
    }

    for (const field of [
      "source_content_ids",
      "metric_ids",
      "findings",
    ] as const) {
      if (handoff[field].length === 0) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Required when parent_experiment_id is set.",
        });
      }
    }

    if (!handoff.content_change) {
      ctx.addIssue({
        code: "custom",
        path: ["content_change"],
        message: "Required when parent_experiment_id is set.",
      });
    } else if (!handoff.source_content_ids.includes(handoff.content_change.baseline_content_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["content_change", "baseline_content_id"],
        message: "Must be one of source_content_ids.",
      });
    }

    if (handoff.parent_experiment_id === handoff.experiment_id) {
      ctx.addIssue({
        code: "custom",
        path: ["parent_experiment_id"],
        message: "An experiment can't be its own parent.",
      });
    }
  });
export type Handoff = z.infer<typeof handoffSchema>;

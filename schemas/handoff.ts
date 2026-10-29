import { z } from "zod";
import { findingSchema, testVariableSchema } from "./analytics";

const id = z.string().min(1);

// Versioned controller → Content Agent handoff (PRD §7, v1.0). Cycle 1 has no
// parent; every later cycle must carry the parent experiment's evidence.
export const handoffSchema = z
  .object({
    schema_version: z.literal("1.0"),
    task_id: id,
    correlation_id: id,
    idempotency_key: id,
    experiment_id: id,
    parent_experiment_id: id.nullable(),
    source_content_ids: z.array(id),
    approved_claim_ids: z.array(id),
    hypothesis: z.string().min(1),
    content_change: z.object({ baseline_content_id: id, variant_value: z.string().trim().min(1).max(4000) }).optional(),
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

    if (handoff.parent_experiment_id === handoff.experiment_id) {
      ctx.addIssue({
        code: "custom",
        path: ["parent_experiment_id"],
        message: "An experiment can't be its own parent.",
      });
    }
  });
export type Handoff = z.infer<typeof handoffSchema>;

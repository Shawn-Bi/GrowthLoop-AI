import { createHash } from "node:crypto";
import { generatePosts, type ExperimentVariable } from "./generate-posts";
import type { ClaimRegistry } from "./claim-registry";
import { resolveApprovedClaims } from "./claim-registry";
import { handoffSchema, type Handoff } from "@/schemas/handoff";
import { contentBriefSchema, dimensionFieldsSchema, contentDnaSchema, type ContentDna } from "@/schemas/content";
import { testVariableSchema } from "@/schemas/analytics";
import { ControllerError, TransitionError } from "@/lib/controller/errors";

export type TraceEvent = {
  side: "controller_send" | "content_receive" | "content_result" | "content_reject";
  correlation_id: string | null;
  experiment_id: string | null;
  primary_test_variable: string | null;
  payload_sha256: string;
  field_hashes: Record<string, string>;
  missing_or_rejected: string[];
  transformed: string[];
};
export type TraceSink = (event: TraceEvent) => void;
export const logContentTrace: TraceSink = (event) => console.info(JSON.stringify({ event: "content_handoff", ...event }));
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");
export function traceHandoff(side: TraceEvent["side"], input: unknown, trace: TraceSink, issues: string[] = []) {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  trace({ side, correlation_id: typeof raw.correlation_id === "string" ? raw.correlation_id : null,
    experiment_id: typeof raw.experiment_id === "string" ? raw.experiment_id : null,
    primary_test_variable: typeof raw.primary_test_variable === "string" ? raw.primary_test_variable : null,
    payload_sha256: digest(input),
    field_hashes: Object.fromEntries(["findings", "metric_ids", "primary_test_variable", "approved_claim_ids", "approval_state"].map((key) => [key, digest(raw[key])])),
    missing_or_rejected: issues, transformed: side === "content_result" ? ["A→control", "B→variant", "registry-status→approved"] : [],
  });
}

// Explicit mapping, not a fallback. A future Analytics dimension must fail here.
export function mapExperimentVariable(value: unknown): ExperimentVariable {
  const result = testVariableSchema.safeParse(value);
  if (!result.success) throw new ControllerError("Unsupported Content experiment variable.", 400);
  return result.data;
}
export function receiveContentHandoff(input: unknown, briefInput: unknown, registry: ClaimRegistry,
  baseline: ContentDna | undefined, trace: TraceSink = logContentTrace) {
  traceHandoff("content_receive", input, trace);
  try {
    const parsed = handoffSchema.safeParse(input);
    if (!parsed.success) {
      traceHandoff("content_reject", input, trace, parsed.error.issues.map((issue) => issue.path.join(".")));
      throw new ControllerError("Invalid Content handoff.", 400);
    }
    const handoff: Handoff = parsed.data;
    if (handoff.approval_state !== "approved") throw new TransitionError("Content requires an approved handoff.", 409);
    const variable = mapExperimentVariable(handoff.primary_test_variable);
    const claims = resolveApprovedClaims(handoff.approved_claim_ids, registry);
    const brief = contentBriefSchema.parse(briefInput);
    let fields = generatePosts({ ...brief, approvedClaims: claims }, {
      experimentVariable: variable, claimRegistry: registry, claimIds: handoff.approved_claim_ids,
    }).map((post) => dimensionFieldsSchema.parse({ pain_point: post.pain_point, hook: post.hook,
      value_proposition: post.value_proposition, evidence: post.evidence, cta: post.cta }));
    if (handoff.parent_experiment_id !== null) {
      if (!baseline || !handoff.content_change) throw new TransitionError("Cycle 2 requires an approved concrete content change and baseline.", 409);
      const base = dimensionFieldsSchema.parse(Object.fromEntries(testVariableSchema.options.map((key) => [key, baseline[key]])));
      fields = [base, { ...base, [variable]: handoff.content_change.variant_value }];
    }
    for (const field of testVariableSchema.options) {
      if ((fields[0][field] !== fields[1][field]) !== (field === variable)) {
        throw new TransitionError("Drafts must change exactly the selected dimension.", 409);
      }
    }
    const drafts = fields.map((values, index) => {
      const role = index === 0 ? "control" as const : "variant" as const;
      const body = ["Hypothetical product — demonstration only", values.hook, values.pain_point,
        values.value_proposition, values.evidence, values.cta].join("\n\n");
      if (claims.some((claim) => !body.includes(claim))) throw new TransitionError("Approved claim text missing from generated content.", 409);
      const dna = contentDnaSchema.parse({ ...values, schema_version: "1.0", icp: brief.audience,
        channel: "linkedin_organic", primary_test_variable: variable, variant_role: role,
        claim_ids_used: handoff.approved_claim_ids, brief,
        generation_context: { correlation_id: handoff.correlation_id, experiment_id: handoff.experiment_id,
          findings: handoff.findings, metric_ids: handoff.metric_ids, approval_state: handoff.approval_state,
          parent_experiment_id: handoff.parent_experiment_id } });
      return { role, body, dna };
    });
    traceHandoff("content_result", handoff, trace);
    return drafts;
  } catch (error) {
    traceHandoff("content_reject", input, trace, [error instanceof ControllerError ? `http_${error.httpStatus}` : "validation_failed"]);
    throw error;
  }
}

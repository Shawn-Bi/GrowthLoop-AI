import { z } from "zod";

export const claimStatusSchema = z.enum([
  // May appear only with clear hypothetical/demo labelling; not a verified fact.
  "approved_demo_claim",
  // Requires supporting source evidence.
  "verified_claim",
  // Must never be used.
  "rejected_claim",
]);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const claimSchema = z
  .object({
    claim_id: z.string().min(1),
    text: z.string().min(1),
    status: claimStatusSchema,
    source_or_evidence: z.string().min(1),
    reviewer: z.string().min(1),
    reviewed_at: z.union([z.iso.datetime({ offset: true }), z.iso.date()]),
    demo_only: z.boolean(),
  })
  .superRefine((claim, ctx) => {
    if (claim.status === "approved_demo_claim" && !claim.demo_only) {
      ctx.addIssue({
        code: "custom",
        path: ["demo_only"],
        message: "An approved_demo_claim must be demo_only.",
      });
    }
  });
export type Claim = z.infer<typeof claimSchema>;

// data/seed/claims.json (PRD §4, GL-02). Read-only in the MVP: the database
// mirrors this file.
export const claimRegistrySchema = z
  .object({
    registry_version: z.string().min(1),
    claims: z.array(claimSchema).min(1),
  })
  .superRefine((registry, ctx) => {
    const seen = new Set<string>();
    registry.claims.forEach((claim, index) => {
      if (seen.has(claim.claim_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["claims", index, "claim_id"],
          message: `Duplicate claim_id ${claim.claim_id}.`,
        });
      }
      seen.add(claim.claim_id);
    });

    if (!registry.claims.some((claim) => claim.status === "rejected_claim")) {
      ctx.addIssue({
        code: "custom",
        path: ["claims"],
        message: "Include at least one rejected_claim example (GL-02).",
      });
    }
  });
export type ClaimRegistry = z.infer<typeof claimRegistrySchema>;

// Statuses a draft or handoff may use.
export const USABLE_CLAIM_STATUSES = [
  "approved_demo_claim",
  "verified_claim",
] as const satisfies readonly ClaimStatus[];

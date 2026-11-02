import { z } from "zod";
import { testVariableSchema } from "./analytics";
import { contentBriefSchema } from "./content";

const requiredText = z.string().trim().min(1);

// The data/seed files other than claims.json (GL-02); see schemas/claims.ts.
export const briefFileSchema = z.strictObject({
  brief_version: requiredText,
  product: requiredText,
  product_description: requiredText,
  default_hypothesis: requiredText.max(500),
  default_test_variable: testVariableSchema,
  default_claim_ids: z.array(requiredText).min(1),
  brief: contentBriefSchema,
});
export type BriefFile = z.infer<typeof briefFileSchema>;

export const icpFileSchema = z.strictObject({
  icp_version: requiredText,
  icp_id: requiredText,
  label: requiredText,
  role: requiredText,
  organization: requiredText,
  channel: z.literal("linkedin_organic"),
  working_assumptions: z.array(requiredText).min(1),
  evidence_note: requiredText,
});
export type IcpFile = z.infer<typeof icpFileSchema>;

export const bannedPhrasesFileSchema = z.strictObject({
  banned_phrases_version: requiredText,
  note: requiredText,
  phrases: z.array(requiredText).min(1),
});

export const evalDraftsFileSchema = z.strictObject({
  eval_version: requiredText,
  note: requiredText,
  samples: z
    .array(
      z.strictObject({
        sample_id: requiredText,
        expected_issue: z.enum(["none", "banned_phrase", "rejected_claim"]),
        text: requiredText,
      })
    )
    .min(6)
    .max(8),
});

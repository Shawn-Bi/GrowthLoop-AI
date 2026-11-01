import { testVariableSchema } from "@/schemas/analytics";
import { claimSchema } from "@/schemas/claims";
import { contentDnaSchema, type ContentDna } from "@/schemas/content";
import { TransitionError } from "./errors";

type StoredDraft = {
  id: string;
  experimentId: string;
  variantRole: string;
  body: string;
  claimIdsUsed: string[];
  contentDna: unknown;
};

type ClaimRow = {
  id: string;
  text: string;
  status: string;
  sourceOrEvidence: string;
  reviewer: string;
  reviewedAt: Date;
  demoOnly: boolean;
};

// Claim rows are validated when the registry is seeded. Generation, approve
// and mark_ready re-check them, so a claim whose text, evidence or reviewer
// was blanked or corrupted afterwards can't support a draft.
export function assertClaimRowsValid(rows: ClaimRow[]): void {
  for (const row of rows) {
    const parsed = claimSchema.safeParse({
      claim_id: row.id,
      text: row.text,
      status: row.status,
      source_or_evidence: row.sourceOrEvidence,
      reviewer: row.reviewer,
      reviewed_at: row.reviewedAt.toISOString(),
      demo_only: row.demoOnly,
    });
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(whole record)"))];
      throw new TransitionError(`Claim ${row.id} has invalid registry metadata (${fields.join(", ")}).`, 409);
    }
  }
}

// Content DNA is validated when the controller saves a generated draft. Each
// later step that relies on a stored draft checks it again, so a malformed
// or edited record can't advance: the DNA must be valid, belong to this
// draft's experiment and correlation chain, agree with its role and claims,
// and describe the post the reviewer actually saw. Returns the parsed DNA.
export function assertDraftIntegrity(draft: StoredDraft, correlationId: string, use: string): ContentDna {
  const parsed = contentDnaSchema.safeParse(draft.contentDna);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(whole record)"))];
    throw new TransitionError(
      `Draft ${draft.id} has invalid Content DNA (${fields.join(", ")}), so it can't ${use}.`,
      409
    );
  }

  const dna = parsed.data;
  const dnaClaims = new Set(dna.claim_ids_used);
  const sameClaims =
    dnaClaims.size === new Set(draft.claimIdsUsed).size &&
    draft.claimIdsUsed.every((id) => dnaClaims.has(id));
  if (dna.variant_role !== draft.variantRole || !sameClaims) {
    throw new TransitionError(
      `Draft ${draft.id}'s Content DNA doesn't match its variant role or claim IDs, so it can't ${use}.`,
      409
    );
  }

  const context = dna.generation_context;
  if (context.experiment_id !== draft.experimentId || context.correlation_id !== correlationId) {
    throw new TransitionError(
      `Draft ${draft.id}'s Content DNA belongs to a different experiment or correlation chain, so it can't ${use}.`,
      409
    );
  }

  const missing = testVariableSchema.options.filter((field) => !draft.body.includes(dna[field]));
  if (missing.length > 0) {
    throw new TransitionError(
      `Draft ${draft.id}'s Content DNA doesn't match the reviewed post (${missing.join(", ")}), so it can't ${use}.`,
      409
    );
  }

  return dna;
}

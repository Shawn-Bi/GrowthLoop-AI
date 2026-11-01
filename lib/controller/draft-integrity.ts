import { contentDnaSchema, type ContentDna } from "@/schemas/content";
import { TransitionError } from "./errors";

type StoredDraft = {
  id: string;
  variantRole: string;
  claimIdsUsed: string[];
  contentDna: unknown;
};

// Content DNA is validated when the controller saves a generated draft. Each
// later step that relies on a stored draft checks it again, so a malformed
// or edited record can't advance. Returns the parsed DNA.
export function assertDraftIntegrity(draft: StoredDraft, use: string): ContentDna {
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

  return dna;
}

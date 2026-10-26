import {
  generatePosts,
  type PostVariation,
} from "./generate-posts";
import type { CampaignBrief } from "./validate-brief";

export type RegistryClaim = {
  claim_id: string;
  text: string;
  status:
    | "approved_demo_claim"
    | "verified_claim"
    | "rejected_claim";
  demo_only: boolean;
};


export type IntegrationDraft = {
  variant_role: "control" | "variant";
  body: string;
  content_dna: PostVariation["contentDna"];
  claim_ids_used: string[];
  status: "pending_approval";
};

export function prepareContentDrafts(
  brief: CampaignBrief,
  registryClaims: RegistryClaim[]
): IntegrationDraft[] {
  const usableClaims = registryClaims.filter(
    (claim) =>
      claim.status === "verified_claim" ||
      (claim.status === "approved_demo_claim" &&
        claim.demo_only === true)
  );

  const selectedClaims = brief.approvedClaims.map((text) => {
    const matches = usableClaims.filter(
      (claim) => claim.text === text
    );

    if (matches.length !== 1) {
      throw new Error(
        `Claim is not uniquely approved in registry: ${text}`
      );
    }

    return matches[0];
  });

  if (selectedClaims.length === 0) {
    throw new Error("At least one approved claim is required.");
  }

  const posts: PostVariation[] = generatePosts(brief);

  return posts.map((post) => ({
    variant_role: post.id === "A" ? "control" : "variant",
    body: post.content,
    content_dna: post.contentDna,
    claim_ids_used: selectedClaims.map(
      (claim) => claim.claim_id
    ),
    status: "pending_approval" as const,
  }));
}

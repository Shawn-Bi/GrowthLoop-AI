import { resolveApprovedClaims, type ClaimRegistry } from "./claim-registry";

import type { PostVariation } from "./generate-posts";

export type ApprovedPost = {
  id: "A" | "B";
  content: string;
  approvalStatus: "approved";
};

export function approvePost(
  posts: PostVariation[],
  selectedId: "A" | "B",
  humanApproved: boolean,
  claimValidation?: { claimIds: string[]; registry: ClaimRegistry }
): ApprovedPost {
  if (!humanApproved) {
    throw new Error("Human approval is required.");
  }

  const selectedPost = posts.find(
    (post) => post.id === selectedId
  );

  if (!selectedPost) {
    throw new Error("Selected post was not found.");
  }

  if (selectedPost.approvalStatus !== "pending") {
    throw new Error("Post is not awaiting approval.");
  }

  if (selectedPost.claimIds && !claimValidation) throw new Error("Claim registry revalidation required before approval.");
  if (claimValidation) {
    if (selectedPost.claimIds && (selectedPost.claimIds.length !== claimValidation.claimIds.length || selectedPost.claimIds.some((id, index) => id !== claimValidation.claimIds[index]))) throw new Error("Claim registry IDs do not match draft provenance.");
    const approved = resolveApprovedClaims(claimValidation.claimIds, claimValidation.registry);
    for (const text of approved) {
      if (!selectedPost.content.includes(text)) throw new Error("Approved claim missing from draft at ready state.");
    }
  }

  return {
    id: selectedPost.id,
    content: selectedPost.content,
    approvalStatus: "approved"
  };
}


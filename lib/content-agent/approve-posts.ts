
import type { PostVariation } from "./generate-posts";

export type ApprovedPost = {
  id: "A" | "B";
  content: string;
  approvalStatus: "approved";
};

export function approvePost(
  posts: PostVariation[],
  selectedId: "A" | "B",
  humanApproved: boolean
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

  return {
    id: selectedPost.id,
    content: selectedPost.content,
    approvalStatus: "approved"
  };
}


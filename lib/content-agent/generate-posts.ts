
import { validateBrief } from "./validate-brief";
import type { CampaignBrief } from "./validate-brief";

export type PostVariation = {
  id: "A" | "B";
  content: string;
  approvalStatus: "pending";
};

export function generatePosts(
  brief: CampaignBrief
): PostVariation[] {
  const result = validateBrief(brief);

  if (!result.valid) {
    throw new Error(result.errors.join(" "));
  }

  const claim = brief.approvedClaims[0];

  return [
    {
      id: "A",
      content: [
        `What if ${brief.audience} could achieve ${brief.campaignGoal}?`,
        "",
        brief.keyMessage,
        "",
        claim,
        "",
        "What do you think?"
      ].join("\n"),
      approvalStatus: "pending"
    },
    {
      id: "B",
      content: [
        `For ${brief.audience}, the goal is clear: ${brief.campaignGoal}.`,
        "",
        brief.keyMessage,
        "",
        `Here's what we know: ${claim}`,
        "",
        "Share your perspective in the comments."
      ].join("\n"),
      approvalStatus: "pending"
    }
  ];
}


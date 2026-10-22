
import {
  generatePosts,
  type PostVariation
} from "./generate-posts";
import type { CampaignBrief } from "./validate-brief";

export type RevisionCycle = {
  cycle: number;
  feedback: string;
  posts: PostVariation[];
};

export type RevisionLoop = {
  currentCycle: number;
  history: RevisionCycle[];
};

export function startRevisionLoop(
  brief: CampaignBrief
): RevisionLoop {
  return {
    currentCycle: 1,
    history: [
      {
        cycle: 1,
        feedback: "Initial generation",
        posts: generatePosts(brief)
      }
    ]
  };
}

export function revisePosts(
  loop: RevisionLoop,
  brief: CampaignBrief,
  feedback: string
): RevisionLoop {
  if (!feedback.trim()) {
    throw new Error("Revision feedback is required.");
  }

  if (loop.currentCycle >= 3) {
    throw new Error(
      "Maximum revision cycles reached. Human review required."
    );
  }

  const revisedBrief: CampaignBrief = {
    ...brief,
    keyMessage: `${brief.keyMessage}\nRevision guidance: ${feedback}`
  };

  const nextCycle = loop.currentCycle + 1;

  return {
    currentCycle: nextCycle,
    history: [
      ...loop.history,
      {
        cycle: nextCycle,
        feedback,
        posts: generatePosts(revisedBrief)
      }
    ]
  };
}


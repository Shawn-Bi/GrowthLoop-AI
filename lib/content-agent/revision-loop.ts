import { generatePosts, type GenerationOptions, type PostVariation } from "./generate-posts";
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

export function startRevisionLoop(brief: CampaignBrief): RevisionLoop {
  return {
    currentCycle: 1,
    history: [{ cycle: 1, feedback: "Initial generation", posts: generatePosts(brief) }]
  };
}

// Explicitly supported editing requests. Other feedback is not silently ignored.
function parseFeedback(feedback: string): GenerationOptions {
  const input = feedback.toLowerCase().trim();
  const options: GenerationOptions = {};
  let recognized = false;

  if (/shorter|shorten|concise|brief|less wordy/.test(input)) {
    options.style = "concise";
    recognized = true;
  } else if (/longer|expand|more detail|detailed/.test(input)) {
    options.style = "detailed";
    recognized = true;
  }
  if (/question|ask the audience|invite feedback/.test(input)) {
    options.callToAction = "question";
    recognized = true;
  } else if (/share|call to action|cta|actionable/.test(input)) {
    options.callToAction = "share";
    recognized = true;
  }
  if (!recognized) {
    throw new Error("This feedback needs human review. Supported requests: shorter, more detailed, ask a question, or add a sharing call to action.");
  }
  return options;
}

export function revisePosts(loop: RevisionLoop, brief: CampaignBrief, feedback: string): RevisionLoop {
  if (!feedback.trim()) throw new Error("Revision feedback is required.");
  if (loop.currentCycle >= 3) throw new Error("Maximum revision cycles reached. Human review required.");
  const options = parseFeedback(feedback);
  const posts = generatePosts(brief, options);
  const previous = loop.history.at(-1)?.posts;
  if (previous && posts.every((post, i) => post.content === previous[i]?.content)) {
    throw new Error("Feedback did not produce a new draft. Request a different change or human review.");
  }
  const nextCycle = loop.currentCycle + 1;
  return {
    currentCycle: nextCycle,
    history: [...loop.history, { cycle: nextCycle, feedback, posts }]
  };
}

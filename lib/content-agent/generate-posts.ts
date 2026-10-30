import { validateBrief, type CampaignBrief } from "./validate-brief";

export type PostVariation = {
  id: "A" | "B";
  content: string;
  approvalStatus: "pending";
};

export type ContentStyle = "standard" | "concise" | "detailed";

export type GenerationOptions = {
  style?: ContentStyle;
  callToAction?: "question" | "share";
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function generatePosts(
  brief: CampaignBrief,
  options: GenerationOptions = {}
): PostVariation[] {
  const validation = validateBrief(brief);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const audience = normalize(brief.audience);
  const goal = normalize(brief.campaignGoal);
  const message = normalize(brief.keyMessage);
  const claims = brief.approvedClaims.map(normalize);
  const style = options.style ?? "standard";
  const question = options.callToAction === "share"
    ? "Share this with someone working toward the same goal."
    : "What would make the biggest difference in your community?";
  const practicalCTA = options.callToAction === "question"
    ? "What practical step would you prioritize?"
    : "Share one practical step your team can take.";

  // Facts are reproduced verbatim in BOTH drafts. Only framing changes.
  const facts = claims.join("\n");
  const emotionalLead = style === "concise"
    ? `For ${audience}, this work matters.`
    : `Behind every effort to ${goal.toLowerCase()} are people whose experiences matter.`;
  const practicalLead = style === "concise"
    ? `A practical focus for ${audience}: ${goal}.`
    : `For ${audience}, the priority is ${goal}. Start with a clear message and an actionable next step.`;

  const a = [
    emotionalLead,
    ...(style === "detailed" ? [`Why it matters: ${message}.`] : [message]),
    facts,
    question
  ].join("\n\n");
  const b = [
    practicalLead,
    ...(style === "detailed" ? [`Focus area: ${message}.`] : [message]),
    `Approved information:\n${facts}`,
    practicalCTA
  ].join("\n\n");

  if (a === b) throw new Error("A/B drafts must have distinct framing.");
  return [
    { id: "A", content: a, approvalStatus: "pending" },
    { id: "B", content: b, approvalStatus: "pending" }
  ];
}

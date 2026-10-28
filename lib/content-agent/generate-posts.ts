import { resolveApprovedClaims, type ClaimRegistry } from "./claim-registry";
import { validateBrief, type CampaignBrief } from "./validate-brief";

export type PostVariation = {
  id: "A" | "B";
  content: string;
  approvalStatus: "pending";
  experimentVariable?: ExperimentVariable;
  hook?: string;
  pain_point?: string;
  value_proposition?: string;
  evidence?: string;
  cta?: string;
};

export type ExperimentVariable = "pain_point" | "hook" | "value_proposition" | "evidence" | "cta";

export type ContentStyle = "standard" | "concise" | "detailed";

export type GenerationOptions = {
  experimentVariable?: ExperimentVariable;
  claimRegistry?: ClaimRegistry;
  claimIds?: string[];
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
  const resolvedBrief = options.claimRegistry !== undefined || options.claimIds !== undefined
    ? { ...brief, approvedClaims: resolveApprovedClaims(options.claimIds ?? [], options.claimRegistry ?? []) }
    : brief;
  const validation = validateBrief(resolvedBrief);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  // Explicit experiments vary exactly one field. Keep the legacy generation path
  // for existing revision-loop callers until the controller is integrated.
  if (options.experimentVariable !== undefined) {
    const variable = options.experimentVariable;
    const supported: ExperimentVariable[] = ["pain_point", "hook", "value_proposition", "evidence", "cta"];
    if (!supported.includes(variable)) throw new Error("Unsupported experiment variable: " + variable);
    const common = {
      hook: "A stronger future starts with a conversation.",
      pain_point: "Community teams need practical ways to make progress.",
      value_proposition: normalize(brief.keyMessage),
      evidence: resolvedBrief.approvedClaims.map(normalize).join("\n"),
      cta: "What practical step would you prioritize?"
    };
    const variants: Record<ExperimentVariable, [string, string]> = {
      hook: ["Behind every community initiative is a story worth hearing.", "What if the next breakthrough starts with your team?"],
      pain_point: ["Important community work can be hard to coordinate.", "Too many teams struggle to turn good intentions into action."],
      value_proposition: [common.value_proposition, "Together, we can move forward: " + common.value_proposition],
      evidence: [common.evidence, "Approved information:\n" + common.evidence],
      cta: ["What practical step would you prioritize?", "Which action would you take first?"]
    };
    return (["A", "B"] as const).map((id, index) => {
      const fields = { ...common, [variable]: variants[variable][index] };
      return { id, ...fields, experimentVariable: variable, content: [fields.hook, fields.pain_point, fields.value_proposition, fields.evidence, fields.cta].join("\n\n"), approvalStatus: "pending" as const };
    });
  }

  const audience = normalize(brief.audience);
  const goal = normalize(brief.campaignGoal);
  const message = normalize(brief.keyMessage);
  const claims = resolvedBrief.approvedClaims.map(normalize);
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

import { bannedPhrases } from "./seed";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function findBannedPhrases(text: string): string[] {
  const normalized = normalize(text);
  return bannedPhrases.filter((phrase) => normalized.includes(normalize(phrase)));
}

// What the automated checks can see in post copy: banned phrases and the
// wording of rejected claims. They run at generation, approve and mark_ready.
// They are incomplete, so a human reviewer still decides (PRD §4).
export function findContentIssues(text: string, rejectedClaimTexts: readonly string[]): string[] {
  const normalized = normalize(text);
  return [
    ...findBannedPhrases(text).map((phrase) => `banned phrase "${phrase}"`),
    ...rejectedClaimTexts
      .filter((claim) => normalized.includes(normalize(claim)))
      .map((claim) => `rejected claim "${claim}"`),
  ];
}

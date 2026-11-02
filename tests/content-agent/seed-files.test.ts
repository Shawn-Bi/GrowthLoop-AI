import { describe, expect, it } from "vitest";
import bannedPhrasesFile from "@/data/seed/banned_phrases.json";
import briefFile from "@/data/seed/brief.json";
import claimsFile from "@/data/seed/claims.json";
import evalDraftsFile from "@/data/seed/eval_drafts.json";
import icpFile from "@/data/seed/icp.json";
import { findBannedPhrases, findContentIssues } from "@/lib/content-agent/content-checks";
import { claimRegistrySchema } from "@/schemas/claims";
import { bannedPhrasesFileSchema, briefFileSchema, evalDraftsFileSchema, icpFileSchema } from "@/schemas/seed";

const registry = claimRegistrySchema.parse(claimsFile);
const rejected = registry.claims.filter((claim) => claim.status === "rejected_claim").map((claim) => claim.text);

describe("GrantReady seed files (GL-02)", () => {
  it("all pass their schemas", () => {
    expect(briefFileSchema.safeParse(briefFile).success).toBe(true);
    expect(icpFileSchema.safeParse(icpFile).success).toBe(true);
    expect(bannedPhrasesFileSchema.safeParse(bannedPhrasesFile).success).toBe(true);
    expect(evalDraftsFileSchema.safeParse(evalDraftsFile).success).toBe(true);
  });

  it("labels every usable claim as demo-only, since GrantReady is hypothetical", () => {
    const usable = registry.claims.filter((claim) => claim.status !== "rejected_claim");
    expect(usable.length).toBeGreaterThan(0);
    expect(usable.every((claim) => claim.status === "approved_demo_claim" && claim.demo_only)).toBe(true);
  });

  it("defaults only to approved claims", () => {
    const usable = registry.claims.filter((claim) => claim.status === "approved_demo_claim").map((claim) => claim.claim_id);
    expect(usable).toEqual(expect.arrayContaining(briefFile.default_claim_ids));
  });

  it("has no approved claim that the content checks would refuse", () => {
    for (const claim of registry.claims.filter((item) => item.status === "approved_demo_claim")) {
      expect(findContentIssues(claim.text, rejected)).toEqual([]);
    }
  });

  it("matches banned phrases regardless of case or spacing", () => {
    expect(findBannedPhrases("Guaranteed   GRANT award")).toEqual(["guarantee"]);
    expect(findBannedPhrases("A checklist for each grant.")).toEqual([]);
  });

  it.each(evalDraftsFile.samples)("labels $sample_id as $expected_issue", ({ text, expected_issue }) => {
    const issues = findContentIssues(text, rejected).join(" ");
    expect(issues.includes("banned phrase")).toBe(expected_issue === "banned_phrase");
    expect(issues.includes("rejected claim")).toBe(expected_issue === "rejected_claim");
  });
});


export type CampaignBrief = {
  audience: string;
  campaignGoal: string;
  keyMessage: string;
  approvedClaims: string[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateBrief(
  brief: CampaignBrief
): ValidationResult {
  const errors: string[] = [];

  if (!brief.audience?.trim()) {
    errors.push("Target audience is required.");
  }

  if (!brief.campaignGoal?.trim()) {
    errors.push("Campaign goal is required.");
  }

  if (!brief.keyMessage?.trim()) {
    errors.push("Key message is required.");
  }

  if (
    !Array.isArray(brief.approvedClaims) ||
    brief.approvedClaims.length === 0 ||
    brief.approvedClaims.some(
      (claim) =>
        typeof claim !== "string" ||
        !claim.trim()
    )
  ) {
    errors.push(
      "At least one non-empty approved claim is required."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


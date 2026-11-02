export type ClaimStatus = "approved" | "rejected" | "pending" | "revoked";
export type ClaimRecord = { id: string; text: string; status: ClaimStatus };
export type ClaimRegistry = readonly ClaimRecord[];

export function resolveApprovedClaims(ids: readonly string[], registry: ClaimRegistry): string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("At least one claim registry ID is required.");
  const unique = new Set<string>();
  return ids.map((id) => {
    if (typeof id !== "string" || !id.trim() || unique.has(id)) throw new Error("Invalid or duplicate claim registry ID.");
    unique.add(id);
    const matches = registry.filter((entry) => entry.id === id);
    if (matches.length !== 1) throw new Error("Claim registry ID missing or ambiguous: " + id);
    const claim = matches[0];
    if (claim.status !== "approved" || !claim.text.trim()) throw new Error("Claim is not approved: " + id);
    return claim.text;
  });
}

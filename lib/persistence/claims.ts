import type { PrismaClient } from "@/generated/prisma/client";
import {
  USABLE_CLAIM_STATUSES,
  claimRegistrySchema,
  type ClaimRegistry,
} from "@/schemas/claims";

export type SeedResult = {
  registry_version: string;
  upserted: number;
  // Claims no longer in the file, now marked rejected_claim.
  retired: string[];
};

// Loads the registry file in one transaction: every claim in it is
// upserted, and claims no longer in it are kept but marked rejected_claim.
// Drafts store claim IDs, so keeping the row keeps the claim's text and
// evidence in the audit trail while blocking it from new content.
export async function seedClaimRegistry(
  db: PrismaClient,
  input: unknown
): Promise<SeedResult> {
  const registry: ClaimRegistry = claimRegistrySchema.parse(input);
  const ids = registry.claims.map((claim) => claim.claim_id);

  return db.$transaction(async (tx) => {
    for (const claim of registry.claims) {
      const data = {
        registryVersion: registry.registry_version,
        text: claim.text,
        status: claim.status,
        sourceOrEvidence: claim.source_or_evidence,
        reviewer: claim.reviewer,
        reviewedAt: new Date(claim.reviewed_at),
        demoOnly: claim.demo_only,
      };
      await tx.claim.upsert({
        where: { id: claim.claim_id },
        create: { id: claim.claim_id, ...data },
        update: data,
      });
    }

    const stale = await tx.claim.findMany({
      where: { id: { notIn: ids } },
      select: { id: true },
    });
    await tx.claim.updateMany({
      where: { id: { notIn: ids } },
      data: { status: "rejected_claim" },
    });

    return {
      registry_version: registry.registry_version,
      upserted: registry.claims.length,
      retired: stale.map((claim) => claim.id),
    };
  });
}

// Claim IDs the Content Agent may use: approved demo claims and verified
// claims, never rejected or unknown ones.
export async function loadUsableClaimIds(
  db: Pick<PrismaClient, "claim">
): Promise<string[]> {
  const claims = await db.claim.findMany({
    where: { status: { in: [...USABLE_CLAIM_STATUSES] } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return claims.map((claim) => claim.id);
}

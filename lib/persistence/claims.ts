import type { PrismaClient } from "@/generated/prisma/client";
import {
  USABLE_CLAIM_STATUSES,
  claimRegistrySchema,
  type ClaimRegistry,
} from "@/schemas/claims";

export type SeedResult = {
  registry_version: string;
  upserted: number;
  removed: string[];
};

// Makes the Claim table mirror the registry file in one transaction:
// every claim is upserted and claims no longer in the file are removed.
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
    await tx.claim.deleteMany({ where: { id: { notIn: ids } } });

    return {
      registry_version: registry.registry_version,
      upserted: registry.claims.length,
      removed: stale.map((claim) => claim.id),
    };
  });
}

// Claim IDs the Content Agent may use: approved demo claims and verified
// claims, never rejected or unknown ones.
export async function loadUsableClaimIds(db: PrismaClient): Promise<string[]> {
  const claims = await db.claim.findMany({
    where: { status: { in: [...USABLE_CLAIM_STATUSES] } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return claims.map((claim) => claim.id);
}

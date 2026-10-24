import { beforeEach, describe, expect, it } from "vitest";
import { loadUsableClaimIds, seedClaimRegistry } from "@/lib/persistence/claims";
import { claimRegistrySchema } from "@/schemas/claims";
import { setupTestDb, type TestDb } from "./db";

// Test-only registry in the GL-02 shape; not Michelle's GrantReady claims.
function registry() {
  return {
    registry_version: "v1",
    claims: [
      {
        claim_id: "clm_002",
        text: "Demo claim B",
        status: "approved_demo_claim",
        source_or_evidence: "Hypothetical demo positioning",
        reviewer: "Michelle",
        reviewed_at: "2026-10-21",
        demo_only: true,
      },
      {
        claim_id: "clm_001",
        text: "Verified claim A",
        status: "verified_claim",
        source_or_evidence: "Public product page",
        reviewer: "Michelle",
        reviewed_at: "2026-10-21T15:00:00Z",
        demo_only: false,
      },
      {
        claim_id: "clm_003",
        text: "Guaranteed grant award",
        status: "rejected_claim",
        source_or_evidence: "Unverifiable guarantee",
        reviewer: "Michelle",
        reviewed_at: "2026-10-21",
        demo_only: true,
      },
    ],
  };
}

const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(() => {
  testDb = getTestDb();
});

describe("claimRegistrySchema", () => {
  it("accepts a registry in the GL-02 shape", () => {
    expect(claimRegistrySchema.safeParse(registry()).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const input = registry();
    input.claims[0].status = "maybe";

    expect(claimRegistrySchema.safeParse(input).success).toBe(false);
  });

  it("requires approved demo claims to be demo_only", () => {
    const input = registry();
    input.claims[0].demo_only = false;

    const result = claimRegistrySchema.safeParse(input);
    expect(result.error?.issues[0].message).toBe("An approved_demo_claim must be demo_only.");
  });

  it("rejects duplicate claim IDs", () => {
    const input = registry();
    input.claims[1].claim_id = "clm_002";

    const result = claimRegistrySchema.safeParse(input);
    expect(result.error?.issues[0].message).toBe("Duplicate claim_id clm_002.");
  });

  it("requires at least one rejected example", () => {
    const input = registry();
    input.claims = input.claims.filter((claim) => claim.status !== "rejected_claim");

    const result = claimRegistrySchema.safeParse(input);
    expect(result.error?.issues[0].message).toContain("rejected_claim");
  });
});

describe("seedClaimRegistry", () => {
  it("loads every claim with its registry version", async () => {
    const result = await seedClaimRegistry(testDb.db, registry());

    expect(result).toEqual({ registry_version: "v1", upserted: 3, removed: [] });
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_001" } }))
      .toMatchObject({
        registryVersion: "v1",
        status: "verified_claim",
        demoOnly: false,
        reviewedAt: new Date("2026-10-21T15:00:00Z"),
      });
  });

  it("mirrors the file when re-seeded: updates claims and removes dropped ones", async () => {
    await seedClaimRegistry(testDb.db, registry());
    const next = registry();
    next.registry_version = "v2";
    next.claims = next.claims.filter((claim) => claim.claim_id !== "clm_002");
    next.claims[0].text = "Verified claim A, reworded";

    const result = await seedClaimRegistry(testDb.db, next);

    expect(result).toEqual({ registry_version: "v2", upserted: 2, removed: ["clm_002"] });
    expect(await testDb.db.claim.count()).toBe(2);
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_001" } }))
      .toMatchObject({ registryVersion: "v2", text: "Verified claim A, reworded" });
  });

  it("writes nothing when the registry is invalid", async () => {
    await expect(seedClaimRegistry(testDb.db, { registry_version: "v1", claims: [] })).rejects.toThrow();
    expect(await testDb.db.claim.count()).toBe(0);
  });
});

describe("loadUsableClaimIds", () => {
  it("returns approved and verified claims only, sorted", async () => {
    await seedClaimRegistry(testDb.db, registry());

    expect(await loadUsableClaimIds(testDb.db)).toEqual(["clm_001", "clm_002"]);
  });
});

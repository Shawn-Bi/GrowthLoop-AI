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

  it.each(["claim_id", "text", "source_or_evidence", "reviewer"] as const)(
    "rejects a whitespace-only %s",
    (field) => {
      const input = registry();
      input.claims[0][field] = "   ";

      const result = claimRegistrySchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["claims", 0, field]);
    }
  );

  it("rejects a whitespace-only registry_version and trims real values", () => {
    expect(claimRegistrySchema.safeParse({ ...registry(), registry_version: " " }).success).toBe(false);

    const padded = registry();
    padded.claims[0].text = "  Demo claim B  ";
    expect(claimRegistrySchema.parse(padded).claims[0].text).toBe("Demo claim B");
  });
});

describe("seedClaimRegistry", () => {
  it("loads every claim with its registry version", async () => {
    const result = await seedClaimRegistry(testDb.db, registry());

    expect(result).toEqual({ registry_version: "v1", upserted: 3, retired: [] });
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_001" } }))
      .toMatchObject({
        registryVersion: "v1",
        status: "verified_claim",
        demoOnly: false,
        reviewedAt: new Date("2026-10-21T15:00:00Z"),
      });
  });

  it("updates review metadata when re-seeded and keeps dropped claims as rejected_claim", async () => {
    await seedClaimRegistry(testDb.db, registry());
    const next = registry();
    next.registry_version = "v2";
    next.claims = next.claims.filter((claim) => claim.claim_id !== "clm_002");
    next.claims[0].reviewer = "Michelle (re-review)";
    next.claims[0].reviewed_at = "2026-10-29";

    const result = await seedClaimRegistry(testDb.db, next);

    expect(result).toEqual({ registry_version: "v2", upserted: 2, retired: ["clm_002"] });
    expect(await testDb.db.claim.count()).toBe(3);
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_001" } }))
      .toMatchObject({
        registryVersion: "v2",
        text: "Verified claim A",
        reviewer: "Michelle (re-review)",
        reviewedAt: new Date("2026-10-29"),
      });
    // The history stays readable: same text, evidence, reviewer and the last
    // registry version that contained it.
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_002" } }))
      .toMatchObject({
        registryVersion: "v1",
        text: "Demo claim B",
        sourceOrEvidence: "Hypothetical demo positioning",
        reviewer: "Michelle",
        status: "rejected_claim",
      });
    expect(await loadUsableClaimIds(testDb.db)).toEqual(["clm_001"]);
  });

  it("restores a retired claim when it returns to the file", async () => {
    await seedClaimRegistry(testDb.db, registry());
    const without = registry();
    without.claims = without.claims.filter((claim) => claim.claim_id !== "clm_002");
    await seedClaimRegistry(testDb.db, without);

    const result = await seedClaimRegistry(testDb.db, { ...registry(), registry_version: "v3" });

    expect(result.retired).toEqual([]);
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_002" } }))
      .toMatchObject({ registryVersion: "v3", status: "approved_demo_claim" });
    expect(await loadUsableClaimIds(testDb.db)).toEqual(["clm_001", "clm_002"]);
  });

  it.each([
    ["text", (claim: { text: string }) => { claim.text = "Verified claim A, reworded"; }],
    ["evidence", (claim: { source_or_evidence: string }) => { claim.source_or_evidence = "A different source"; }],
  ])("refuses to change an existing claim's %s and loads nothing", async (_field, change) => {
    await seedClaimRegistry(testDb.db, registry());
    const next = { ...registry(), registry_version: "v2" };
    change(next.claims[1]);

    await expect(seedClaimRegistry(testDb.db, next)).rejects.toThrow(
      "Claims clm_001 already exist with different text or evidence"
    );
    // Nothing from v2 was written, and the stored wording is unchanged.
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_001" } }))
      .toMatchObject({ registryVersion: "v1", text: "Verified claim A", sourceOrEvidence: "Public product page" });
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_002" } }))
      .toMatchObject({ registryVersion: "v1" });
  });

  it("refuses to restore a retired claim with different text", async () => {
    await seedClaimRegistry(testDb.db, registry());
    const without = registry();
    without.claims = without.claims.filter((claim) => claim.claim_id !== "clm_002");
    await seedClaimRegistry(testDb.db, without);
    const back = { ...registry(), registry_version: "v3" };
    back.claims[0].text = "Demo claim B, rewritten";

    await expect(seedClaimRegistry(testDb.db, back)).rejects.toThrow("clm_002");
    expect(await testDb.db.claim.findUniqueOrThrow({ where: { id: "clm_002" } }))
      .toMatchObject({ text: "Demo claim B", status: "rejected_claim" });
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

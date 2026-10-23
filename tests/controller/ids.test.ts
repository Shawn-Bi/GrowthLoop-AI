import { describe, expect, it } from "vitest";
import { nextSequentialId } from "@/lib/controller/ids";

describe("nextSequentialId", () => {
  it.each([
    ["exp_001", "exp_002"],
    ["exp_009", "exp_010"],
    ["cnt_099", "cnt_100"],
    ["exp_999", "exp_1000"],
  ])("%s → %s", (id, next) => {
    expect(nextSequentialId(id)).toBe(next);
  });

  it("rejects IDs without a numeric suffix", () => {
    expect(() => nextSequentialId("exp_")).toThrow("no numeric suffix");
  });
});

import { describe, expect, it } from "vitest";
import { describeError } from "./error-capture";

describe("SSR error formatting", () => {
  it("preserves the originating stack and nested cause without a global error slot", () => {
    const cause = new Error("database unavailable");
    const error = new Error("request failed", { cause });
    const result = describeError(error);
    expect(result).toContain("request failed");
    expect(result).toContain("caused by: Error: database unavailable");
  });

  it("bounds serialised error size", () => {
    expect(describeError(new Error("x".repeat(20_000))).length).toBeLessThanOrEqual(8_000);
  });
});

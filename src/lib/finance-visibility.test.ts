import { describe, expect, it } from "vitest";
import { canViewFinances } from "./finance-visibility";

describe("financial visibility", () => {
  it("hides all financial surfaces from children without adult authorization", () => {
    expect(canViewFinances("member", false)).toBe(false);
  });
  it("allows children after adult authorization", () => {
    expect(canViewFinances("member", true)).toBe(true);
  });
  it("allows adults without additional authorization", () => {
    expect(canViewFinances("admin", false)).toBe(true);
  });
  it("revokes child access when authorization is cleared on logout", () => {
    expect(canViewFinances("member", true)).toBe(true);
    expect(canViewFinances("member", false)).toBe(false);
    expect(canViewFinances(undefined, true)).toBe(false);
  });
});
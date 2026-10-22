import { describe, expect, it } from "vitest";
import { splitBill, validateSplits } from "./split";

describe("splitBill", () => {
  it("deducts fixed amounts first, then splits the remainder", () => {
    const r = splitBill(60, [
      { personId: "carlos", type: "amount", value: 20 },
      { personId: "papa", type: "percent", value: 50 },
      { personId: "mama", type: "percent", value: 50 },
    ]);
    expect(r).toEqual({ carlos: 20, papa: 20, mama: 20 });
  });

  it("divides what remains after percentages equally", () => {
    const r = splitBill(100, [
      { personId: "a", type: "percent", value: 40 },
      { personId: "b", type: "equal", value: 0 },
      { personId: "c", type: "equal", value: 0 },
    ]);
    expect(r).toEqual({ a: 40, b: 30, c: 30 });
  });

  it("rejects percentages above 100%", () => {
    expect(validateSplits(100, [{ personId: "a", type: "percent", value: 120 }])).not.toBeNull();
  });

  it("rejects zero amounts", () => {
    expect(validateSplits(0, [])).not.toBeNull();
  });
});

describe("monetary integrity", () => {
  it("keeps all cents when an equal split has a remainder", () => {
    const splits = ["a", "b", "c"].map((personId) => ({
      personId,
      type: "equal" as const,
      value: 0,
    }));
    expect(splitBill(100, splits)).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
    expect(splitBill(0.01, splits)).toEqual({ a: 0.01, b: 0, c: 0 });
    expect(splitBill(100, splits.slice().reverse())).toEqual({ c: 33.33, b: 33.33, a: 33.34 });
  });

  it("preserves fixed cents and distributes percentage rounding deterministically", () => {
    expect(
      splitBill(100, [
        { personId: "fixed", type: "amount", value: 0.01 },
        { personId: "a", type: "percent", value: 50 },
        { personId: "b", type: "percent", value: 50 },
      ]),
    ).toEqual({ fixed: 0.01, a: 50, b: 49.99 });
  });

  it("rejects incomplete, negative and duplicate allocations", () => {
    expect(validateSplits(100, [{ personId: "a", type: "amount", value: 50 }])).not.toBeNull();
    expect(
      validateSplits(100, [
        { personId: "a", type: "percent", value: -10 },
        { personId: "b", type: "equal", value: 0 },
      ]),
    ).not.toBeNull();
    expect(
      validateSplits(100, [
        { personId: "a", type: "equal", value: 0 },
        { personId: "a", type: "equal", value: 0 },
      ]),
    ).not.toBeNull();
    expect(validateSplits(100.001, [{ personId: "a", type: "equal", value: 0 }])).not.toBeNull();
  });

  it("bounds the display of an invalid legacy fixed allocation", () => {
    expect(splitBill(50, [{ personId: "a", type: "amount", value: 100 }])).toEqual({ a: 50 });
    expect(validateSplits(50, [{ personId: "a", type: "amount", value: 100 }])).not.toBeNull();
  });
});

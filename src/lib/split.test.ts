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

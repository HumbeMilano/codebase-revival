import { describe, expect, it } from "vitest";
import { billStatus, monthSummary, type LedgerBill } from "./ledger";

const bill = (p: Partial<LedgerBill>): LedgerBill => ({
  id: "x",
  name: "x",
  category: "c",
  base: 100,
  dueDay: 10,
  autoPay: false,
  splits: [
    { personId: "a", type: "equal", value: 0 },
    { personId: "b", type: "equal", value: 0 },
  ],
  overrides: {},
  ...p,
});
const today = new Date(2026, 9, 21);

describe("ledger", () => {
  it("marks auto-pay bills paid once the due day arrives", () => {
    expect(billStatus(bill({ autoPay: true, dueDay: 15 }), "2026-10", today)).toBe("paid");
    expect(billStatus(bill({ autoPay: true, dueDay: 25 }), "2026-10", today)).toBe("pending");
  });

  it("a month override changes only that month's amount", () => {
    const b = bill({ overrides: { "2026-10": { amount: 140 } } });
    expect(monthSummary([b], [], "2026-10", today, ["a", "b"]).total).toBe(140);
    expect(monthSummary([b], [], "2026-11", today, ["a", "b"]).total).toBe(100);
  });

  it("skipped bills don't count that month", () => {
    const b = bill({ overrides: { "2026-10": { hidden: true } } });
    expect(monthSummary([b], [], "2026-10", today, ["a"]).total).toBe(0);
  });

  it("still owes = assigned minus contributed; available = contributed minus paid share", () => {
    const b = bill({ base: 200, overrides: { "2026-10": { status: "paid" } } });
    const s = monthSummary(
      [b],
      [{ id: "1", personId: "a", amount: 40, month: "2026-10" }],
      "2026-10",
      today,
      ["a", "b"],
    );
    const a = s.persons.find((p) => p.personId === "a")!;
    expect(a.assigned).toBe(100);
    expect(a.stillOwes).toBe(60);
    expect(a.available).toBe(-60);
  });
});

describe("calendar and legacy ledger integrity", () => {
  it("uses the last actual day of short months for automatic payments", () => {
    expect(billStatus(bill({ autoPay: true, dueDay: 31 }), "2026-02", new Date(2026, 1, 27))).toBe(
      "pending",
    );
    expect(billStatus(bill({ autoPay: true, dueDay: 31 }), "2026-02", new Date(2026, 1, 28))).toBe(
      "paid",
    );
    expect(billStatus(bill({ autoPay: true, dueDay: 31 }), "2028-02", new Date(2028, 1, 28))).toBe(
      "pending",
    );
    expect(billStatus(bill({ autoPay: true, dueDay: 31 }), "2028-02", new Date(2028, 1, 29))).toBe(
      "paid",
    );
  });

  it("keeps orphan historical identities visible in the summary instead of losing their contribution", () => {
    const summary = monthSummary(
      [],
      [{ id: "c", personId: "archived", amount: 50, month: "2026-10" }],
      "2026-10",
      today,
      ["a"],
    );
    expect(summary.persons.find((p) => p.personId === "archived")?.contributed).toBe(50);
    expect(summary.persons.reduce((sum, p) => sum + p.contributed, 0)).toBe(summary.contributed);
  });
});

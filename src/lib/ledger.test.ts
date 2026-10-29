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
  it("estimates scheduled payments without confirming them", () => {
    expect(billStatus(bill({ autoPay: true, dueDay: 15 }), "2026-10", today)).toBe("estimated");
    expect(billStatus(bill({ autoPay: true, dueDay: 25 }), "2026-10", today)).toBe("pending");
  });

  it("a month override changes only that month's amount", () => {
    const b = bill({ overrides: { "2026-10": { amount: 140 } } });
    expect(monthSummary([b], [], "2026-10", today, ["a", "b"]).total).toBe(140);
    expect(monthSummary([b], [], "2026-11", today, ["a", "b"]).total).toBe(100);
  });

  it("keeps estimates out of confirmed payments and available balances until confirmation", () => {
    const scheduled = bill({ id: "scheduled", base: 100, autoPay: true, dueDay: 10 });
    const confirmed = bill({
      id: "confirmed",
      base: 60,
      overrides: { "2026-10": { status: "paid" } },
    });
    const waiting = bill({ id: "waiting", base: 40 });
    const contributions = [
      { id: "a", personId: "a", amount: 50, month: "2026-10" },
      { id: "b", personId: "b", amount: 50, month: "2026-10" },
    ];
    const snapshot = structuredClone(scheduled);
    const summary = monthSummary([scheduled, confirmed, waiting], contributions, "2026-10", today, [
      "a",
      "b",
    ]);
    expect(summary.total).toBe(200);
    expect(summary.paid).toBe(60);
    expect(summary.estimated).toBe(100);
    expect(summary.pending).toBe(140);
    expect(summary.paid + summary.pending).toBe(summary.total);
    expect(summary.persons.map((p) => p.available)).toEqual([20, 20]);
    expect(summary.persons.reduce((sum, p) => sum + p.estimated, 0)).toBe(100);
    expect(scheduled).toEqual(snapshot);
    const paid = { ...scheduled, overrides: { "2026-10": { status: "paid" as const } } };
    const after = monthSummary([paid, confirmed, waiting], contributions, "2026-10", today, [
      "a",
      "b",
    ]);
    expect(after.paid).toBe(160);
    expect(after.estimated).toBe(0);
    expect(after.persons.map((p) => p.available)).toEqual([-30, -30]);
  });

  it("an explicit pending override defeats a scheduled estimate and history stays unchanged", () => {
    const scheduled = bill({ autoPay: true, overrides: { "2026-10": { status: "pending" } } });
    expect(billStatus(scheduled, "2026-10", today)).toBe("pending");
    expect(billStatus(scheduled, "2026-09", today)).toBe("estimated");
    expect(scheduled.overrides).toEqual({ "2026-10": { status: "pending" } });
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
      "estimated",
    );
    expect(billStatus(bill({ autoPay: true, dueDay: 31 }), "2028-02", new Date(2028, 1, 28))).toBe(
      "pending",
    );
    expect(billStatus(bill({ autoPay: true, dueDay: 31 }), "2028-02", new Date(2028, 1, 29))).toBe(
      "estimated",
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

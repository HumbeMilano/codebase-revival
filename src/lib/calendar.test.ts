import { describe, expect, it } from "vitest";
import { calendarBills, calendarDateFromId, upcomingCalendarItems } from "./calendar";
import type { LedgerBill } from "./ledger";
const bill: LedgerBill = {
  id: "10000000-0000-4000-8000-000000000010",
  name: "Internet",
  category: "Internet",
  base: 30,
  dueDay: 31,
  autoPay: false,
  splits: [{ personId: "m_ana", type: "equal", value: 0 }],
  overrides: { "2028-02": { amount: 40, status: "paid" }, "2028-03": { hidden: true } },
};
describe("calendar billing and reminders", () => {
  it("applies a weekly boundary to bills as well as events", () => {
    const pendingBill = { ...bill, overrides: {} };
    const now = new Date(2028, 0, 10);
    expect(upcomingCalendarItems([], [pendingBill], now, 5)).toHaveLength(3);
    expect(upcomingCalendarItems([], [pendingBill], now, 5, "2028-01-17")).toEqual([]);
  });
  it("uses the actual monthly amount, status, participants and valid due date without copying a bill into events", () => {
    const entries = calendarBills([bill], "2028-02", new Date(2028, 1, 5));
    expect(entries[0]).toMatchObject({
      kind: "bill",
      date: "2028-02-29",
      amount: 40,
      status: "paid",
      memberIds: ["m_ana"],
    });
    expect(calendarBills([bill], "2028-03", new Date(2028, 1, 5))).toEqual([]);
    expect(calendarDateFromId(entries[0]!.id, [], [bill], new Date(2028, 0, 1))).toBe("2028-02-29");
  });
  it("keeps overdue reminders actionable, removes completed ones and does not show paid bills as pending", () => {
    const entries = upcomingCalendarItems(
      [
        {
          id: "past",
          title: "Overdue",
          date: "2028-02-01",
          time: "08:00",
          memberId: "m_ana",
          note: "",
          kind: "reminder",
        },
        {
          id: "done",
          title: "Done",
          date: "2028-02-02",
          time: "",
          memberId: "m_ana",
          note: "",
          kind: "reminder",
          completed: true,
        },
      ],
      [bill],
      new Date(2028, 1, 10),
      10,
    );
    expect(entries.some((e) => e.id === "past")).toBe(true);
    expect(entries.some((e) => e.id === "done" || e.date === "2028-02-29")).toBe(false);
  });
});

import {
  billAmount,
  billStatus,
  billsForMonth,
  effectiveDueDay,
  type LedgerBill,
  type BillStatus,
} from "./ledger";
import { dateKey, type FamilyEvent } from "@/components/hub/planner-data";

export type CalendarBill = {
  kind: "bill";
  id: string;
  billId: string;
  month: string;
  title: string;
  date: string;
  time: string;
  memberIds: string[];
  amount: number;
  status: BillStatus;
};
export type CalendarItem = FamilyEvent | CalendarBill;
export function calendarBills(bills: LedgerBill[], month: string, now: Date): CalendarBill[] {
  return billsForMonth(bills, month).map((bill) => ({
    kind: "bill",
    id: `bill:${bill.id}:${month}`,
    billId: bill.id,
    month,
    title: bill.name,
    date: `${month}-${String(effectiveDueDay(bill.dueDay, month)).padStart(2, "0")}`,
    time: "",
    memberIds: bill.splits.map((s) => s.personId),
    amount: billAmount(bill, month),
    status: billStatus(bill, month, now),
  }));
}
export function upcomingCalendarItems(
  events: FamilyEvent[],
  bills: LedgerBill[],
  now: Date,
  limit = 5,
  before?: string,
): CalendarItem[] {
  const today = dateKey(now),
    time = now.toTimeString().slice(0, 5);
  const due = Array.from({ length: 3 }, (_, offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return calendarBills(bills, dateKey(d).slice(0, 7), now);
  }).flat();
  return [...events, ...due]
    .filter((item) => {
      if (before && item.date >= before) return false;
      if (item.kind === "bill") return item.status !== "paid" && item.date >= today;
      if (item.completed) return false;
      if (item.kind === "reminder") return true;
      return item.date > today || (item.date === today && (!item.time || item.time >= time));
    })
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, limit);
}
export function calendarDateFromId(
  id: string | undefined,
  events: FamilyEvent[],
  bills: LedgerBill[],
  now: Date,
): string {
  const event = events.find((e) => e.id === id);
  if (event) return event.date;
  const match = id?.match(/^bill:([a-f0-9-]{36}):(\d{4}-\d{2})$/);
  if (match && bills.some((b) => b.id === match[1]))
    return calendarBills(bills, match[2]!, now).find((b) => b.id === id)?.date ?? dateKey(now);
  if (id?.startsWith("date:") && /^\d{4}-\d{2}-\d{2}$/.test(id.slice(5))) return id.slice(5);
  return dateKey(now);
}

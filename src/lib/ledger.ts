import { splitBill, type Split } from "./split";

/**
 * Household "pot" accounting:
 * - Bills are recurring obligations, each split among people (their "asignado").
 * - People put money into the shared pot ("aportes").
 * - Each month can override a bill's amount, status, or skip it without touching the template.
 */
export interface MonthOverride {
  amount?: number;
  status?: "paid" | "pending";
  hidden?: boolean;
}
export interface LedgerBill {
  id: string;
  revision?: number;
  name: string;
  category: string;
  base: number;
  dueDay: number;
  autoPay: boolean;
  splits: Split[];
  overrides: Record<string, MonthOverride>; // key: YYYY-MM
}
export interface Contribution {
  id: string;
  revision?: number;
  personId: string;
  amount: number;
  month: string; // YYYY-MM
  date?: string | null;
  note?: string;
}

export const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
const round = (n: number) => Math.round(n * 100) / 100;

export function billAmount(b: LedgerBill, mk: string) {
  return b.overrides[mk]?.amount ?? b.base;
}

/** Clamp monthly due days to the last actual day, including February. */
export function effectiveDueDay(dueDay: number, mk: string): number {
  const [year, month] = mk.split("-").map(Number);
  return Math.min(Math.max(1, dueDay), new Date(year!, month!, 0).getDate());
}

/** Explicit status wins; automatic status is an estimate based on the due date. */
export function billStatus(b: LedgerBill, mk: string, today: Date): "paid" | "pending" {
  const explicit = b.overrides[mk]?.status;
  if (explicit) return explicit;
  if (!b.autoPay) return "pending";
  const todayKey = monthKey(today.getFullYear(), today.getMonth());
  if (mk < todayKey) return "paid";
  if (mk > todayKey) return "pending";
  return today.getDate() >= effectiveDueDay(b.dueDay, mk) ? "paid" : "pending";
}

export function billsForMonth(bills: LedgerBill[], mk: string) {
  return bills.filter((b) => !b.overrides[mk]?.hidden).sort((a, b) => a.dueDay - b.dueDay);
}

export interface PersonSummary {
  personId: string;
  assigned: number;
  paid: number;
  pending: number;
  contributed: number;
  available: number; // aportó − lo que ya se pagó de su parte
  stillOwes: number; // asignado − aportó (nunca negativo)
  billCount: number;
}

export function monthSummary(
  bills: LedgerBill[],
  contributions: Contribution[],
  mk: string,
  today: Date,
  people: string[],
) {
  const persons: Record<string, PersonSummary> = {};
  const relevantPeople = new Set([
    ...people,
    ...billsForMonth(bills, mk).flatMap((bill) => bill.splits.map((split) => split.personId)),
    ...contributions.filter((c) => c.month === mk).map((c) => c.personId),
  ]);
  for (const id of relevantPeople)
    persons[id] = {
      personId: id,
      assigned: 0,
      paid: 0,
      pending: 0,
      contributed: 0,
      available: 0,
      stillOwes: 0,
      billCount: 0,
    };

  let total = 0,
    paid = 0,
    pendingCount = 0;
  for (const b of billsForMonth(bills, mk)) {
    const amt = billAmount(b, mk);
    const isPaid = billStatus(b, mk, today) === "paid";
    total += amt;
    if (isPaid) paid += amt;
    else pendingCount++;
    for (const [pid, share] of Object.entries(splitBill(amt, b.splits))) {
      const p = persons[pid];
      if (!p) continue;
      p.assigned += share;
      p.billCount++;
      if (isPaid) p.paid += share;
      else p.pending += share;
    }
  }
  let contributed = 0;
  for (const c of contributions) {
    if (c.month !== mk) continue;
    contributed += c.amount;
    const p = persons[c.personId];
    if (p) p.contributed += c.amount;
  }
  const list = Object.values(persons).map((p) => ({
    ...p,
    assigned: round(p.assigned),
    paid: round(p.paid),
    pending: round(p.pending),
    contributed: round(p.contributed),
    available: round(p.contributed - p.paid),
    stillOwes: round(Math.max(0, p.assigned - p.contributed)),
  }));
  return {
    total: round(total),
    paid: round(paid),
    pending: round(total - paid),
    pendingCount,
    contributed: round(contributed),
    persons: list,
  };
}

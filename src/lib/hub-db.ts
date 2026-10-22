import { db } from "@/lib/db";
import type { Chore, ShopItem } from "@/components/hub/data";
import type { FamilyEvent, FamilyNote } from "@/components/hub/planner-data";
import type { Contribution, LedgerBill, MonthOverride } from "@/lib/ledger";
import type { Split } from "@/lib/split";

export let HOUSEHOLD_ID = "";
export const setHouseholdId = (id: string) => { HOUSEHOLD_ID = id; };

export interface HubData {
  chores: Chore[];
  items: ShopItem[];
  events: FamilyEvent[];
  notes: FamilyNote[];
  bills: LedgerBill[];
  contributions: Contribution[];
}

export async function loadHubData(): Promise<HubData> {
  const [chores, items, events, notes, bills, splits, overrides, contributions] = await Promise.all([
    db().from("chores").select("*").eq("household_id", HOUSEHOLD_ID).order("position"),
    db().from("shopping_items").select("*").eq("household_id", HOUSEHOLD_ID).order("position"),
    db().from("events").select("*").eq("household_id", HOUSEHOLD_ID),
    db().from("notes").select("*").eq("household_id", HOUSEHOLD_ID),
    db().from("bills").select("*").eq("household_id", HOUSEHOLD_ID).order("position"),
    db().from("bill_splits").select("*"),
    db().from("bill_overrides").select("*"),
    db().from("contributions").select("*").eq("household_id", HOUSEHOLD_ID),
  ]);
  for (const result of [chores, items, events, notes, bills, splits, overrides, contributions]) {
    if (result.error) throw result.error;
  }
  const splitRows = splits.data ?? [];
  const overrideRows = overrides.data ?? [];
  return {
    chores: (chores.data ?? []).map((r) => ({ id: r.id, title: r.title, memberId: r.member_key, done: r.done, when: r.when_label })),
    items: (items.data ?? []).map((r) => ({ id: r.id, name: r.name, done: r.done })),
    events: (events.data ?? []).map((r) => ({ id: r.id, title: r.title, date: r.date, time: r.time, memberId: r.member_key, note: r.note })),
    notes: (notes.data ?? []).map((r) => ({ id: r.id, title: r.title, body: r.body, memberId: r.member_key, pinned: r.pinned })),
    bills: (bills.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      base: Number(r.base),
      dueDay: r.due_day,
      autoPay: r.auto_pay,
      splits: splitRows.filter((s) => s.bill_id === r.id).map((s): Split => ({ personId: s.person_key, type: s.type as Split["type"], value: Number(s.value) })),
      overrides: Object.fromEntries(
        overrideRows.filter((o) => o.bill_id === r.id).map((o) => {
          const mo: MonthOverride = {};
          if (o.amount !== null) mo.amount = Number(o.amount);
          if (o.status === "paid" || o.status === "pending") mo.status = o.status;
          if (o.hidden) mo.hidden = true;
          return [o.month, mo];
        }),
      ),
    })),
    contributions: (contributions.data ?? []).map((r) => ({ id: r.id, personId: r.person_key, amount: Number(r.amount), month: r.month, note: r.note })),
  };
}

type Row = Record<string, unknown>;
function checkWrite(result: { error: unknown }) {
  if (result.error) throw result.error;
}

/** Diff two collections by id and apply inserts/updates/deletes. */
async function syncCollection(
  table: "chores" | "shopping_items" | "events" | "notes" | "contributions",
  prev: { id: string }[],
  next: { id: string }[],
  toRow: (item: never, position: number) => Row,
) {
  const prevIds = new Set(prev.map((x) => x.id));
  const nextIds = new Set(next.map((x) => x.id));
  const removed = prev.filter((x) => !nextIds.has(x.id)).map((x) => x.id);
  if (removed.length) checkWrite(await db().from(table).delete().in("id", removed));
  const prevById = new Map(prev.map((x) => [x.id, x]));
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    if (!item) continue;
    const before = prevById.get(item.id);
    const row = toRow(item as never, i);
    if (!before) checkWrite(await db().from(table).insert(row as never));
    else if (JSON.stringify(toRow(before as never, i)) !== JSON.stringify(row))
      checkWrite(await db().from(table).update(row as never).eq("id", item.id));
  }
}

export const syncChores = (prev: Chore[], next: Chore[]) =>
  syncCollection("chores", prev, next, (c: Chore, position) => ({ id: c.id, household_id: HOUSEHOLD_ID, title: c.title, member_key: c.memberId, done: c.done, when_label: c.when, position }));

export const syncItems = (prev: ShopItem[], next: ShopItem[]) =>
  syncCollection("shopping_items", prev, next, (i: ShopItem, position) => ({ id: i.id, household_id: HOUSEHOLD_ID, name: i.name, done: i.done, position }));

export const syncEvents = (prev: FamilyEvent[], next: FamilyEvent[]) =>
  syncCollection("events", prev, next, (e: FamilyEvent) => ({ id: e.id, household_id: HOUSEHOLD_ID, title: e.title, date: e.date, time: e.time, member_key: e.memberId, note: e.note }));

export const syncNotes = (prev: FamilyNote[], next: FamilyNote[]) =>
  syncCollection("notes", prev, next, (n: FamilyNote) => ({ id: n.id, household_id: HOUSEHOLD_ID, title: n.title, body: n.body, member_key: n.memberId, pinned: n.pinned, updated_at: new Date().toISOString() }));

export const syncContributions = (prev: Contribution[], next: Contribution[]) =>
  syncCollection("contributions", prev, next, (c: Contribution) => ({ id: c.id, household_id: HOUSEHOLD_ID, person_key: c.personId, amount: c.amount, month: c.month, note: c.note ?? "" }));

/** Bills carry nested splits and month overrides, so they sync as a unit. */
export async function syncBills(prev: LedgerBill[], next: LedgerBill[]) {
  const nextIds = new Set(next.map((b) => b.id));
  const removed = prev.filter((b) => !nextIds.has(b.id)).map((b) => b.id);
  if (removed.length) checkWrite(await db().from("bills").delete().in("id", removed));
  const prevById = new Map(prev.map((b) => [b.id, b]));
  for (let i = 0; i < next.length; i++) {
    const b = next[i];
    if (!b) continue;
    const before = prevById.get(b.id);
    const changed = before && JSON.stringify(before) !== JSON.stringify(b);
    if (before && !changed) continue;
    checkWrite(await db().from("bills").upsert({ id: b.id, household_id: HOUSEHOLD_ID, name: b.name, category: b.category, base: b.base, due_day: b.dueDay, auto_pay: b.autoPay, position: i }));
    checkWrite(await db().from("bill_splits").delete().eq("bill_id", b.id));
    if (b.splits.length)
      checkWrite(await db().from("bill_splits").insert(b.splits.map((s) => ({ bill_id: b.id, person_key: s.personId, type: s.type, value: s.value }))));
    checkWrite(await db().from("bill_overrides").delete().eq("bill_id", b.id));
    const rows = Object.entries(b.overrides).map(([month, o]) => ({ bill_id: b.id, month, amount: o.amount ?? null, status: o.status ?? null, hidden: o.hidden ?? false }));
    if (rows.length) checkWrite(await db().from("bill_overrides").insert(rows));
  }
}

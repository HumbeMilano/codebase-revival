import { db } from "@/lib/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import type { Chore, ShopItem } from "@/components/hub/data";
import type { FamilyEvent, FamilyNote } from "@/components/hub/planner-data";
import type { Contribution, LedgerBill, MonthOverride } from "@/lib/ledger";
import type { Split } from "@/lib/split";
import { PersistenceConflictError } from "@/lib/persistence-errors";

export let HOUSEHOLD_ID = "";
export const setHouseholdId = (id: string) => {
  HOUSEHOLD_ID = id;
};

export interface HubData {
  chores: Chore[];
  items: ShopItem[];
  events: FamilyEvent[];
  notes: FamilyNote[];
  bills: LedgerBill[];
  contributions: Contribution[];
}

type Page<T> = { data: T[] | null; error: unknown; count?: number | null };
const PAGE_SIZE = 500;

/** Continue from the rows actually received, including servers with a smaller cap. */
export async function readAllPages<T>(
  query: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let count: number | null = null;
  for (;;) {
    const page = await query(rows.length, rows.length + PAGE_SIZE - 1);
    if (page.error) throw page.error;
    const data = page.data ?? [];
    count = page.count ?? count;
    rows.push(...data);
    if (!data.length || (count !== null ? rows.length >= count : data.length < PAGE_SIZE))
      return rows;
  }
}

type Entity = { id: string; revision?: number; position?: number };
type EditableRow = Record<string, string | number | boolean | null>;
type CollectionTable = "chores" | "shopping_items" | "events" | "notes" | "contributions";
interface Change {
  id: string;
  operation: "insert" | "update" | "delete";
  expected_revision: number | null;
  values: EditableRow;
}

/** A snapshot owns its client, household and revisions for its whole lifetime. */
export function bindHubPersistence(
  householdId = HOUSEHOLD_ID,
  client: SupabaseClient<Database> = db(),
) {
  let disposed = false;
  const revisions = new Map<string, number>();
  const assertActive = () => {
    if (disposed || !householdId) throw new Error("Household session is inactive");
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      throw new Error("Network offline");
  };
  const revisionFor = (table: string, previous: Entity, candidate?: Entity) => {
    if (
      candidate?.revision !== undefined &&
      previous.revision !== undefined &&
      candidate.revision !== previous.revision
    )
      throw new PersistenceConflictError();
    const revision = Math.max(
      previous.revision ?? 0,
      revisions.get(`${table}:${previous.id}`) ?? 0,
    );
    if (!revision) throw new PersistenceConflictError();
    return revision;
  };
  const remember = (table: string, rows: unknown) => {
    if (!Array.isArray(rows)) throw new Error("Invalid save response");
    for (const row of rows as Entity[]) {
      if (!row.id || !Number.isSafeInteger(row.revision) || (row.revision ?? 0) < 1)
        throw new Error("Invalid save revision");
      revisions.set(`${table}:${row.id}`, row.revision!);
    }
    return rows as Required<Entity>[];
  };

  const load = async ({
    includeFinances = false,
  }: { includeFinances?: boolean } = {}): Promise<HubData> => {
    assertActive();
    const [chores, items, events, notes, bills, contributions] = await Promise.all([
      readAllPages<Tables<"chores">>((from, to) =>
        client
          .from("chores")
          .select("*", { count: "exact" })
          .eq("household_id", householdId)
          .order("position")
          .order("id")
          .range(from, to),
      ),
      readAllPages<Tables<"shopping_items">>((from, to) =>
        client
          .from("shopping_items")
          .select("*", { count: "exact" })
          .eq("household_id", householdId)
          .order("position")
          .order("id")
          .range(from, to),
      ),
      readAllPages<Tables<"events">>((from, to) =>
        client
          .from("events")
          .select("*", { count: "exact" })
          .eq("household_id", householdId)
          .order("date")
          .order("id")
          .range(from, to),
      ),
      readAllPages<Tables<"notes">>((from, to) =>
        client
          .from("notes")
          .select("*", { count: "exact" })
          .eq("household_id", householdId)
          .order("id")
          .range(from, to),
      ),
      includeFinances
        ? readAllPages<Tables<"bills">>((from, to) =>
            client
              .from("bills")
              .select("*", { count: "exact" })
              .eq("household_id", householdId)
              .order("position")
              .order("id")
              .range(from, to),
          )
        : Promise.resolve([]),
      includeFinances
        ? readAllPages<Tables<"contributions">>((from, to) =>
            client
              .from("contributions")
              .select("*", { count: "exact" })
              .eq("household_id", householdId)
              .order("id")
              .range(from, to),
          )
        : Promise.resolve([]),
    ]);
    const splits: Tables<"bill_splits">[] = [];
    const overrides: Tables<"bill_overrides">[] = [];
    // Keep URLs bounded and never read another household's child rows by default.
    for (let offset = 0; offset < bills.length; offset += 100) {
      const ids = bills.slice(offset, offset + 100).map((bill) => bill.id);
      const [splitPage, overridePage] = await Promise.all([
        readAllPages<Tables<"bill_splits">>((from, to) =>
          client
            .from("bill_splits")
            .select("*", { count: "exact" })
            .in("bill_id", ids)
            .order("id")
            .range(from, to),
        ),
        readAllPages<Tables<"bill_overrides">>((from, to) =>
          client
            .from("bill_overrides")
            .select("*", { count: "exact" })
            .in("bill_id", ids)
            .order("bill_id")
            .order("month")
            .range(from, to),
        ),
      ]);
      splits.push(...splitPage);
      overrides.push(...overridePage);
    }
    assertActive();
    return {
      chores: chores.map((row) => ({
        id: row.id,
        title: row.title,
        memberId: row.member_key,
        done: row.done,
        when: row.when_label,
        dueDate: row.due_date,
        position: row.position,
        revision: row.revision,
      })),
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        done: row.done,
        position: row.position,
        revision: row.revision,
      })),
      events: events.map((row) => ({
        id: row.id,
        title: row.title,
        date: row.date,
        time: row.time,
        memberId: row.member_key,
        note: row.note,
        revision: row.revision,
      })),
      notes: notes.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        memberId: row.member_key,
        pinned: row.pinned,
        revision: row.revision,
      })),
      bills: bills.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        base: Number(row.base),
        dueDay: row.due_day,
        autoPay: row.auto_pay,
        revision: row.revision,
        splits: splits
          .filter((split) => split.bill_id === row.id)
          .map((split): Split => ({
            personId: split.person_key,
            type: split.type as Split["type"],
            value: Number(split.value),
          })),
        overrides: Object.fromEntries(
          overrides
            .filter((override) => override.bill_id === row.id)
            .map((override) => {
              const month: MonthOverride = {};
              if (override.amount !== null) month.amount = Number(override.amount);
              if (override.status === "paid" || override.status === "pending")
                month.status = override.status;
              if (override.hidden) month.hidden = true;
              return [override.month, month];
            }),
        ),
      })),
      contributions: contributions.map((row) => ({
        id: row.id,
        personId: row.person_key,
        amount: Number(row.amount),
        month: row.month,
        note: row.note,
        revision: row.revision,
      })),
    };
  };

  const syncCollection = async <T extends Entity>(
    table: CollectionTable,
    previous: T[],
    next: T[],
    toRow: (item: T, position: number) => EditableRow,
  ): Promise<T[]> => {
    assertActive();
    const nextIds = new Set(next.map((item) => item.id));
    const previousById = new Map(previous.map((item, position) => [item.id, { item, position }]));
    const changes: Change[] = previous
      .filter((item) => !nextIds.has(item.id))
      .map((item) => ({
        id: item.id,
        operation: "delete",
        expected_revision: revisionFor(table, item),
        values: {},
      }));
    let appendPosition =
      previous.reduce((maximum, item, index) => Math.max(maximum, item.position ?? index), -1) + 1;
    const positions = new Map<string, number>();
    for (const item of next) {
      const before = previousById.get(item.id);
      // Deleting one item leaves a harmless gap; rewriting the remainder would
      // conflict with unrelated edits and exceed a bounded transaction's limit.
      const position =
        item.position ?? before?.item.position ?? before?.position ?? appendPosition++;
      positions.set(item.id, position);
      const values = toRow(item, position);
      if (!before)
        changes.push({ id: item.id, operation: "insert", expected_revision: null, values });
      else {
        const beforeValues = toRow(before.item, before.item.position ?? before.position);
        const patch = Object.fromEntries(
          Object.entries(values).filter(([key, value]) => value !== beforeValues[key]),
        );
        if (Object.keys(patch).length)
          changes.push({
            id: item.id,
            operation: "update",
            expected_revision: revisionFor(table, before.item, item),
            values: patch,
          });
      }
    }
    if (!changes.length) return next;
    const { data, error } = await client.rpc("save_collection", {
      _table: table,
      _household: householdId,
      _changes: changes as unknown as Json,
    });
    if (error) throw error;
    const returned = remember(table, data);
    const expected = new Set(
      changes.filter((change) => change.operation !== "delete").map((change) => change.id),
    );
    if (returned.length !== expected.size || returned.some((row) => !expected.has(row.id)))
      throw new Error("Invalid save response");
    const changed = new Map(returned.map((row) => [row.id, row]));
    assertActive();
    return next.map((item) => {
      const row = changed.get(item.id);
      if (!row) return item;
      return table === "chores" || table === "shopping_items"
        ? { ...item, revision: row.revision, position: row.position ?? positions.get(item.id)! }
        : { ...item, revision: row.revision };
    });
  };

  const syncBills = async (previous: LedgerBill[], next: LedgerBill[]): Promise<LedgerBill[]> => {
    assertActive();
    const nextIds = new Set(next.map((bill) => bill.id));
    for (const bill of previous.filter((item) => !nextIds.has(item.id))) {
      const { error } = await client.rpc("delete_bill", {
        _id: bill.id,
        _expected_revision: revisionFor("bills", bill),
      });
      if (error) throw error;
      revisions.delete(`bills:${bill.id}`);
    }
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const saved: LedgerBill[] = [];
    for (const [position, bill] of next.entries()) {
      const before = previousById.get(bill.id);
      if (before && JSON.stringify(before) === JSON.stringify(bill)) {
        saved.push(bill);
        continue;
      }
      assertActive();
      const { data, error } = await client.rpc("save_bill", {
        _household: householdId,
        _expected_revision: before ? revisionFor("bills", before, bill) : null,
        _bill: {
          id: bill.id,
          name: bill.name,
          category: bill.category,
          base: bill.base,
          due_day: bill.dueDay,
          auto_pay: bill.autoPay,
          position,
          splits: bill.splits.map((split) => ({
            person_key: split.personId,
            type: split.type,
            value: split.value,
          })),
          overrides: Object.entries(bill.overrides).map(([month, value]) => ({
            month,
            amount: value.amount ?? null,
            status: value.status ?? null,
            hidden: value.hidden ?? false,
          })),
        },
      });
      if (error) throw error;
      const [row] = remember("bills", [data]);
      saved.push({ ...bill, revision: row!.revision });
    }
    assertActive();
    return saved;
  };

  return {
    householdId,
    load,
    activate: () => {
      disposed = false;
    },
    dispose: () => {
      disposed = true;
    },
    syncChores: (previous: Chore[], next: Chore[]) =>
      syncCollection("chores", previous, next, (item, position) => ({
        title: item.title,
        member_key: item.memberId,
        done: item.done,
        when_label: item.when,
        due_date: item.dueDate ?? null,
        position,
      })),
    syncItems: (previous: ShopItem[], next: ShopItem[]) =>
      syncCollection("shopping_items", previous, next, (item, position) => ({
        name: item.name,
        done: item.done,
        position,
      })),
    syncEvents: (previous: FamilyEvent[], next: FamilyEvent[]) =>
      syncCollection("events", previous, next, (item) => ({
        title: item.title,
        date: item.date,
        time: item.time,
        member_key: item.memberId,
        note: item.note,
      })),
    syncNotes: (previous: FamilyNote[], next: FamilyNote[]) =>
      syncCollection("notes", previous, next, (item) => ({
        title: item.title,
        body: item.body,
        member_key: item.memberId,
        pinned: item.pinned,
      })),
    syncContributions: (previous: Contribution[], next: Contribution[]) =>
      syncCollection("contributions", previous, next, (item) => ({
        person_key: item.personId,
        amount: item.amount,
        month: item.month,
        note: item.note ?? "",
      })),
    syncBills,
  };
}

/** Legacy wrappers resolve a fresh context; mounted screens should bind once. */
export const loadHubData = (options?: { includeFinances?: boolean }) =>
  bindHubPersistence().load(options);
export const syncChores = (previous: Chore[], next: Chore[]) =>
  bindHubPersistence().syncChores(previous, next);
export const syncItems = (previous: ShopItem[], next: ShopItem[]) =>
  bindHubPersistence().syncItems(previous, next);
export const syncEvents = (previous: FamilyEvent[], next: FamilyEvent[]) =>
  bindHubPersistence().syncEvents(previous, next);
export const syncNotes = (previous: FamilyNote[], next: FamilyNote[]) =>
  bindHubPersistence().syncNotes(previous, next);
export const syncContributions = (previous: Contribution[], next: Contribution[]) =>
  bindHubPersistence().syncContributions(previous, next);
export const syncBills = (previous: LedgerBill[], next: LedgerBill[]) =>
  bindHubPersistence().syncBills(previous, next);

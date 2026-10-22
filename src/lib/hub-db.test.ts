import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { bindHubPersistence, readAllPages, setHouseholdId } from "./hub-db";
import { PersistenceConflictError } from "./persistence-errors";

vi.mock("./db", () => ({ db: vi.fn() }));
const client = (rpc = vi.fn().mockResolvedValue({ data: [], error: null })) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

describe("household persistence", () => {
  it("paginates beyond the API cap without skipping rows", async () => {
    const source = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const query = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, Math.min(to + 1, from + 100)),
      count: source.length,
      error: null,
    }));
    expect(await readAllPages(query)).toEqual(source);
    expect(query).toHaveBeenCalledTimes(13);
    expect(query.mock.calls[1]?.[0]).toBe(100);
  });

  it("sends a narrow atomic patch with the revision of the edited row", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "one", revision: 3 }], error: null });
    const bound = bindHubPersistence("home", client(rpc));
    const before = {
      id: "one",
      title: "Clean",
      memberId: "m",
      done: false,
      when: "Hoy",
      revision: 2,
    };
    const result = await bound.syncChores([before], [{ ...before, done: true }]);
    expect(rpc).toHaveBeenCalledWith("save_collection", {
      _table: "chores",
      _household: "home",
      _changes: [{ id: "one", operation: "update", expected_revision: 2, values: { done: true } }],
    });
    expect(result[0]?.revision).toBe(3);
  });

  it("keeps queued saves bound to their original household", async () => {
    setHouseholdId("first");
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "one", revision: 1 }], error: null });
    const bound = bindHubPersistence(undefined, client(rpc));
    setHouseholdId("second");
    await bound.syncItems([], [{ id: "one", name: "Bread", done: false }]);
    expect(rpc.mock.calls[0]?.[1]._household).toBe("first");
    bound.dispose();
    await expect(bound.syncItems([], [{ id: "two", name: "Milk", done: false }])).rejects.toThrow(
      "inactive",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("uses the acknowledged revision for a rapid edit after an optimistic insert", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: "one", revision: 1 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "one", revision: 2 }], error: null });
    const bound = bindHubPersistence("home", client(rpc));
    const inserted = { id: "one", name: "Bread", done: false };
    await bound.syncItems([], [inserted]);
    await bound.syncItems([inserted], [{ ...inserted, done: true }]);
    expect(rpc.mock.calls[1]?.[1]._changes[0].expected_revision).toBe(1);
  });

  it("rejects an editor draft made before a newer snapshot", async () => {
    const rpc = vi.fn();
    const bound = bindHubPersistence("home", client(rpc));
    const before = { id: "one", name: "Bread", done: false, revision: 2 };
    await expect(
      bound.syncItems([before], [{ ...before, done: true, revision: 1 }]),
    ).rejects.toBeInstanceOf(PersistenceConflictError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not accept an update that acknowledged zero changed rows", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const bound = bindHubPersistence("home", client(rpc));
    const before = { id: "one", name: "Bread", done: false, revision: 2 };
    await expect(bound.syncItems([before], [{ ...before, done: true }])).rejects.toThrow(
      "Invalid save response",
    );
  });

  it("saves bill children through one transactional RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "bill", revision: 4 }, error: null });
    const bound = bindHubPersistence("home", client(rpc));
    const before = {
      id: "bill",
      name: "Rent",
      category: "Vivienda",
      base: 100,
      dueDay: 2,
      autoPay: false,
      splits: [{ personId: "m", type: "equal" as const, value: 0 }],
      overrides: {},
      revision: 3,
    };
    const saved = await bound.syncBills([before], [{ ...before, name: "Mortgage" }]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe("save_bill");
    expect(rpc.mock.calls[0]?.[1]._expected_revision).toBe(3);
    expect(saved[0]?.revision).toBe(4);
  });
});

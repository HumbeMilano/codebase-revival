import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  acceptShoppingSnapshot,
  enqueueShopping,
  enqueueShoppingLists,
  defaultShoppingList,
  flushShopping,
  readShopping,
  resolveShoppingConflict,
} from "./offline-shopping";
import type { ShopItem } from "@/components/hub/data";

const scope = () => `${crypto.randomUUID()}:${crypto.randomUUID()}:m_person`;
const item = (name = "Leche"): ShopItem => ({
  id: crypto.randomUUID(),
  name,
  done: false,
  position: 0,
  revision: 1,
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const client = (fetcher: typeof fetch) =>
  createClient<Database>("https://fixture.invalid", "sb_publishable_fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
afterEach(() => vi.restoreAllMocks());

describe("durable shopping outbox", () => {
  it("retains local operations across independent reads and serializes simultaneous edits", async () => {
    const key = scope(),
      milk = item();
    await acceptShoppingSnapshot(key, [milk]);
    await Promise.all([
      enqueueShopping(key, (rows) => [...rows, item("Pan")]),
      enqueueShopping(key, (rows) =>
        rows.map((row) => (row.id === milk.id ? { ...row, done: true } : row)),
      ),
    ]);
    const restored = await readShopping(key);
    expect(restored.local.map((row) => row.name)).toEqual(["Leche", "Pan"]);
    expect(restored.local[0]?.done).toBe(true);
    expect(restored.queue).toHaveLength(2);
  });
  it("retries an uncertain response with the same mutation identity and payload", async () => {
    const key = scope(),
      bread = item("Pan");
    await enqueueShopping(key, () => [bread]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Network failure after commit"))
      .mockResolvedValueOnce(response([bread]));
    const api = client(fetcher);
    await expect(flushShopping(key, key.split(":")[1]!, api)).rejects.toBeDefined();
    expect((await readShopping(key)).queue).toHaveLength(1);
    await flushShopping(key, key.split(":")[1]!, api);
    const first = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const retry = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(retry).toEqual(first);
    expect((await readShopping(key)).queue).toHaveLength(0);
  });
  it("rebases dependent revisions only after the preceding insert is confirmed", async () => {
    const key = scope(),
      bread = item("Pan");
    await enqueueShopping(key, () => [bread]);
    await enqueueShopping(key, (rows) => rows.map((row) => ({ ...row, done: true })));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([bread]))
      .mockResolvedValueOnce(response([{ ...bread, done: true, revision: 2 }]));
    await flushShopping(key, key.split(":")[1]!, client(fetcher));
    const second = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(second._changes[0].expected_revision).toBe(1);
    expect(second._changes[0].values).toEqual({ done: true });
    expect((await readShopping(key)).local[0]).toMatchObject({ done: true, revision: 2 });
  });
  it("keeps conflicting changes until an explicit choice, preserving unrelated server products", async () => {
    const key = scope(),
      milk = item(),
      eggs = item("Huevos");
    await acceptShoppingSnapshot(key, [milk]);
    await enqueueShopping(key, (rows) => rows.map((row) => ({ ...row, done: true })));
    const original = (await readShopping(key)).queue[0]!.id;
    const api = client(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ code: "40001", message: "Record changed" }, 409)),
    );
    await expect(flushShopping(key, key.split(":")[1]!, api)).rejects.toBeDefined();
    expect((await readShopping(key)).conflict).toBe(true);
    const resolved = await resolveShoppingConflict(key, [{ ...milk, revision: 2 }, eggs], true);
    expect(resolved.local.find((row) => row.id === eggs.id)).toEqual(eggs);
    expect(resolved.local.find((row) => row.id === milk.id)?.done).toBe(true);
    expect(resolved.queue[0]!.id).not.toBe(original);
    expect(resolved.queue[0]!.changes).toEqual([
      { id: milk.id, operation: "update", expected_revision: 2, values: { done: true } },
    ]);
  });
  it("can retain the household version instead of sending a stale edit", async () => {
    const key = scope(),
      milk = item();
    await acceptShoppingSnapshot(key, [milk]);
    await enqueueShopping(key, () => []);
    const result = await resolveShoppingConflict(key, [{ ...milk, revision: 3 }], false);
    expect(result.queue).toEqual([]);
    expect(result.local).toEqual([{ ...milk, revision: 3 }]);
  });
  it("requires review of edits older than the server retry window", async () => {
    const key = scope();
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    await enqueueShopping(key, () => [item()]);
    clock.mockRestore();
    const fetcher = vi.fn<typeof fetch>();
    await expect(flushShopping(key, key.split(":")[1]!, client(fetcher))).rejects.toThrow(
      "14 días",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect((await readShopping(key)).conflict).toBe(true);
  });
  it("does not expose one account's purchases or queue through another scope", async () => {
    const first = scope(),
      second = scope();
    await enqueueShopping(first, () => [item()]);
    expect((await readShopping(second)).local).toEqual([]);
    expect((await readShopping(second)).queue).toEqual([]);
    expect((await readShopping(first)).queue).toHaveLength(1);
  });
});

describe("multiple durable shopping lists", () => {
  it("keeps an older cached list and its pending products while introducing independent lists", async () => {
    const key = scope(),
      defaultId = key.split(":")[1]!,
      school = crypto.randomUUID();
    const milk = item();
    await acceptShoppingSnapshot(key, [milk]);
    await enqueueShopping(key, (rows) => rows.map((row) => ({ ...row, done: true })));
    await enqueueShoppingLists(key, (lists) => [
      ...lists,
      { id: school, name: "School", archived: false },
    ]);
    await enqueueShopping(key, (rows) => [...rows, { ...item(), listId: school }]);
    const restored = await readShopping(key);
    expect(restored.local).toHaveLength(2);
    expect(restored.local[0]?.done).toBe(true);
    expect(restored.lists?.map((list) => list.name)).toEqual(["Groceries", "School"]);
    expect(restored.queue).toHaveLength(3);
    expect(restored.queue[0]?.changes[0]?.values).toEqual({ done: true });
    expect(restored.queue[2]?.changes[0]?.values.list_id).toBe(school);
    expect(restored.lists?.[0]?.id).toBe(defaultId);
  });
  it("retries list creation with its exact identity before synchronizing dependent products", async () => {
    const key = scope(),
      school = crypto.randomUUID(),
      bread = { ...item("Bread"), listId: school };
    await enqueueShoppingLists(key, (lists) => [
      ...lists,
      { id: school, name: "School", archived: false },
    ]);
    await enqueueShopping(key, (rows) => [...rows, bread]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Response lost"))
      .mockResolvedValueOnce(
        response({
          items: [],
          lists: [{ id: school, name: "School", archived: false, position: 1, revision: 1 }],
        }),
      )
      .mockResolvedValueOnce(response([{ ...bread, list_id: school }]));
    const api = client(fetcher);
    await expect(flushShopping(key, key.split(":")[1]!, api)).rejects.toBeDefined();
    await flushShopping(key, key.split(":")[1]!, api);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(
      JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)),
    );
    const restored = await readShopping(key);
    expect(restored.queue).toHaveLength(0);
    expect(restored.local[0]?.listId).toBe(school);
    expect(restored.lists?.find((list) => list.id === school)?.revision).toBe(1);
  });
  it("rebases new-list name collisions without moving or losing unrelated products", async () => {
    const key = scope(),
      defaultId = key.split(":")[1]!,
      localId = crypto.randomUUID(),
      remoteId = crypto.randomUUID();
    await enqueueShoppingLists(key, (lists) => [
      ...lists,
      { id: localId, name: "School", archived: false },
    ]);
    await enqueueShopping(key, (rows) => [...rows, { ...item("Pencils"), listId: localId }]);
    const remoteMilk = item("Milk");
    const result = await resolveShoppingConflict(key, [remoteMilk], true, [
      defaultShoppingList(defaultId),
      { id: remoteId, name: "School", archived: false, revision: 2 },
    ]);
    expect(result.lists?.map((list) => list.id)).toEqual([defaultId, remoteId]);
    expect(result.local.find((row) => row.name === "Pencils")?.listId).toBe(remoteId);
    expect(result.local.find((row) => row.id === remoteMilk.id)).toEqual(remoteMilk);
    expect(result.queue[0]?.changes[0]?.values.list_id).toBe(remoteId);
  });
  it("archives without deleting products and refuses to archive the original list", async () => {
    const key = scope(),
      defaultId = key.split(":")[1]!,
      school = crypto.randomUUID();
    await acceptShoppingSnapshot(
      key,
      [{ ...item("Book"), listId: school }],
      [
        defaultShoppingList(defaultId),
        { id: school, name: "School", archived: false, revision: 1 },
      ],
    );
    await enqueueShoppingLists(key, (lists) =>
      lists.map((list) => (list.id === school ? { ...list, archived: true } : list)),
    );
    expect((await readShopping(key)).local).toHaveLength(1);
    expect((await readShopping(key)).lists?.find((list) => list.id === school)?.archived).toBe(
      true,
    );
    await expect(
      enqueueShoppingLists(key, (lists) => lists.map((list) => ({ ...list, archived: true }))),
    ).rejects.toThrow("debe permanecer activa");
  });
});

describe("shopping outbox safeguards", () => {
  it("rejects a full-list overflow before queueing while another list remains usable", async () => {
    const key = scope(),
      defaultId = key.split(":")[1]!,
      school = crypto.randomUUID();
    const full = Array.from({ length: 1000 }, (_, index) => ({
      ...item(`Product ${index}`),
      listId: defaultId,
    }));
    await acceptShoppingSnapshot(key, full, [
      defaultShoppingList(defaultId),
      { id: school, name: "School", archived: false, revision: 1 },
    ]);
    await expect(
      enqueueShopping(key, (rows) => [...rows, { ...item("Overflow"), listId: defaultId }]),
    ).rejects.toThrow("1000");
    expect((await readShopping(key)).queue).toHaveLength(0);
    await enqueueShopping(key, (rows) => [...rows, { ...item("Notebook"), listId: school }]);
    expect((await readShopping(key)).local).toHaveLength(1001);
  });
  it("keeps pending list changes when a malformed receipt duplicates an identifier", async () => {
    const key = scope(),
      school = crypto.randomUUID(),
      travel = crypto.randomUUID();
    await enqueueShoppingLists(key, (lists) => [
      ...lists,
      { id: school, name: "School", archived: false },
      { id: travel, name: "Travel", archived: false },
    ]);
    const duplicate = { id: school, name: "School", archived: false, position: 1, revision: 1 };
    await expect(
      flushShopping(
        key,
        key.split(":")[1]!,
        client(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(response({ items: [], lists: [duplicate, duplicate] })),
        ),
      ),
    ).rejects.toThrow("confirmar");
    expect((await readShopping(key)).queue).toHaveLength(1);
    expect((await readShopping(key)).lists).toHaveLength(3);
  });
});

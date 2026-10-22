import type { ShopItem } from "@/components/hub/data";
import type { Json, Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ShoppingContext {
  accountId: string;
  householdId: string;
  householdName: string;
  memberKey: string;
  verifiedAt: number;
}
type Change = {
  id: string;
  operation: "insert" | "update" | "delete";
  expected_revision: number | null;
  values: { name?: string; done?: boolean; position?: number };
};
type Mutation = { id: string; changes: Change[]; createdAt: number };
export interface ShoppingRecord {
  scope: string;
  base: ShopItem[];
  local: ShopItem[];
  queue: Mutation[];
  conflict: boolean;
}
type SavedRow = { id: string; name: string; done: boolean; position: number; revision: number };
const DB_NAME = "homehub-shopping-v1";
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;
export const shoppingScope = (context: ShoppingContext) =>
  `${context.accountId}:${context.householdId}:${context.memberKey}`;
export const ACTIVE_SHOPPING_ACCOUNT = "homehub-offline-shopping-account";
const blank = (scope: string): ShoppingRecord => ({
  scope,
  base: [],
  local: [],
  queue: [],
  conflict: false,
});
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!database)
    database = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(
          new Error(
            "El almacenamiento local no está disponible. Revisa los permisos del navegador.",
          ),
        );
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("lists", { keyPath: "scope" });
        request.result.createObjectStore("contexts", { keyPath: "accountId" });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        database = undefined;
        reject(
          new Error("Cierra otras pestañas de HomeHub para habilitar las compras sin conexión."),
        );
      };
    });
  return database;
}
const notify = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("homehub-shopping-changed"));
};
async function transaction<T>(
  store: "lists" | "contexts",
  key: string,
  update: (value: unknown) => { value?: unknown; result: T },
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    const request = objectStore.get(key);
    let result: T;
    let problem: unknown;
    request.onsuccess = () => {
      try {
        const next = update(request.result);
        result = next.result;
        if (next.value !== undefined) objectStore.put(next.value);
      } catch (reason) {
        problem = reason;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      notify();
      resolve(result);
    };
    tx.onabort = tx.onerror = () =>
      reject(
        problem ?? tx.error ?? new Error("No se pudieron guardar las compras en este dispositivo."),
      );
  });
}
export async function readShopping(scope: string): Promise<ShoppingRecord> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction("lists").objectStore("lists").get(scope);
    request.onsuccess = () => resolve(request.result ?? blank(scope));
    request.onerror = () => reject(request.error);
  });
}
export async function rememberShoppingContext(context: ShoppingContext): Promise<void> {
  await transaction("contexts", context.accountId, () => ({ value: context, result: undefined }));
}
export async function readShoppingContext(accountId: string): Promise<ShoppingContext | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction("contexts").objectStore("contexts").get(accountId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}
export function shoppingChanges(before: ShopItem[], after: ShopItem[]): Change[] {
  if (after.length > 1000) throw new Error("La lista admite hasta 1000 productos.");
  const names = new Set<string>();
  const previous = new Map(before.map((item) => [item.id, item]));
  const ids = new Set(after.map((item) => item.id));
  if (ids.size !== after.length) throw new Error("Hay productos duplicados.");
  const changes: Change[] = before
    .filter((item) => !ids.has(item.id))
    .map((item) => ({
      id: item.id,
      operation: "delete",
      expected_revision: item.revision ?? 1,
      values: {},
    }));
  let position = Math.max(-1, ...before.map((item, index) => item.position ?? index)) + 1;
  for (const item of after) {
    if (!item.name.trim() || item.name.trim().length > 150 || typeof item.done !== "boolean")
      throw new Error("Revisa el nombre del producto.");
    const key = item.name.trim().toLocaleLowerCase();
    if (names.has(key)) throw new Error("Ese producto ya está en la lista.");
    names.add(key);
    const old = previous.get(item.id);
    if (!old)
      changes.push({
        id: item.id,
        operation: "insert",
        expected_revision: null,
        values: { name: item.name.trim(), done: item.done, position: item.position ?? position++ },
      });
    else {
      const values: Change["values"] = {};
      if (old.name !== item.name) values.name = item.name.trim();
      if (old.done !== item.done) values.done = item.done;
      if (Object.keys(values).length)
        changes.push({
          id: item.id,
          operation: "update",
          expected_revision: old.revision ?? 1,
          values,
        });
    }
  }
  if (changes.length > 100) throw new Error("Guarda los cambios en grupos de hasta 100 productos.");
  return changes;
}
function apply(items: ShopItem[], changes: Change[], returned: SavedRow[] = []): ShopItem[] {
  const result = new Map(items.map((item) => [item.id, { ...item }]));
  const saved = new Map(returned.map((row) => [row.id, row]));
  for (const change of changes) {
    if (change.operation === "delete") result.delete(change.id);
    else {
      const old = result.get(change.id);
      const row = saved.get(change.id);
      const next = row
        ? {
            id: row.id,
            name: row.name,
            done: row.done,
            position: row.position,
            revision: row.revision,
          }
        : { id: change.id, name: "", done: false, ...old, ...change.values };
      result.set(change.id, next);
    }
  }
  return [...result.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
export async function enqueueShopping(
  scope: string,
  change: (items: ShopItem[]) => ShopItem[],
): Promise<ShoppingRecord> {
  return transaction("lists", scope, (value) => {
    const record = (value as ShoppingRecord | undefined) ?? blank(scope);
    if (record.queue.length >= 500)
      throw new Error("Sincroniza las compras antes de añadir más cambios.");
    const proposed = change(structuredClone(record.local));
    const changes = shoppingChanges(record.local, proposed);
    if (!changes.length) return { result: record };
    const next = {
      ...record,
      local: apply(record.local, changes),
      queue: [...record.queue, { id: crypto.randomUUID(), changes, createdAt: Date.now() }],
    };
    return { value: next, result: next };
  });
}
export async function acceptShoppingSnapshot(
  scope: string,
  items: ShopItem[],
): Promise<ShoppingRecord> {
  return transaction("lists", scope, (value) => {
    const record = (value as ShoppingRecord | undefined) ?? blank(scope);
    if (record.queue.length) return { result: record };
    const next = { ...record, base: items, local: items, conflict: false };
    return { value: next, result: next };
  });
}
const flushing = new Map<string, Promise<void>>();
export function flushShopping(
  scope: string,
  householdId: string,
  client: SupabaseClient<Database>,
  active: () => boolean = () => true,
): Promise<void> {
  const existing = flushing.get(scope);
  if (existing) return existing;
  const run = async () => {
    while (active() && (typeof navigator === "undefined" || navigator.onLine !== false)) {
      const record = await readShopping(scope);
      const mutation = record.queue[0];
      if (!mutation || record.conflict) return;
      if (Date.now() - mutation.createdAt >= MAX_AGE) {
        await transaction("lists", scope, (value) => ({
          value: { ...(value as ShoppingRecord), conflict: true },
          result: undefined,
        }));
        throw new Error(
          "Las compras llevan más de 14 días pendientes. Revisa los cambios antes de sincronizar.",
        );
      }
      const { data, error } = await client.rpc("sync_shopping", {
        _household: householdId,
        _mutation_id: mutation.id,
        _member_key: scope.split(":").at(-1)!,
        _changes: mutation.changes as unknown as Json,
      });
      if (error) {
        if (["40001", "23505"].includes(error.code))
          await transaction("lists", scope, (value) => ({
            value: { ...(value as ShoppingRecord), conflict: true },
            result: undefined,
          }));
        throw error;
      }
      if (!Array.isArray(data)) throw new Error("Respuesta de sincronización no válida.");
      const rows = data as unknown as SavedRow[];
      const expectedIds = new Set(
        mutation.changes.filter((c) => c.operation !== "delete").map((c) => c.id),
      );
      if (
        rows.length !== expectedIds.size ||
        rows.some(
          (row) =>
            !expectedIds.has(row.id) || !Number.isSafeInteger(row.revision) || row.revision < 1,
        )
      )
        throw new Error("No se pudo confirmar la sincronización de las compras.");
      await transaction("lists", scope, (value) => {
        const current = value as ShoppingRecord;
        if (current.queue[0]?.id !== mutation.id) return { result: undefined };
        const base = apply(current.base, mutation.changes, rows);
        const revisions = new Map(rows.map((row) => [row.id, row.revision]));
        const queue = current.queue.slice(1).map((entry) => ({
          ...entry,
          changes: entry.changes.map((c) =>
            c.operation !== "insert" && revisions.has(c.id)
              ? { ...c, expected_revision: revisions.get(c.id)! }
              : c,
          ),
        }));
        const local = queue.reduce((items, entry) => apply(items, entry.changes), base);
        return { value: { ...current, base, local, queue }, result: undefined };
      });
    }
  };
  const job = run().finally(() => flushing.delete(scope));
  flushing.set(scope, job);
  return job;
}

/** Called only after the person chooses which version should win. Unrelated
 * server records are retained, and a new mutation ID binds the rebased payload. */
export async function resolveShoppingConflict(
  scope: string,
  remote: ShopItem[],
  keepLocal: boolean,
): Promise<ShoppingRecord> {
  return transaction("lists", scope, (value) => {
    const record = (value as ShoppingRecord | undefined) ?? blank(scope);
    let desired = structuredClone(remote);
    const aliases = new Map<string, string>();
    if (keepLocal) {
      for (const mutation of record.queue)
        for (const c of mutation.changes) {
          let id = aliases.get(c.id) ?? c.id;
          const localItem = record.local.find((item) => item.id === id);
          if (c.operation === "insert") {
            const duplicate = desired.find(
              (item) =>
                item.name.trim().toLocaleLowerCase() === c.values.name?.trim().toLocaleLowerCase(),
            );
            if (duplicate) {
              id = duplicate.id;
              aliases.set(c.id, duplicate.id);
            }
          }
          if (c.operation === "delete") desired = desired.filter((item) => item.id !== id);
          else if (desired.some((item) => item.id === id))
            desired = desired.map((item) => (item.id === id ? { ...item, ...c.values } : item));
          else if (localItem) {
            const { revision: _ignored, ...rest } = localItem;
            desired.push({ ...rest, ...c.values });
          }
        }
    }
    const changes = shoppingChanges(remote, desired);
    const next: ShoppingRecord = {
      scope,
      base: remote,
      local: desired,
      conflict: false,
      queue: changes.length ? [{ id: crypto.randomUUID(), changes, createdAt: Date.now() }] : [],
    };
    return { value: next, result: next };
  });
}

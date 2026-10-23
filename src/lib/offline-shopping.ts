import type { ShopItem, ShoppingList } from "@/components/hub/data";
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
  values: { name?: string; done?: boolean; position?: number; list_id?: string };
};
type ListChange = {
  id: string;
  operation: "insert" | "update";
  expected_revision: number | null;
  values: { name?: string; archived?: boolean; position?: number };
};
type Mutation = { id: string; changes: Change[]; listChanges?: ListChange[]; createdAt: number };
export interface ShoppingRecord {
  scope: string;
  base: ShopItem[];
  local: ShopItem[];
  queue: Mutation[];
  conflict: boolean;
  baseLists?: ShoppingList[];
  lists?: ShoppingList[];
}
type SavedRow = {
  id: string;
  name: string;
  done: boolean;
  position: number;
  revision: number;
  list_id?: string;
};
type SavedList = {
  id: string;
  name: string;
  archived: boolean;
  position: number;
  revision: number;
};
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
  lists: [defaultShoppingList(scope.split(":")[1]!)],
  baseLists: [defaultShoppingList(scope.split(":")[1]!)],
});
export const defaultShoppingList = (householdId: string): ShoppingList => ({
  id: householdId,
  name: "Groceries",
  archived: false,
  position: 0,
  revision: 1,
});
export const shoppingListId = (item: ShopItem, householdId: string) => item.listId ?? householdId;
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
export function shoppingChanges(before: ShopItem[], after: ShopItem[], defaultId = ""): Change[] {
  if (after.length > 20000)
    throw new Error("Sincroniza o archiva compras antes de añadir más productos.");
  const names = new Set<string>();
  const listCounts = new Map<string, number>();
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
    const listId = item.listId ?? defaultId;
    const count = (listCounts.get(listId) ?? 0) + 1;
    if (count > 1000) throw new Error("Cada lista admite hasta 1000 productos.");
    listCounts.set(listId, count);
    if (!item.name.trim() || item.name.trim().length > 150 || typeof item.done !== "boolean")
      throw new Error("Revisa el nombre del producto.");
    const key = `${item.listId ?? defaultId}:${item.name.trim().toLocaleLowerCase()}`;
    if (names.has(key)) throw new Error("Ese producto ya está en la lista.");
    names.add(key);
    const old = previous.get(item.id);
    if (!old)
      changes.push({
        id: item.id,
        operation: "insert",
        expected_revision: null,
        values: {
          name: item.name.trim(),
          done: item.done,
          position: item.position ?? position++,
          ...(item.listId ? { list_id: item.listId } : {}),
        },
      });
    else {
      const values: Change["values"] = {};
      if (old.name !== item.name) values.name = item.name.trim();
      if (old.done !== item.done) values.done = item.done;
      if ((old.listId ?? defaultId) !== (item.listId ?? defaultId))
        values.list_id = item.listId ?? defaultId;
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
      const { list_id: changedList, ...values } = change.values;
      const row = saved.get(change.id);
      const next = row
        ? {
            id: row.id,
            name: row.name,
            done: row.done,
            position: row.position,
            revision: row.revision,
            ...(row.list_id ? { listId: row.list_id } : {}),
          }
        : {
            id: change.id,
            name: "",
            done: false,
            ...old,
            ...values,
            ...(changedList ? { listId: changedList } : {}),
          };
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
    const changes = shoppingChanges(record.local, proposed, scope.split(":")[1]);
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
  lists?: ShoppingList[],
): Promise<ShoppingRecord> {
  return transaction("lists", scope, (value) => {
    const record = (value as ShoppingRecord | undefined) ?? blank(scope);
    if (record.queue.length) return { result: record };
    const next = {
      ...record,
      base: items,
      local: items,
      conflict: false,
      ...(lists ? { lists, baseLists: lists } : {}),
    };
    return { value: next, result: next };
  });
}

function listChanges(before: ShoppingList[], after: ShoppingList[]): ListChange[] {
  if (after.length > 20) throw new Error("Puedes tener hasta 20 listas, incluidas las archivadas.");
  if (
    new Set(after.map((list) => list.id)).size !== after.length ||
    new Set(after.map((list) => list.name.trim().toLocaleLowerCase())).size !== after.length
  )
    throw new Error("Ya existe una lista con ese nombre.");
  if (before.some((old) => !after.some((list) => list.id === old.id)))
    throw new Error("Archiva la lista para conservar sus productos.");
  const changes: ListChange[] = [];
  for (const list of after) {
    if (!list.name.trim() || list.name.trim().length > 80)
      throw new Error("El nombre de la lista debe tener entre 1 y 80 caracteres.");
    const old = before.find((row) => row.id === list.id);
    if (!old)
      changes.push({
        id: list.id,
        operation: "insert",
        expected_revision: null,
        values: {
          name: list.name.trim(),
          archived: list.archived,
          position: list.position ?? after.indexOf(list),
        },
      });
    else {
      const values: ListChange["values"] = {};
      if (old.name !== list.name) values.name = list.name.trim();
      if (old.archived !== list.archived) values.archived = list.archived;
      if (Object.keys(values).length)
        changes.push({
          id: list.id,
          operation: "update",
          expected_revision: old.revision ?? 1,
          values,
        });
    }
  }
  return changes;
}
function applyLists(
  lists: ShoppingList[],
  changes: ListChange[],
  returned: SavedList[] = [],
): ShoppingList[] {
  const result = new Map(lists.map((list) => [list.id, list]));
  for (const change of changes) {
    const saved = returned.find((list) => list.id === change.id);
    result.set(
      change.id,
      saved ?? {
        id: change.id,
        name: "",
        archived: false,
        ...result.get(change.id),
        ...change.values,
      },
    );
  }
  return [...result.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
export async function enqueueShoppingLists(
  scope: string,
  update: (lists: ShoppingList[]) => ShoppingList[],
) {
  return transaction("lists", scope, (value) => {
    const record = (value as ShoppingRecord | undefined) ?? blank(scope);
    const lists = record.lists ?? blank(scope).lists!;
    const desired = update(structuredClone(lists));
    const defaultId = scope.split(":")[1];
    if (desired.some((list) => list.id === defaultId && list.archived))
      throw new Error("La lista inicial se puede renombrar, pero debe permanecer activa.");
    if (record.queue.length >= 500)
      throw new Error("Sincroniza tus compras antes de añadir más cambios.");
    const changes = listChanges(lists, desired);
    if (!changes.length) return { result: record };
    const next = {
      ...record,
      lists: applyLists(lists, changes),
      baseLists: record.baseLists ?? lists,
      queue: [
        ...record.queue,
        { id: crypto.randomUUID(), changes: [], listChanges: changes, createdAt: Date.now() },
      ],
    };
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
      const args = {
        _household: householdId,
        _mutation_id: mutation.id,
        _member_key: scope.split(":").at(-1)!,
        _changes: mutation.changes as unknown as Json,
      };
      const bundle = !!mutation.listChanges?.length;
      const { data, error } = bundle
        ? await client.rpc("sync_shopping_lists", {
            ...args,
            _list_changes: mutation.listChanges as unknown as Json,
          })
        : await client.rpc("sync_shopping", args);
      if (error) {
        if (["40001", "23505"].includes(error.code))
          await transaction("lists", scope, (value) => ({
            value: { ...(value as ShoppingRecord), conflict: true },
            result: undefined,
          }));
        throw error;
      }
      const receipt = data as unknown as { items?: SavedRow[]; lists?: SavedList[] };
      const rows = (bundle ? receipt?.items : data) as SavedRow[];
      const returnedLists = bundle ? receipt?.lists : [];
      if (!Array.isArray(rows) || !Array.isArray(returnedLists))
        throw new Error("Respuesta de sincronización no válida.");
      const expectedIds = new Set(
        mutation.changes.filter((c) => c.operation !== "delete").map((c) => c.id),
      );
      if (
        rows.length !== expectedIds.size ||
        new Set(rows.map((row) => row.id)).size !== expectedIds.size ||
        rows.some(
          (row) =>
            !expectedIds.has(row.id) || !Number.isSafeInteger(row.revision) || row.revision < 1,
        )
      )
        throw new Error("No se pudo confirmar la sincronización de las compras.");
      const expectedLists = new Set(mutation.listChanges?.map((change) => change.id));
      if (
        returnedLists.length !== expectedLists.size ||
        new Set(returnedLists.map((row) => row.id)).size !== expectedLists.size ||
        returnedLists.some(
          (row) =>
            !expectedLists.has(row.id) || !Number.isSafeInteger(row.revision) || row.revision < 1,
        )
      )
        throw new Error("No se pudo confirmar la lista guardada.");
      await transaction("lists", scope, (value) => {
        const current = value as ShoppingRecord;
        if (current.queue[0]?.id !== mutation.id) return { result: undefined };
        const base = apply(current.base, mutation.changes, rows);
        const revisions = new Map(rows.map((row) => [row.id, row.revision]));
        const listRevisions = new Map(returnedLists.map((row) => [row.id, row.revision]));
        const queue = current.queue.slice(1).map((entry) => ({
          ...entry,
          changes: entry.changes.map((c) =>
            c.operation !== "insert" && revisions.has(c.id)
              ? { ...c, expected_revision: revisions.get(c.id)! }
              : c,
          ),
          ...(entry.listChanges
            ? {
                listChanges: entry.listChanges.map((c) =>
                  c.operation !== "insert" && listRevisions.has(c.id)
                    ? { ...c, expected_revision: listRevisions.get(c.id)! }
                    : c,
                ),
              }
            : {}),
        }));
        const local = queue.reduce((items, entry) => apply(items, entry.changes), base);
        const baseLists = applyLists(
          current.baseLists ?? blank(scope).baseLists!,
          mutation.listChanges ?? [],
          returnedLists,
        );
        const lists = queue.reduce(
          (value, entry) => applyLists(value, entry.listChanges ?? []),
          baseLists,
        );
        return { value: { ...current, base, local, queue, baseLists, lists }, result: undefined };
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
  remoteLists?: ShoppingList[],
): Promise<ShoppingRecord> {
  return transaction("lists", scope, (value) => {
    const record = (value as ShoppingRecord | undefined) ?? blank(scope);
    let desired = structuredClone(remote);
    const aliases = new Map<string, string>();
    const defaultId = scope.split(":")[1]!;
    const serverLists = remoteLists ?? record.baseLists ?? blank(scope).baseLists!;
    let desiredLists = structuredClone(serverLists);
    const listAliases = new Map<string, string>();
    if (keepLocal)
      for (const mutation of record.queue)
        for (const change of mutation.listChanges ?? []) {
          let id = listAliases.get(change.id) ?? change.id;
          if (change.operation === "insert") {
            const duplicate = desiredLists.find(
              (list) =>
                list.name.trim().toLocaleLowerCase() ===
                change.values.name?.trim().toLocaleLowerCase(),
            );
            if (duplicate) {
              id = duplicate.id;
              listAliases.set(change.id, id);
            }
          }
          desiredLists = applyLists(desiredLists, [{ ...change, id }]);
        }
    if (keepLocal) {
      for (const mutation of record.queue)
        for (const c of mutation.changes) {
          let id = aliases.get(c.id) ?? c.id;
          const localItem = record.local.find((item) => item.id === c.id);
          const listId =
            listAliases.get(c.values.list_id ?? localItem?.listId ?? defaultId) ??
            c.values.list_id ??
            localItem?.listId ??
            defaultId;
          const changed = { ...c.values, ...(c.values.list_id ? { listId } : {}) };
          if (c.operation === "insert") {
            const duplicate = desired.find(
              (item) =>
                shoppingListId(item, defaultId) === listId &&
                item.name.trim().toLocaleLowerCase() === c.values.name?.trim().toLocaleLowerCase(),
            );
            if (duplicate) {
              id = duplicate.id;
              aliases.set(c.id, duplicate.id);
            }
          }
          if (c.operation === "delete") desired = desired.filter((item) => item.id !== id);
          else if (desired.some((item) => item.id === id))
            desired = desired.map((item) => (item.id === id ? { ...item, ...changed } : item));
          else if (localItem) {
            const { revision: _ignored, ...rest } = localItem;
            desired.push({ ...rest, ...changed, ...(localItem.listId ? { listId } : {}) });
          }
          if (c.operation !== "delete")
            desiredLists = desiredLists.map((list) =>
              list.id === listId ? { ...list, archived: false } : list,
            );
        }
    }
    const changes = shoppingChanges(remote, desired, defaultId);
    const listEdits = listChanges(serverLists, desiredLists);
    const next: ShoppingRecord = {
      scope,
      base: remote,
      local: desired,
      conflict: false,
      baseLists: serverLists,
      lists: desiredLists,
      queue:
        changes.length || listEdits.length
          ? [
              {
                id: crypto.randomUUID(),
                changes,
                ...(listEdits.length ? { listChanges: listEdits } : {}),
                createdAt: Date.now(),
              },
            ]
          : [],
    };
    return { value: next, result: next };
  });
}

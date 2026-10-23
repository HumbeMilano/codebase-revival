import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import type { ShopItem, ShoppingList } from "@/components/hub/data";
import { readAllPages } from "@/lib/hub-db";
import {
  acceptShoppingSnapshot,
  enqueueShopping,
  enqueueShoppingLists,
  defaultShoppingList,
  flushShopping,
  readShopping,
  resolveShoppingConflict,
  shoppingScope,
  type ShoppingContext,
  type ShoppingRecord,
} from "@/lib/offline-shopping";
import type { PersistedSetter } from "@/lib/persisted-collection";

export function useOfflineShopping(
  context: ShoppingContext | null,
  client: SupabaseClient<Database>,
  allowSync = true,
) {
  const scope = context ? shoppingScope(context) : "";
  const householdId = context?.householdId ?? "";
  const [record, setRecord] = useState<ShoppingRecord | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const generation = useRef(0);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const load = useCallback(async () => {
    if (!scope) return;
    const result = await readShopping(scope);
    if (currentScope.current === scope) setRecord(result);
  }, [scope]);
  const sync = useCallback(async () => {
    if (!scope || !allowSync || navigator.onLine === false) return;
    const version = generation.current;
    setSyncing(true);
    try {
      await flushShopping(
        scope,
        householdId,
        client,
        () => version === generation.current && currentScope.current === scope,
      );
      if (currentScope.current === scope) setError("");
    } catch (reason) {
      if (currentScope.current === scope) {
        const code =
          reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
        setError(
          ["40001", "23505"].includes(code)
            ? "La lista cambió en otro dispositivo. Elige qué cambios conservar."
            : "Los cambios siguen guardados en este dispositivo. No se pudieron sincronizar todavía.",
        );
      }
    } finally {
      if (currentScope.current === scope) {
        setSyncing(false);
        await load().catch(() => {});
      }
    }
  }, [scope, householdId, client, allowSync, load]);
  useEffect(() => {
    if (!scope) return;
    generation.current++;
    setRecord(null);
    setError("");
    const changed = () => {
      void load().catch(() =>
        setError("El navegador no permite guardar las compras sin conexión."),
      );
    };
    changed();
    const channel =
      typeof window.BroadcastChannel === "function"
        ? new BroadcastChannel("homehub-shopping")
        : null;
    if (channel) channel.onmessage = changed;
    window.addEventListener("homehub-shopping-changed", changed);
    window.addEventListener("online", sync);
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void sync();
    }, 30_000);
    void sync();
    return () => {
      generation.current++;
      channel?.close();
      clearInterval(timer);
      window.removeEventListener("homehub-shopping-changed", changed);
      window.removeEventListener("online", sync);
    };
  }, [scope, load, sync]);
  const setItems: PersistedSetter<ShopItem[]> = useCallback(
    async (next) => {
      if (!scope) return false;
      try {
        const result = await enqueueShopping(scope, (items) =>
          typeof next === "function" ? next(items) : next,
        );
        if (currentScope.current === scope) {
          setRecord(result);
          setError("");
        }
        if (typeof window.BroadcastChannel === "function") {
          const channel = new BroadcastChannel("homehub-shopping");
          channel.postMessage(scope);
          channel.close();
        }
        void sync();
        return true;
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo guardar el cambio en este dispositivo.",
        );
        return false;
      }
    },
    [scope, sync],
  );
  const setLists: PersistedSetter<ShoppingList[]> = useCallback(
    async (next) => {
      if (!scope) return false;
      try {
        const result = await enqueueShoppingLists(scope, (lists) =>
          typeof next === "function" ? next(lists) : next,
        );
        if (currentScope.current === scope) {
          setRecord(result);
          setError("");
        }
        if (typeof window.BroadcastChannel === "function") {
          const channel = new BroadcastChannel("homehub-shopping");
          channel.postMessage(scope);
          channel.close();
        }
        void sync();
        return true;
      } catch (reason) {
        if (currentScope.current === scope)
          setError(reason instanceof Error ? reason.message : "No se pudo guardar la lista.");
        return false;
      }
    },
    [scope, sync],
  );
  const replace = useCallback(
    async (items: ShopItem[], lists?: ShoppingList[]) => {
      if (!scope) return;
      try {
        const next = await acceptShoppingSnapshot(scope, items, lists);
        if (currentScope.current === scope) setRecord(next);
        if (next.queue.length) void sync();
      } catch {
        if (currentScope.current === scope) {
          setRecord({ scope, base: items, local: items, queue: [], conflict: false });
          setError(
            "El almacenamiento local no está disponible. Puedes ver la lista, pero no guardar cambios en este navegador.",
          );
        }
      }
    },
    [scope, sync],
  );
  const resolve = useCallback(
    async (keepLocal: boolean) => {
      if (!scope || !allowSync || navigator.onLine === false) return;
      setSyncing(true);
      try {
        const [rows, listRows] = await Promise.all([
          readAllPages<Tables<"shopping_items">>((from, to) =>
            client
              .from("shopping_items")
              .select("*", { count: "exact" })
              .eq("household_id", householdId)
              .order("position")
              .order("id")
              .range(from, to),
          ),
          readAllPages<Tables<"shopping_lists">>((from, to) =>
            client
              .from("shopping_lists")
              .select("*", { count: "exact" })
              .eq("household_id", householdId)
              .order("position")
              .order("id")
              .range(from, to),
          ),
        ]);
        const remote = rows.map((r) => ({
          id: r.id,
          name: r.name,
          done: r.done,
          position: r.position,
          revision: r.revision,
          listId: r.list_id,
        }));
        const next = await resolveShoppingConflict(
          scope,
          remote,
          keepLocal,
          listRows.map((list) => ({
            id: list.id,
            name: list.name,
            archived: list.archived,
            position: list.position,
            revision: list.revision,
          })),
        );
        if (currentScope.current === scope) {
          setRecord(next);
          setError("");
        }
        void sync();
      } catch {
        setError("No se pudo cargar la lista actual. Tus cambios permanecen en este dispositivo.");
      } finally {
        setSyncing(false);
      }
    },
    [scope, allowSync, client, householdId, sync],
  );
  return {
    householdId,
    items: record?.local ?? [],
    lists: record?.lists ?? (householdId ? [defaultShoppingList(householdId)] : []),
    setItems,
    setLists,
    replace,
    pending: record?.queue.length ?? 0,
    conflict: record?.conflict ?? false,
    syncing,
    error,
    loading: !!scope && !record && !error,
    sync,
    resolve,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DashboardConflict,
  dashboardErrorMessage,
  dashboardLayoutSchema,
  dashboardScopeKey,
  dashboardSnapshotSchema,
  initialDashboardSnapshot,
  sameDashboardLayout,
  type DashboardLayout,
  type DashboardScope,
  type DashboardSnapshot,
} from "@/lib/dashboard-layout";

type Binding = {
  active: boolean;
  saving: boolean;
  request: number;
  load: () => Promise<DashboardSnapshot | null>;
  save: (layout: DashboardLayout, revision: number) => Promise<DashboardSnapshot | null>;
};
const readDevice = (key: string): DashboardSnapshot => {
  const text =
    localStorage.getItem(key) ??
    localStorage.getItem(
      key.replace("homehub-dashboard-device:v3:", "homehub-dashboard-device:v2:"),
    ) ??
    localStorage.getItem(
      key.replace("homehub-dashboard-device:v3:", "homehub-dashboard-device:v1:"),
    );
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    return initialDashboardSnapshot();
  }
  const parsed = dashboardSnapshotSchema.safeParse(value);
  return parsed?.success ? parsed.data : initialDashboardSnapshot();
};

export function useDashboardLayout(scope: DashboardScope, client: SupabaseClient<Database>) {
  const key = dashboardScopeKey(scope);
  const [snapshot, setSnapshot] = useState(initialDashboardSnapshot);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const binding = useRef<Binding | null>(null);
  const accountId = scope.kind === "account" ? scope.accountId : null;

  useEffect(() => {
    const operation: Binding = {
      active: true,
      saving: false,
      request: 0,
      load: async () => null,
      save: async () => null,
    };
    binding.current = operation;
    setSnapshot(initialDashboardSnapshot());
    setLoading(true);
    setSaving(false);
    setError("");

    operation.load = async () => {
      if (!operation.active || operation.saving) return null;
      const request = ++operation.request;
      try {
        let next: DashboardSnapshot;
        if (accountId) {
          const result = await client
            .from("dashboard_preferences")
            .select("layout,revision")
            .eq("user_id", accountId)
            .maybeSingle();
          if (result.error) throw result.error;
          next = result.data
            ? dashboardSnapshotSchema.parse(result.data)
            : initialDashboardSnapshot();
        } else next = readDevice(key);
        if (!operation.active || request !== operation.request) return null;
        setSnapshot(next);
        setError("");
        return next;
      } catch (reason) {
        if (operation.active && request === operation.request)
          setError(dashboardErrorMessage(reason));
        return null;
      } finally {
        if (operation.active && request === operation.request) setLoading(false);
      }
    };
    operation.save = async (value, revision) => {
      if (!operation.active || operation.saving) return null;
      operation.saving = true;
      operation.request++;
      setLoading(false);
      setSaving(true);
      setError("");
      try {
        const layout = dashboardLayoutSchema.parse(value);
        let next: DashboardSnapshot;
        if (accountId) {
          const result = await client.rpc("save_dashboard_layout", {
            _layout: layout,
            _expected_revision: revision,
          });
          if (result.error) throw result.error;
          const saved = result.data?.[0];
          if (!saved || saved.user_id !== accountId) throw new Error("Invalid dashboard receipt");
          next = dashboardSnapshotSchema.parse(saved);
        } else {
          const write = () => {
            if (!operation.active) throw new Error("Session changed");
            const current = readDevice(key);
            if (current.revision === revision + 1 && sameDashboardLayout(current.layout, layout))
              return current;
            if (current.revision !== revision) throw new DashboardConflict();
            const stored = { layout, revision: revision + 1 };
            localStorage.setItem(key, JSON.stringify(stored));
            return stored;
          };
          next = navigator.locks ? await navigator.locks.request(key, write) : write();
        }
        if (!operation.active) return null;
        setSnapshot(next);
        return next;
      } catch (reason) {
        if (operation.active) setError(dashboardErrorMessage(reason));
        return null;
      } finally {
        operation.saving = false;
        if (operation.active) setSaving(false);
      }
    };
    void operation.load();
    const reload = () => {
      if (document.visibilityState !== "hidden") void operation.load();
    };
    const storage = (event: StorageEvent) => {
      if (
        !accountId &&
        (event.key === key ||
          (!localStorage.getItem(key) &&
            ["v1", "v2"].some(
              (version) =>
                event.key ===
                key.replace("homehub-dashboard-device:v3:", `homehub-dashboard-device:${version}:`),
            )))
      )
        reload();
    };
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", reload);
    return () => {
      operation.active = false;
      operation.request++;
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [key, accountId, client]);

  const reload = useCallback(() => binding.current?.load() ?? Promise.resolve(null), []);
  const save = useCallback(
    (layout: DashboardLayout, revision: number) =>
      binding.current?.save(layout, revision) ?? Promise.resolve(null),
    [],
  );
  return { ...snapshot, loading, saving, error, reload, save };
}

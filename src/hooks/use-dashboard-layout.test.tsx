import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  dashboardScopeKey,
  defaultDashboardLayout,
  type DashboardLayout,
  type DashboardScope,
} from "@/lib/dashboard-layout";
import { useDashboardLayout } from "./use-dashboard-layout";

const chosen: DashboardLayout = { version: 1, widgets: [{ id: "notes", size: "wide" }] };
const row = (user_id: string, revision: number, layout = chosen) => ({ user_id, revision, layout });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};
const backend = () => {
  const read = vi.fn().mockResolvedValue({ data: null, error: null });
  const rpc = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle: read }));
  const from = vi.fn(() => ({ select: () => ({ eq }) }));
  const client = { from, rpc } as unknown as SupabaseClient<Database>;
  return { client, read, rpc, from, eq };
};
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("dashboard persistence", () => {
  it("keeps confirmed preferences on failure and updates only after an acknowledged save", async () => {
    const server = backend();
    const previous = defaultDashboardLayout();
    server.read.mockResolvedValue({ data: row("account-a", 3, previous), error: null });
    server.rpc.mockResolvedValueOnce({ data: null, error: { message: "Network failure" } });
    const pending = deferred<{ data: ReturnType<typeof row>[]; error: null }>();
    server.rpc.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() =>
      useDashboardLayout({ kind: "account", accountId: "account-a" }, server.client),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.save(chosen, 3)).toBeNull();
    });
    expect(result.current.layout).toEqual(previous);
    expect(result.current.revision).toBe(3);
    expect(result.current.error).toContain("Comprueba la conexión");
    let saving!: Promise<unknown>;
    act(() => {
      saving = result.current.save(chosen, 3);
    });
    expect(result.current.layout).toEqual(previous);
    expect(result.current.saving).toBe(true);
    await act(async () => {
      pending.resolve({ data: [row("account-a", 4)], error: null });
      await saving;
    });
    expect(result.current.layout).toEqual(chosen);
    expect(result.current.revision).toBe(4);
    expect(server.rpc).toHaveBeenLastCalledWith("save_dashboard_layout", {
      _layout: chosen,
      _expected_revision: 3,
    });
    expect(server.eq).toHaveBeenCalledWith("user_id", "account-a");
  });

  it("ignores an old account's late load after the identity changes", async () => {
    const server = backend();
    const old = deferred<{ data: ReturnType<typeof row>; error: null }>();
    server.read
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ data: row("account-b", 2, defaultDashboardLayout()), error: null });
    const { result, rerender } = renderHook(
      ({ accountId }) => useDashboardLayout({ kind: "account", accountId }, server.client),
      { initialProps: { accountId: "account-a" } },
    );
    rerender({ accountId: "account-b" });
    await waitFor(() => expect(result.current.revision).toBe(2));
    await act(async () => {
      old.resolve({ data: row("account-a", 9), error: null });
    });
    expect(result.current.revision).toBe(2);
    expect(result.current.layout).toEqual(defaultDashboardLayout());
  });

  it("does not apply a late save to the next account or redirect it to a new client", async () => {
    const first = backend(),
      second = backend();
    const pending = deferred<{ data: ReturnType<typeof row>[]; error: null }>();
    first.rpc.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ accountId, client }) => useDashboardLayout({ kind: "account", accountId }, client),
      { initialProps: { accountId: "account-a", client: first.client } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    let saving!: Promise<unknown>;
    act(() => {
      saving = result.current.save(chosen, 0);
    });
    rerender({ accountId: "account-b", client: second.client });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      pending.resolve({ data: [row("account-a", 1)], error: null });
      expect(await saving).toBeNull();
    });
    expect(result.current.revision).toBe(0);
    expect(result.current.layout).toEqual(defaultDashboardLayout());
    expect(second.rpc).not.toHaveBeenCalled();
  });

  it("keeps tablet layouts local, repairs malformed preferences and isolates members", async () => {
    const server = backend();
    const scope: DashboardScope = { kind: "device", householdId: "home", memberId: "child" };
    localStorage.setItem(dashboardScopeKey(scope), "{broken");
    const { result, rerender } = renderHook(
      ({ scope }) => useDashboardLayout(scope, server.client),
      { initialProps: { scope } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.save(chosen, 0)).not.toBeNull();
    });
    expect(JSON.parse(localStorage.getItem(dashboardScopeKey(scope))!)).toEqual({
      layout: chosen,
      revision: 1,
    });
    rerender({ scope: { kind: "device", householdId: "home", memberId: "adult" } });
    await waitFor(() => expect(result.current.revision).toBe(0));
    expect(result.current.layout).toEqual(defaultDashboardLayout());
    expect(server.from).not.toHaveBeenCalled();
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("does not claim a tablet layout was saved when browser storage is unavailable", async () => {
    const server = backend();
    const { result } = renderHook(() =>
      useDashboardLayout({ kind: "device", householdId: "home", memberId: "child" }, server.client),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await act(async () => {
      expect(await result.current.save(chosen, 0)).toBeNull();
    });
    expect(result.current.revision).toBe(0);
    expect(result.current.layout).toEqual(defaultDashboardLayout());
    expect(result.current.error).not.toBe("");
  });

  it("rejects a stale tablet editor instead of overwriting a newer window", async () => {
    const server = backend();
    const scope: DashboardScope = { kind: "device", householdId: "home", memberId: "child" };
    const { result } = renderHook(() => useDashboardLayout(scope, server.client));
    await waitFor(() => expect(result.current.loading).toBe(false));
    localStorage.setItem(dashboardScopeKey(scope), JSON.stringify({ layout: chosen, revision: 1 }));
    await act(async () => {
      expect(await result.current.save(defaultDashboardLayout(), 0)).toBeNull();
    });
    expect(result.current.error).toContain("otra ventana o dispositivo");
    expect(JSON.parse(localStorage.getItem(dashboardScopeKey(scope))!).layout).toEqual(chosen);
  });
});

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { mergeTourProgress, useGuidedTour, type TourProgress } from "./use-guided-tour";
const empty: TourProgress = { version: 1 as const, seen: [], dismissed: false };
function fixture(initial = empty) {
  let stored = { ...initial };
  const rpc = vi.fn(
    async (_name: string, args: { _seen?: string[]; _dismissed?: boolean; _restart?: boolean }) => {
      stored = args._restart
        ? { ...empty }
        : mergeTourProgress(stored, {
            ...empty,
            seen: (args._seen as typeof empty.seen) ?? [],
            dismissed: args._dismissed ?? false,
          });
      return { data: stored, error: null };
    },
  );
  const single = vi.fn(async () => ({ data: { onboarding_state: stored }, error: null }));
  const client = {
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  } as unknown as SupabaseClient<Database>;
  return { client, rpc, single };
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("guided tour preferences", () => {
  it("merges sections and keeps a skip when another device writes older progress", () => {
    expect(
      mergeTourProgress(
        { ...empty, seen: ["notes"], dismissed: true },
        { ...empty, seen: ["home", "notes"] },
      ),
    ).toEqual({ version: 1, seen: ["home", "notes"], dismissed: true });
  });
  it("keeps offline progress per account, syncs on reconnect and supports explicit replay", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const backend = fixture();
    const { result } = renderHook(() => useGuidedTour("adult-a", backend.client));
    await waitFor(() => expect(result.current.progress).toEqual(empty));
    act(() => result.current.seen("notes"));
    act(() => result.current.dismiss());
    expect(backend.rpc).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("homehub-tour:adult-a")!)).toMatchObject({
      seen: ["notes"],
      dismissed: true,
    });
    expect(localStorage.getItem("homehub-tour:adult-b")).toBeNull();
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(backend.rpc).toHaveBeenCalledWith("save_onboarding_progress", {
        _seen: ["notes"],
        _dismissed: true,
      }),
    );
    await act(() => result.current.restart());
    expect(result.current.progress).toEqual(empty);
  });
  it("ignores a late profile resolution after switching accounts", async () => {
    const first = fixture(),
      second = fixture();
    let resolve!: (value: unknown) => void;
    first.single.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done as typeof resolve;
        }),
    );
    const { result, rerender } = renderHook(({ id, client }) => useGuidedTour(id, client), {
      initialProps: { id: "adult-a", client: first.client },
    });
    rerender({ id: "adult-b", client: second.client });
    await waitFor(() => expect(result.current.progress).toEqual(empty));
    await act(async () =>
      resolve({
        data: { onboarding_state: { ...empty, seen: ["home"], dismissed: true } },
        error: null,
      }),
    );
    expect(result.current.progress).toEqual(empty);
    expect(first.rpc).not.toHaveBeenCalled();
  });
});

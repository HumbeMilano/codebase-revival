import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOUSEHOLD } from "@/components/hub/data";
import { useHouseholdPhotos } from "./household-photos";
const binding = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => binding.client }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};
const clientFor = (home: string) => {
  const state = {
    rows: [0, 1].map((position) => ({
      id: `p${position}`,
      path: `${home}/p${position}.png`,
      position,
    })),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  };
  state.rpc.mockImplementation(() => ({
    abortSignal: () => Promise.resolve({ data: state.rows, error: null }),
  }));
  state.functions.invoke.mockImplementation(() =>
    Promise.resolve({
      data: {
        photos: state.rows.map((row) => ({ ...row, url: `https://photos.invalid/${row.id}` })),
      },
      error: null,
    }),
  );
  return state;
};
const originalHome = HOUSEHOLD.id;
const urls = { create: vi.fn(), revoke: vi.fn() };
beforeEach(() => {
  HOUSEHOLD.id = "home-one";
  let index = 0;
  urls.create = vi.fn(() => `blob:photo-${++index}`);
  urls.revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: urls.create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: urls.revoke });
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode = () => Promise.resolve();
    },
  );
});
afterEach(() => {
  cleanup();
  window.dispatchEvent(new Event("homehub-db-invalidated"));
  HOUSEHOLD.id = originalHome;
  vi.unstubAllGlobals();
});
describe("private photo warm cache", () => {
  it("resumes an interrupted cold load immediately when the screen mounts again", async () => {
    const server = clientFor(HOUSEHOLD.id);
    server.rows = server.rows.slice(0, 1);
    const interrupted = deferred<unknown>();
    server.functions.invoke.mockReturnValueOnce(interrupted.promise);
    binding.client = server;
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("first", { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetcher);
    const first = renderHook(() => useHouseholdPhotos());
    expect(server.functions.invoke).toHaveBeenCalledTimes(1);
    first.unmount();
    const remount = renderHook(() => useHouseholdPhotos());
    await act(async () => interrupted.resolve({ data: { photos: [] }, error: null }));
    await waitFor(() => expect(remount.result.current.photos).toHaveLength(1));
    expect(server.functions.invoke).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("shows the first decoded image before slow later photos and reuses it immediately on relock", async () => {
    const server = clientFor(HOUSEHOLD.id);
    binding.client = server;
    const slow = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("first", { headers: { "Content-Type": "image/png" } }))
      .mockReturnValueOnce(slow.promise);
    vi.stubGlobal("fetch", fetcher);
    const first = renderHook(() => useHouseholdPhotos());
    await waitFor(() => expect(first.result.current.photos).toHaveLength(1));
    expect(first.result.current.photos[0]?.id).toBe("p0");
    expect(first.result.current.loading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(server.rpc).not.toHaveBeenCalled();
    await act(async () =>
      slow.resolve(new Response("second", { headers: { "Content-Type": "image/png" } })),
    );
    await waitFor(() => expect(first.result.current.photos).toHaveLength(2));
    const cached = first.result.current.photos[0]?.url;
    first.unmount();
    const relock = renderHook(() => useHouseholdPhotos());
    expect(relock.result.current.photos[0]?.url).toBe(cached);
    await waitFor(() => expect(server.rpc).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledTimes(2);
    server.rows = server.rows.slice(0, 1);
    act(() => window.dispatchEvent(new Event("homehub-photos-changed")));
    await waitFor(() => expect(relock.result.current.photos).toHaveLength(1));
    expect(urls.revoke).toHaveBeenCalled();
    server.rpc.mockImplementation(() => ({
      abortSignal: () => Promise.resolve({ data: null, error: { code: "42501" } }),
    }));
    act(() => window.dispatchEvent(new Event("homehub-photos-changed")));
    await waitFor(() => expect(relock.result.current.photos).toEqual([]));
    expect(relock.result.current.error).not.toBe("");
    act(() => window.dispatchEvent(new Event("homehub-db-invalidated")));
    expect(relock.result.current.photos).toEqual([]);
  });
  it("never publishes an old account download into another client or household", async () => {
    const old = clientFor(HOUSEHOLD.id);
    binding.client = old;
    const download = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(download.promise));
    const view = renderHook(() => useHouseholdPhotos());
    await waitFor(() => expect(old.functions.invoke).toHaveBeenCalled());
    HOUSEHOLD.id = "home-two";
    const next = clientFor(HOUSEHOLD.id);
    next.rows = [];
    binding.client = next;
    view.rerender();
    expect(view.result.current.photos).toEqual([]);
    await act(async () =>
      download.resolve(
        new Response("old-private-image", { headers: { "Content-Type": "image/png" } }),
      ),
    );
    await waitFor(() => expect(next.functions.invoke).toHaveBeenCalled());
    expect(view.result.current.photos).toEqual([]);
    expect(urls.create).not.toHaveBeenCalled();
  });
});

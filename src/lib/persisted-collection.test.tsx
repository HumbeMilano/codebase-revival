import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePersistedCollection, type SyncGuard } from "./persisted-collection";
import { addShoppingItem } from "./shopping";

describe("shopping persistence", () => {
  it("adds one product and writes once under React StrictMode", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const { result } = renderHook(() => usePersistedCollection<{ id: string }[]>([], sync, guard, vi.fn()), { wrapper: StrictMode });
    act(() => result.current[1]((prev) => [...prev, { id: crypto.randomUUID() }]));
    await act(async () => { await guard.queue; });
    expect(result.current[0]).toHaveLength(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0]?.[1]).toEqual(result.current[0]);
  });

  it("serializes rapid changes so a later update cannot overtake its insert", async () => {
    let release: (() => void) | undefined;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const sync = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined);
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const { result } = renderHook(() => usePersistedCollection<number[]>([], sync, guard, vi.fn()));
    act(() => { result.current[1]([1]); result.current[1]((prev) => [...prev, 2]); });
    await act(async () => { await Promise.resolve(); });
    expect(sync).toHaveBeenCalledTimes(1);
    release?.();
    await act(async () => { await guard.queue; });
    expect(sync).toHaveBeenNthCalledWith(2, [1], [1, 2]);
    expect(guard.pending).toBe(0);
  });

  it("keeps one product when its name is repeated with different case or spaces", () => {
    const items = [{ id: "one", name: "Leche", done: false }];
    expect(addShoppingItem(items, { id: "two", name: " leche ", done: false })).toBe(items);
    expect(addShoppingItem(items, { id: "three", name: "Pan", done: false })).toHaveLength(2);
  });
});
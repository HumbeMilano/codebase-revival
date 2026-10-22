import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePersistedCollection, type SyncGuard } from "./persisted-collection";
import { addShoppingItem } from "./shopping";

describe("shopping persistence", () => {
  it("adds one product and writes once under React StrictMode", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const { result } = renderHook(
      () => usePersistedCollection<{ id: string }[]>([], sync, guard, vi.fn()),
      { wrapper: StrictMode },
    );
    act(() => {
      void result.current[1]((prev) => [...prev, { id: crypto.randomUUID() }]);
    });
    await act(async () => {
      await guard.queue;
    });
    expect(result.current[0]).toHaveLength(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0]?.[1]).toEqual(result.current[0]);
  });

  it("serializes rapid changes so a later update cannot overtake its insert", async () => {
    let release: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const { result } = renderHook(() => usePersistedCollection<number[]>([], sync, guard, vi.fn()));
    act(() => {
      result.current[1]([1]);
      result.current[1]((prev) => [...prev, 2]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(1);
    release?.();
    await act(async () => {
      await guard.queue;
    });
    expect(sync).toHaveBeenNthCalledWith(2, [1], [1, 2]);
    expect(guard.pending).toBe(0);
  });

  it("keeps one product when its name is repeated with different case or spaces", () => {
    const items = [{ id: "one", name: "Leche", done: false }];
    expect(addShoppingItem(items, { id: "two", name: " leche ", done: false })).toBe(items);
    expect(addShoppingItem(items, { id: "three", name: "Pan", done: false })).toHaveLength(2);
  });
});
describe("confirmed persistence state", () => {
  it("reverts a failed insert and cancels edits based on that insert", async () => {
    let reject: ((reason: Error) => void) | undefined;
    const sync = vi.fn().mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const onError = vi.fn();
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const { result } = renderHook(() =>
      usePersistedCollection<{ id: string; done: boolean }[]>([], sync, guard, onError),
    );
    let inserted: Promise<boolean>;
    let edited: Promise<boolean>;
    act(() => {
      inserted = result.current[1]([{ id: "new", done: false }]);
      edited = result.current[1]([{ id: "new", done: true }]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      reject?.(new Error("offline"));
      await guard.queue;
    });
    expect(await inserted!).toBe(false);
    expect(await edited!).toBe(false);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toEqual([]);
    expect(result.current[3].error).toBeInstanceOf(Error);
    expect(onError).toHaveBeenCalledOnce();
    expect(guard.pending).toBe(0);
  });

  it("keeps a confirmed insert when a later edit fails", async () => {
    const sync = vi
      .fn()
      .mockResolvedValueOnce([{ id: "one", done: false, revision: 1 }])
      .mockRejectedValueOnce(new Error("conflict"));
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const { result } = renderHook(() =>
      usePersistedCollection<{ id: string; done: boolean; revision?: number }[]>(
        [],
        sync,
        guard,
        vi.fn(),
      ),
    );
    await act(async () => {
      expect(await result.current[1]([{ id: "one", done: false }])).toBe(true);
    });
    await act(async () => {
      expect(await result.current[1]((rows) => rows.map((row) => ({ ...row, done: true })))).toBe(
        false,
      );
    });
    expect(result.current[0]).toEqual([{ id: "one", done: false, revision: 1 }]);
  });

  it("allows independent collections to save after another collection fails", async () => {
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    const saving = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => ({
      first: usePersistedCollection<number[]>([], failing, guard, vi.fn()),
      second: usePersistedCollection<number[]>([], saving, guard, vi.fn()),
    }));
    await act(async () => {
      const failed = result.current.first[1]([1]);
      const succeeded = result.current.second[1]([2]);
      expect(await failed).toBe(false);
      expect(await succeeded).toBe(true);
    });
    expect(result.current.first[0]).toEqual([]);
    expect(result.current.second[0]).toEqual([2]);
  });

  it("does not write queued edits after unmount", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const guard: SyncGuard = { revision: 0, pending: 0, queue: Promise.resolve() };
    const { result, unmount } = renderHook(() =>
      usePersistedCollection<number[]>([], sync, guard, vi.fn()),
    );
    let operation: Promise<boolean>;
    act(() => {
      operation = result.current[1]([1]);
      unmount();
    });
    await act(async () => {
      expect(await operation!).toBe(false);
    });
    expect(sync).not.toHaveBeenCalled();
  });
});

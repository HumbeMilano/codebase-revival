import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecipes } from "./use-recipes";
import { HOUSEHOLD } from "@/components/hub/data";
import { emptyRecipe } from "@/lib/recipes";

const backend = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn(), client: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => backend.client }));
const hid = "10000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000091";
const content = {
  ...emptyRecipe(),
  name: "Picadillo",
  ingredients: [{ name: "Carne", quantity: "1", unit: "kg" }],
  steps: ["Cocinar."],
};
const row = {
  id,
  household_id: hid,
  content,
  archived: false,
  revision: 1,
  created_at: "2026-11-16T10:00:00Z",
  updated_at: "2026-11-16T10:00:00Z",
};
beforeEach(() => {
  HOUSEHOLD.id = hid;
  backend.read.mockReset();
  backend.rpc.mockReset();
  const query = { select: () => query, eq: () => query, order: () => query, limit: backend.read };
  backend.client = { from: () => query, rpc: backend.rpc };
});
afterEach(() => {
  cleanup();
  HOUSEHOLD.id = "";
});
describe("recipe request identity and refresh races", () => {
  it("does not let a pre-save read replace a newly confirmed recipe", async () => {
    let finish!: (result: unknown) => void;
    backend.read.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    backend.rpc.mockResolvedValue({ data: row, error: null });
    const hook = renderHook(() => useRecipes());
    await act(async () => {
      await hook.result.current.save(id, 0, content);
    });
    expect(hook.result.current.recipes).toEqual([row]);
    await act(async () => finish({ data: [], error: null }));
    expect(hook.result.current.recipes).toEqual([row]);
  });
  it("clears the cookbook on context invalidation and rejects a late write from the former client", async () => {
    backend.read.mockResolvedValue({ data: [row], error: null });
    let finish!: (result: unknown) => void;
    backend.rpc.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const hook = renderHook(() => useRecipes());
    await waitFor(() => expect(hook.result.current.recipes).toHaveLength(1));
    const pending = hook.result.current.save(id, 1, { ...content, name: "New name" });
    const failure = expect(pending).rejects.toThrow("sesión cambió");
    act(() => {
      backend.client = {};
      window.dispatchEvent(new Event("homehub-db-invalidated"));
    });
    await act(async () => finish({ data: { ...row, revision: 2 }, error: null }));
    await failure;
    expect(hook.result.current.recipes).toEqual([]);
  });
});

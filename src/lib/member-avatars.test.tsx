import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOUSEHOLD } from "@/components/hub/data";
import { useMemberAvatar } from "./member-avatars";
const binding = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/db", () => ({ db: () => binding.client }));
const path = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo.png";
const home = HOUSEHOLD.id;
let urls = 0;
const revoke = vi.fn();
const client = () => {
  const state = {
    rows: [{ member_key: "m_ana", path }],
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  };
  state.functions.invoke.mockImplementation(async () => ({
    data: { avatars: state.rows.map((r) => ({ ...r, url: `https://avatars.invalid/${r.path}` })) },
    error: null,
  }));
  state.rpc.mockImplementation(() => ({
    abortSignal: async () => ({ data: state.rows, error: null }),
  }));
  return state;
};
beforeEach(() => {
  HOUSEHOLD.id = "home";
  urls = 0;
  revoke.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => `blob:avatar-${++urls}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode = async () => {};
    },
  );
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async () => new Response("image", { headers: { "Content-Type": "image/png" } }),
      ),
  );
});
afterEach(() => {
  cleanup();
  window.dispatchEvent(new Event("homehub-db-invalidated"));
  HOUSEHOLD.id = home;
  vi.unstubAllGlobals();
});
describe("shared private member avatar cache", () => {
  it("updates every icon from one download and revokes replaced or removed photos", async () => {
    const server = client();
    binding.client = server;
    const a = renderHook(() => useMemberAvatar("m_ana")),
      b = renderHook(() => useMemberAvatar("m_ana"));
    await waitFor(() => expect(a.result.current).toBe("blob:avatar-1"));
    expect(b.result.current).toBe(a.result.current);
    expect(server.functions.invoke).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    server.rows = [{ member_key: "m_ana", path: path.replace("photo", "new") }];
    act(() => window.dispatchEvent(new Event("homehub-avatars-changed")));
    await waitFor(() => expect(a.result.current).toBe("blob:avatar-2"));
    expect(b.result.current).toBe(a.result.current);
    expect(revoke).toHaveBeenCalledWith("blob:avatar-1");
    server.rows = [];
    act(() => window.dispatchEvent(new Event("homehub-avatars-changed")));
    await waitFor(() => expect(a.result.current).toBeUndefined());
    expect(b.result.current).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith("blob:avatar-2");
  });
  it("clears cached photos when authorization is denied", async () => {
    const server = client();
    binding.client = server;
    const view = renderHook(() => useMemberAvatar("m_ana"));
    await waitFor(() => expect(view.result.current).toBeTruthy());
    server.rpc.mockImplementation(() => ({
      abortSignal: async () => ({ data: null, error: { code: "42501" } }),
    }));
    act(() => window.dispatchEvent(new Event("homehub-avatars-changed")));
    await waitFor(() => expect(view.result.current).toBeUndefined());
    expect(revoke).toHaveBeenCalledWith("blob:avatar-1");
  });
  it("never carries a delayed image across accounts or households", async () => {
    const first = client();
    binding.client = first;
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const view = renderHook(() => useMemberAvatar("m_ana"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    HOUSEHOLD.id = "another-home";
    const next = client();
    next.rows = [];
    binding.client = next;
    view.rerender();
    await act(async () =>
      finish(new Response("old image", { headers: { "Content-Type": "image/png" } })),
    );
    expect(view.result.current).toBeUndefined();
    expect(urls).toBe(0);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearFinanceAccess,
  db,
  hasFinanceToken,
  invalidateDbContext,
  prepareDbContext,
  setFinanceToken,
} from "./db";

const api = vi.hoisted(() => ({
  connections: [] as Array<{ fetch: typeof fetch }>,
  rpc: vi.fn().mockResolvedValue({ error: null }),
  base: { marker: "account-auth" },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api.base }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: { global: { fetch: typeof fetch } }) => {
    api.connections.push(options.global);
    return { rpc: api.rpc, connection: api.connections.length };
  },
}));
afterEach(() => {
  invalidateDbContext();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
  api.connections.length = 0;
});
const prepare = (identity: string) =>
  prepareDbContext({ identity, accessToken: `token-${identity}`, deviceToken: null });

describe("session-bound household clients", () => {
  it("discards stale candidates without replacing a newer identity", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", request);
    const first = prepare("first");
    expect(db()).toBe(api.base);
    first.activate();
    const firstClient = db();
    const stale = prepare("stale");
    const latest = prepare("latest");
    expect(db()).toBe(firstClient);
    latest.activate();
    stale.discard();
    expect(db()).toBe(latest.client);
    await expect(api.connections[0]!.fetch("https://api.example.invalid", {})).rejects.toThrow(
      "sesión ha cambiado",
    );
    await expect(api.connections[1]!.fetch("https://api.example.invalid", {})).rejects.toThrow(
      "sesión ha cambiado",
    );
    await api.connections[2]!.fetch("https://api.example.invalid", {});
    expect(new Headers(request.mock.calls[0]![1].headers).get("Authorization")).toBe(
      "Bearer token-latest",
    );
  });
  it("uses financial authorization on the original client and revokes it before forgetting it", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", request);
    const scope = prepare("adult");
    scope.activate();
    const bound = db();
    setFinanceToken("finance-grant");
    expect(db()).toBe(bound);
    await api.connections[0]!.fetch("https://api.example.invalid", {});
    expect(new Headers(request.mock.calls[0]![1].headers).get("x-finance-token")).toBe(
      "finance-grant",
    );
    await clearFinanceAccess();
    expect(api.rpc).toHaveBeenCalledWith("revoke_finance_session", { _token: "finance-grant" });
    expect(hasFinanceToken()).toBe(false);
  });
  it("removes expired financial authorization from every request", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", request);
    prepare("adult").activate();
    setFinanceToken("temporary-grant");
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(hasFinanceToken()).toBe(false);
    await api.connections[0]!.fetch("https://api.example.invalid", {});
    expect(new Headers(request.mock.calls[0]![1].headers).has("x-finance-token")).toBe(false);
  });
});

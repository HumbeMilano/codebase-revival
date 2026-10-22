import { beforeEach, describe, expect, it, vi } from "vitest";
import { findByPin } from "./Kiosk";
const backend = vi.hoisted(() => ({ rpc: vi.fn(), grant: vi.fn() }));
vi.mock("@/lib/db", () => {
  const client = { rpc: backend.rpc };
  return { db: () => client, isDeviceMode: () => true, setFinanceToken: backend.grant };
});
beforeEach(() => vi.clearAllMocks());
describe("PIN cancellation", () => {
  it("revokes a late adult authorization when its dialog was cancelled", async () => {
    let finish!: (value: { data: string; error: null }) => void;
    const authorization = new Promise<{ data: string; error: null }>((resolve) => {
      finish = resolve;
    });
    backend.rpc.mockImplementation((name: string) => {
      if (name === "verify_pin")
        return Promise.resolve({
          data: [{ key: "adult", name: "Adult", role: "admin" }],
          error: null,
        });
      if (name === "authorize_finances") return authorization;
      return Promise.resolve({ data: null, error: null });
    });
    const controller = new AbortController();
    const result = findByPin("1234", true, controller.signal);
    await vi.waitFor(() =>
      expect(backend.rpc).toHaveBeenCalledWith("authorize_finances", { _pin: "1234" }),
    );
    controller.abort();
    finish({ data: "late-token", error: null });
    expect(await result).toBeUndefined();
    expect(backend.grant).not.toHaveBeenCalled();
    expect(backend.rpc).toHaveBeenCalledWith("revoke_finance_session", { _token: "late-token" });
  });
});

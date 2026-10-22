import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { findByPin, PinPad } from "./Kiosk";
const backend = vi.hoisted(() => ({ rpc: vi.fn(), grant: vi.fn() }));
vi.mock("@/lib/db", () => {
  const client = { rpc: backend.rpc };
  return { db: () => client, isDeviceMode: () => true, setFinanceToken: backend.grant };
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
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
describe("PIN keypad", () => {
  it("uses no editable field and accepts physical keyboard digits, erase and keypad taps", async () => {
    backend.rpc.mockResolvedValue({
      data: [{ key: "child", name: "Nico", role: "member" }],
      error: null,
    });
    const success = vi.fn();
    render(<PinPad onSuccess={success} onCancel={vi.fn()} />);
    const group = screen.getByRole("group", { name: "PIN de 4 números" });
    expect(document.querySelector("input, textarea, [contenteditable='true']")).toBeNull();
    expect(document.activeElement).toBe(group);
    fireEvent.keyDown(group, { key: "9" });
    fireEvent.keyDown(group, { key: "Backspace" });
    fireEvent.keyDown(group, { key: "5" });
    fireEvent.keyDown(group, { key: "6" });
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "8" }));
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(expect.objectContaining({ name: "Nico" })),
    );
    expect(backend.rpc).toHaveBeenCalledWith("verify_pin", {
      _pin: "5678",
      _admin_only: false,
    });
    expect(backend.grant).not.toHaveBeenCalled();
  });
});

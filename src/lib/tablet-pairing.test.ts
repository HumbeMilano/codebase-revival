import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveTabletPairing,
  clearPairingRequest,
  finishTabletPairing,
  pairingLink,
  readPairingLink,
  startTabletPairing,
} from "./tablet-pairing";
const fixture = vi.hoisted(() => ({
  user: vi.fn(),
  keys: vi.fn(),
  register: vi.fn(),
  verify: vi.fn(),
  session: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  createPairingClient: vi.fn(),
  supabase: {
    auth: {
      getUser: fixture.user,
      passkey: { list: fixture.keys },
      registerPasskey: fixture.register,
      getSession: fixture.session,
      signOut: fixture.signOut,
    },
  },
}));
vi.mock("./passkeys", () => ({ withVerifiedPasskey: fixture.verify }));
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
  sessionStorage.clear();
  clearPairingRequest();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());
describe("QR secret handoff", () => {
  it("sends only hashes and keeps the tablet claim key out of the QR and copied link", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const value = JSON.parse(String(init.body));
      return Response.json({
        id: value.id,
        name: value.name,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const [first, second] = await Promise.all([startTabletPairing(), startTabletPairing()]);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledOnce();
    const sent = String(fetcher.mock.calls[0]![1].body);
    expect(sent).not.toContain(first.claimSecret);
    expect(sent).not.toContain(first.approvalSecret);
    const link = new URL(pairingLink(first));
    expect(link.search).toBe("");
    expect(link.hash).toContain(first.approvalSecret);
    expect(link.href).not.toContain(first.claimSecret);
    expect(readPairingLink(link.hash)).toEqual({
      id: first.id,
      approvalSecret: first.approvalSecret,
    });
    expect(await startTabletPairing()).toEqual(first);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(readPairingLink("#invalid")).toBeNull();
  });
  it("offers first-use passkey registration on the phone before fresh verification", async () => {
    fixture.user.mockResolvedValue({ data: { user: { id: "adult" } }, error: null });
    fixture.keys.mockResolvedValue({ data: [], error: null });
    fixture.register.mockResolvedValue({ error: null });
    fixture.verify.mockResolvedValue(undefined);
    const signal = new AbortController().signal;
    await approveTabletPairing(
      { id: crypto.randomUUID(), approvalSecret: "a".repeat(64) },
      "adult",
      signal,
    );
    expect(fixture.register).toHaveBeenCalledWith({ options: { signal } });
    expect(fixture.verify).toHaveBeenCalledWith("adult", expect.any(Function), signal);
    expect(fixture.register.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.verify.mock.invocationCallOrder[0]!,
    );
  });
  it("does not begin passkey setup after the phone account changes", async () => {
    fixture.user.mockResolvedValue({ data: { user: { id: "other-user" } }, error: null });
    await expect(
      approveTabletPairing(
        { id: crypto.randomUUID(), approvalSecret: "a".repeat(64) },
        "adult",
        new AbortController().signal,
      ),
    ).rejects.toThrow("sesión cambió");
    expect(fixture.keys).not.toHaveBeenCalled();
    expect(fixture.verify).not.toHaveBeenCalled();
  });
  it("never persists a cancelled tablet claim", async () => {
    fixture.session.mockResolvedValue({ data: { session: null }, error: null });
    const controller = new AbortController();
    controller.abort();
    await expect(finishTabletPairing("a".repeat(64), controller.signal)).rejects.toThrow("aborted");
    expect(localStorage.getItem("homehub-device-token")).toBeNull();
  });
});

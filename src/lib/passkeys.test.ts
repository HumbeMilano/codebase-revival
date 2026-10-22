import { afterEach, describe, expect, it, vi } from "vitest";
import { withVerifiedPasskey } from "./passkeys";
const fixture = vi.hoisted(() => ({ start: vi.fn(), verify: vi.fn(), signOut: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  createPairingClient: () => ({
    auth: {
      passkey: { startAuthentication: fixture.start, verifyAuthentication: fixture.verify },
      signOut: fixture.signOut,
    },
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function prepare(userId = "adult") {
  vi.stubGlobal("PublicKeyCredential", class {});
  const get = vi.fn(async () => ({
    id: "key",
    rawId: new Uint8Array([1]).buffer,
    response: {
      clientDataJSON: new Uint8Array([1]).buffer,
      authenticatorData: new Uint8Array([1]).buffer,
      signature: new Uint8Array([1]).buffer,
      userHandle: null,
    },
    getClientExtensionResults: () => ({}),
  }));
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { get } });
  fixture.start.mockResolvedValue({
    data: { challenge_id: "challenge", options: { challenge: "AQ", rpId: "app.skendal.com" } },
    error: null,
  });
  fixture.verify.mockResolvedValue({ data: { session: { user: { id: userId } } }, error: null });
  fixture.signOut.mockResolvedValue({ error: null });
  return get;
}
describe("phone pairing verification", () => {
  it("requires user verification and only authorizes the same personal account", async () => {
    const get = prepare(),
      action = vi.fn().mockResolvedValue("approved");
    expect(await withVerifiedPasskey("adult", action)).toBe("approved");
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: expect.objectContaining({
          userVerification: "required",
          hints: ["client-device"],
        }),
      }),
    );
    expect(action).toHaveBeenCalledOnce();
    expect(fixture.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("refuses a different account's passkey and cleans up the temporary session", async () => {
    prepare("other-adult");
    const action = vi.fn();
    await expect(withVerifiedPasskey("adult", action)).rejects.toThrow("otra cuenta");
    expect(action).not.toHaveBeenCalled();
    expect(fixture.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not approve a cancelled operation after late authentication", async () => {
    prepare();
    const controller = new AbortController();
    controller.abort();
    const action = vi.fn();
    await expect(withVerifiedPasskey("adult", action, controller.signal)).rejects.toThrow(
      "aborted",
    );
    expect(action).not.toHaveBeenCalled();
  });
});

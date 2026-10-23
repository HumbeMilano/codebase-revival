// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTabletPairing, type WorkerEnv } from "../../workers/app";

const rate = vi.fn(async () => ({ success: true }));
const env: WorkerEnv = {
  ASSETS: {} as WorkerEnv["ASSETS"],
  SecreteStripe: "sk_test_fixture",
  BILLING_GATEWAY_KEY: "fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  SUPABASE_URL: "https://fixture.invalid",
  SUPABASE_PUBLIC_KEY: "sb_publishable_fixture",
  RESEND_API_KEY: "unused",
  TABLET_PAIRING_KEY: "server-only-fixture",
  TABLET_PAIRING_RATE: { limit: rate },
};
const data = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Tablet",
  claim_hash: "a".repeat(64),
  approval_hash: "b".repeat(64),
};
const request = (
  value: unknown = data,
  headers: Record<string, string> = {
    "CF-Connecting-IP": "192.0.2.1",
    Origin: "https://app.skendal.com",
  },
) =>
  new Request("https://app.skendal.com/api/tablet-pairing", {
    method: "POST",
    headers,
    body: JSON.stringify(value),
  });
afterEach(() => {
  vi.unstubAllGlobals();
  rate.mockReset().mockResolvedValue({ success: true });
});
describe("anonymous QR request gateway", () => {
  it("rejects other origins, missing trusted IPs and malformed requests before calling Supabase", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await createTabletPairing(request(data, { Origin: "https://other.invalid" }), env)).status,
    ).toBe(403);
    expect((await createTabletPairing(request(data, {}), env)).status).toBe(403);
    expect(
      (await createTabletPairing(request({ ...data, approval_hash: data.claim_hash }), env)).status,
    ).toBe(400);
    expect((await createTabletPairing(request({ name: "x".repeat(9000) }), env)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("enforces the trusted IP budget and keeps the server key out of client responses", async () => {
    rate.mockResolvedValueOnce({ success: false });
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        ...data,
        expires_at: new Date(Date.now() + 300000).toISOString(),
        private_key: "must not return",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect((await createTabletPairing(request(), env)).status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
    const response = await createTabletPairing(request(), env);
    const result = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(["expires_at", "id", "name"]);
    expect(JSON.stringify(result)).not.toContain(env.TABLET_PAIRING_KEY);
    expect(rate).toHaveBeenLastCalledWith({ key: "tablet:192.0.2.1" });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
      _server_key: env.TABLET_PAIRING_KEY,
      _claim_hash: data.claim_hash,
      _approval_hash: data.approval_hash,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

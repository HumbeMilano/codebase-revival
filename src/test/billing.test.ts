// @vitest-environment node
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billing, verifyStripeSignature } from "../../workers/billing";
import type { WorkerEnv } from "../../workers/app";
const env = {
  SUPABASE_URL: "https://backend.invalid",
  SUPABASE_PUBLIC_KEY: "sb_publishable_fixture",
  SecreteStripe: "sk_test_fixture_not_real",
  BILLING_GATEWAY_KEY: "test-gateway-" + "x".repeat(48),
  TABLET_PAIRING_RATE: { limit: vi.fn().mockResolvedValue({ success: true }) },
} as unknown as WorkerEnv;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const request = (path: string, body?: unknown) =>
  new Request("https://app.skendal.com/api/billing/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer fixture-auth",
      Origin: "https://app.skendal.com",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function signature(raw: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await webcrypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${raw}`),
  );
  return `t=${timestamp},v1=${Buffer.from(signed).toString("hex")}`;
}
describe("Stripe sandbox gateway", () => {
  it("requires a real server-checked platform role before touching Stripe", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ message: "Forbidden" }, 403));
    vi.stubGlobal("fetch", fetcher);
    const result = await billing(
      request("checkout", { request_id: crypto.randomUUID(), interval: "month" }),
      env,
    );
    expect(result.status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("admin_business_overview");
  });
  it("prices checkout from protected settings and sends no keys to the browser", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          plans: [
            {
              id: "pro",
              name: "Family Pro",
              amount_cents: 299,
              annual_amount_cents: 599,
              currency: "USD",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          id: "cs_test_fixture",
          url: "https://checkout.stripe.com/c/pay/test_fixture",
          livemode: false,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const id = crypto.randomUUID();
    const result = await billing(request("checkout", { request_id: id, interval: "year" }), env);
    expect(result.status).toBe(200);
    const data = await result.text();
    expect(data).not.toContain(env.SecreteStripe);
    expect(data).not.toContain(env.BILLING_GATEWAY_KEY);
    const form = new URLSearchParams(fetcher.mock.calls[1]?.[1]?.body);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("599");
    expect(form.get("line_items[0][price_data][recurring][interval]")).toBe("year");
    expect(form.get("metadata[environment]")).toBe("sandbox");
    expect(fetcher.mock.calls[1]?.[1]?.headers["Idempotency-Key"]).toBe(`homehub-sandbox:${id}`);
  });
  it("refuses client prices, unexpected origins and live credentials", async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      json({
        plans: [
          {
            id: "pro",
            name: "Family Pro",
            amount_cents: 299,
            annual_amount_cents: 599,
            currency: "USD",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await billing(
          request("checkout", { request_id: crypto.randomUUID(), interval: "month", amount: 1 }),
          env,
        )
      ).status,
    ).toBe(400);
    const foreign = new Request(
      request("checkout", { request_id: crypto.randomUUID(), interval: "month" }),
      { headers: { Authorization: "Bearer fixture-auth", Origin: "https://foreign.invalid" } },
    );
    expect((await billing(foreign, env)).status).toBe(403);
    const result = await billing(
      request("checkout", { request_id: crypto.randomUUID(), interval: "month" }),
      { ...env, SecreteStripe: "sk_live_fixture_not_real" },
    );
    expect(result.status).toBe(503);
    expect(fetcher.mock.calls.every((call) => String(call[0]).startsWith(env.SUPABASE_URL))).toBe(
      true,
    );
  });
  it("verifies signed raw bytes, rejects tampering and bounds replay time", async () => {
    const raw = JSON.stringify({ id: "evt_fixture", livemode: false });
    const secret = "whsec_fixture";
    const signed = await signature(raw, secret);
    expect(await verifyStripeSignature(raw, signed, secret)).toBe(true);
    expect(await verifyStripeSignature(raw + " ", signed, secret)).toBe(false);
    expect(
      await verifyStripeSignature(
        raw,
        await signature(raw, secret, Math.floor(Date.now() / 1000) - 301),
        secret,
      ),
    ).toBe(false);
    expect(await verifyStripeSignature(raw, signed, "different-secret")).toBe(false);
  });
  it("records only authenticated sandbox webhooks and lets Stripe retry a failed commit", async () => {
    const raw = JSON.stringify({
      id: "evt_fixture",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_fixture" } },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ webhook_secret: "whsec_fixture" }))
      .mockResolvedValueOnce(json({ received: true, duplicate: false, mode: "sandbox" }));
    vi.stubGlobal("fetch", fetcher);
    const event = new Request("https://app.skendal.com/api/billing/stripe-webhook", {
      method: "POST",
      body: raw,
      headers: { "stripe-signature": await signature(raw, "whsec_fixture") },
    });
    const response = await billing(event, env);
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body)._event.id).toBe("evt_fixture");
    fetcher.mockReset().mockResolvedValueOnce(json({ webhook_secret: "whsec_fixture" }));
    const invalid = new Request("https://app.skendal.com/api/billing/stripe-webhook", {
      method: "POST",
      body: raw,
      headers: { "stripe-signature": await signature(raw, "wrong-secret") },
    });
    expect((await billing(invalid, env)).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher
      .mockReset()
      .mockResolvedValueOnce(json({ webhook_secret: "whsec_fixture" }))
      .mockResolvedValueOnce(json({ message: "Offline" }, 503));
    expect(
      (
        await billing(
          new Request("https://app.skendal.com/api/billing/stripe-webhook", {
            method: "POST",
            body: raw,
            headers: { "stripe-signature": await signature(raw, "whsec_fixture") },
          }),
          env,
        )
      ).status,
    ).toBe(503);
  });
  it("rejects forged signatures before accessing the database when the signing binding is installed", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const raw = JSON.stringify({ id: "evt_fixture", livemode: false });
    const event = new Request("https://app.skendal.com/api/billing/stripe-webhook", {
      method: "POST",
      body: raw,
      headers: { "stripe-signature": await signature(raw, "wrong-secret") },
    });
    expect((await billing(event, { ...env, STRIPE_WEBHOOK_SECRET: "whsec_fixture" })).status).toBe(
      400,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verifies the private integration with an expired sandbox checkout and no card collection", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          account_id: "acct_fixture",
          webhook_id: "we_fixture",
          webhook_secret: "whsec_fixture",
        }),
      )
      .mockResolvedValueOnce(json({ id: "acct_fixture" }))
      .mockResolvedValueOnce(
        json({ plans: [{ id: "pro", name: "Family Pro", amount_cents: 299, currency: "USD" }] }),
      )
      .mockResolvedValueOnce(json({ id: "cs_test_fixture", livemode: false }))
      .mockResolvedValueOnce(json({ id: "cs_test_fixture", livemode: false, status: "open" }))
      .mockResolvedValueOnce(json({ id: "cs_test_fixture", livemode: false, status: "expired" }));
    vi.stubGlobal("fetch", fetcher);
    const probe = new Request("https://app.skendal.com/api/billing/setup?verify=1", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.BILLING_GATEWAY_KEY}` },
    });
    const result = await billing(probe, env);
    expect(result.status).toBe(200);
    const text = await result.text();
    expect(text).toContain("cs_test_fixture");
    expect(text).not.toContain("whsec_fixture");
    expect(text).not.toContain(env.SecreteStripe);
    expect(fetcher.mock.calls[5]?.[0]).toContain("/expire");
    expect(
      new URLSearchParams(fetcher.mock.calls[3]?.[1]?.body).get(
        "line_items[0][price_data][unit_amount]",
      ),
    ).toBe("299");
  });
  it("does not expose a bootstrap operation without the private gateway key", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await billing(request("setup", {}), env)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

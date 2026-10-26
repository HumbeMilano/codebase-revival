import { afterEach, describe, expect, it, vi } from "vitest";
import { subscriptions } from "../../workers/subscriptions";
import {
  reconcileSandboxEvent,
  reconcileSubscription,
  subscriptionSnapshot,
} from "../../workers/subscription-state";
import type { WorkerEnv } from "../../workers/app";
const env = {
  SecreteStripe: "sk_test_fixture",
  BILLING_GATEWAY_KEY: "gateway-fixture",
  SUPABASE_URL: "https://backend.example",
  SUPABASE_PUBLIC_KEY: "public-fixture",
  TABLET_PAIRING_RATE: { limit: async () => ({ success: true }) },
} as unknown as WorkerEnv;
const request = (path: string, body?: unknown, origin = "https://app.skendal.com") =>
  new Request(`https://app.skendal.com/api/subscriptions/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer user-token", Origin: origin },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const id = "11111111-1111-4111-8111-111111111111";
const attempt = {
  id,
  buyer_id: "user-a",
  household_id: "house-a",
  interval: "month",
  monthly_amount: 299,
  annual_amount: 599,
  currency: "USD",
  plan_revision: 1,
  expires_at: 1900000000,
  email: "qa@example.invalid",
  customer_id: "cus_fixture",
};
const current = {
  id: "sub_fixture",
  livemode: false,
  metadata: {
    application: "homehub",
    environment: "sandbox",
    attempt_id: id,
    household_id: "house-a",
  },
  customer: "cus_fixture",
  status: "active",
  cancel_at_period_end: false,
  latest_invoice: "in_fixture",
  items: {
    data: [
      {
        id: "si_fixture",
        quantity: 1,
        current_period_start: 1900000000,
        current_period_end: 1902700000,
        price: {
          id: "price_month",
          unit_amount: 299,
          currency: "usd",
          recurring: { interval: "month", interval_count: 1 },
        },
      },
    ],
  },
};
const json = (v: unknown, status = 200) => Response.json(v, { status });
afterEach(() => vi.unstubAllGlobals());
describe("household sandbox subscriptions", () => {
  it("requires an account and same-origin requests before any provider access", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await subscriptions(new Request("https://app.skendal.com/api/subscriptions/status"), env))
        .status,
    ).toBe(401);
    expect(
      (
        await subscriptions(
          request(
            "checkout",
            { request_id: id, interval: "month", acknowledge_sandbox: true },
            "https://evil.example",
          ),
          env,
        )
      ).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects browser-provided prices, customers and unacknowledged tests", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const data of [
      { request_id: id, interval: "month", acknowledge_sandbox: true, amount: 1 },
      { request_id: id, interval: "month", customer: "cus_victim" },
      { request_id: id, interval: "month" },
    ])
      expect((await subscriptions(request("checkout", data), env)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the protected price snapshot and caller-bound customer", async () => {
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      const path = new URL(input).pathname;
      if (path.endsWith("prepare_sandbox_checkout")) {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer user-token");
        return json(attempt);
      }
      if (path.endsWith("sandbox_catalog_resources"))
        return json({ catalog: { month_price_id: "price_month", year_price_id: "price_year" } });
      if (path.endsWith("checkout/sessions")) {
        const form = new URLSearchParams(String(init.body));
        expect(form.get("customer")).toBe("cus_fixture");
        expect(form.get("line_items[0][price]")).toBe("price_month");
        expect(form.has("line_items[0][price_data][unit_amount]")).toBe(false);
        expect(form.get("subscription_data[metadata][attempt_id]")).toBe(id);
        expect(form.get("success_url")).toBe(
          "https://app.skendal.com/subscription?checkout=returned",
        );
        return json({
          id: "cs_test_fixture",
          livemode: false,
          url: "https://checkout.stripe.com/c/pay/fixture",
        });
      }
      if (path.endsWith("save_sandbox_checkout")) return json(null);
      throw new Error(`Unexpected ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await subscriptions(
      request("checkout", { request_id: id, interval: "month", acknowledge_sandbox: true }),
      env,
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>)["mode"]).toBe("sandbox");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("reuses a persisted pending session without creating a second Stripe operation", async () => {
    const fetcher = vi.fn(async () =>
      json({
        ...attempt,
        session_id: "cs_test_previous",
        session_url: "https://checkout.stripe.com/c/pay/previous",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const response = await subscriptions(
      request("checkout", { request_id: id, interval: "month", acknowledge_sandbox: true }),
      env,
    );
    expect(((await response.json()) as Record<string, unknown>)["id"]).toBe("cs_test_previous");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a live key before creating even a customer", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await subscriptions(request("status"), { ...env, SecreteStripe: "sk_live_fixture" })).status,
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not grant Pro from a success query or an unverified checkout return", async () => {
    const value = { plan: "free", can_test: false, sandbox: null };
    const fetcher = vi.fn(async (input: string) =>
      json(input.endsWith("business_catalog") ? { plans: [] } : value),
    );
    vi.stubGlobal("fetch", fetcher);
    const response = await subscriptions(request("status?checkout=success&plan=pro"), env);
    expect(((await response.json()) as Record<string, unknown>)["plan"]).toBe("free");
    expect(fetcher.mock.calls.every(([input]) => !input.includes("stripe.com"))).toBe(true);
  });
  it("a nonbuyer cannot open another household member's portal", async () => {
    const fetcher = vi.fn(async () => json({ customer_id: null, subscription_id: null }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await subscriptions(request("portal", { acknowledge_sandbox: true }), env)).status,
    ).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe("subscription webhook reconciliation", () => {
  it("normalizes the current Stripe per-item period and rejects live or multi-item states", () => {
    expect(subscriptionSnapshot(current)).toMatchObject({
      period_start: 1900000000,
      period_end: 1902700000,
      amount: 299,
      currency: "USD",
      attempt_id: id,
    });
    expect(() => subscriptionSnapshot({ ...current, livemode: true })).toThrow();
    expect(() =>
      subscriptionSnapshot({
        ...current,
        items: { data: [...current.items.data, ...current.items.data] },
      }),
    ).toThrow();
    expect(() =>
      subscriptionSnapshot({ ...current, metadata: { application: "other" } }),
    ).toThrow();
  });
  it("fetches canonical provider state under a lease instead of replaying an old payload", async () => {
    const calls: string[] = [];
    const rpc = vi.fn(async (_env: WorkerEnv, name: string, args: unknown) => {
      calls.push(name);
      if (name === "claim_sandbox_reconciliation") return "lease-fixture";
      if (name === "capture_sandbox_subscription")
        expect(args).toMatchObject({ _lease: "lease-fixture", _snapshot: { status: "active" } });
      return null;
    });
    const stripe = vi.fn(async () => {
      calls.push("stripe-current");
      return current;
    });
    await reconcileSandboxEvent(
      {
        type: "customer.subscription.updated",
        data: { object: { ...current, status: "canceled" } },
      },
      env,
      { rpc, stripe },
    );
    expect(calls).toEqual([
      "claim_sandbox_reconciliation",
      "stripe-current",
      "capture_sandbox_subscription",
      "release_sandbox_reconciliation",
    ]);
  });
  it("releases the lease after provider failure so Stripe can retry", async () => {
    const rpc = vi.fn(async (_env: WorkerEnv, _name: string, _args: unknown) => "lease-fixture");
    const stripe = vi.fn(async () => {
      throw new Error("Network unavailable");
    });
    await expect(reconcileSubscription("sub_fixture", env, { rpc, stripe })).rejects.toThrow(
      "Network",
    );
    expect(rpc.mock.calls.at(-1)?.[1]).toBe("release_sandbox_reconciliation");
  });
  it("skips legacy integration checks while resolving modern invoice subscription references", async () => {
    const rpc = vi.fn(async () => null);
    const stripe = vi.fn(async () => current);
    await reconcileSandboxEvent(
      {
        type: "checkout.session.completed",
        data: { object: { metadata: { purpose: "integration_check" } } },
      },
      env,
      { rpc, stripe },
    );
    expect(rpc).not.toHaveBeenCalled();
    await reconcileSandboxEvent(
      {
        type: "invoice.payment_failed",
        data: { object: { parent: { subscription_details: { subscription: "sub_fixture" } } } },
      },
      env,
      { rpc, stripe },
    );
    expect(stripe).toHaveBeenCalledWith(env, "subscriptions/sub_fixture");
  });
});

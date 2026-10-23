// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendInvitation, type WorkerEnv } from "../../workers/app";

const env: WorkerEnv = {
  ASSETS: {} as WorkerEnv["ASSETS"],
  SecreteStripe: "sk_test_fixture",
  BILLING_GATEWAY_KEY: "fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  SUPABASE_URL: "https://fixture.invalid",
  SUPABASE_PUBLIC_KEY: "sb_publishable_fixture",
  RESEND_API_KEY: "fixture-private-server-key",
  TABLET_PAIRING_KEY: "fixture-private-pairing-key",
  TABLET_PAIRING_RATE: { limit: async () => ({ success: true }) },
};
const invite = {
  code: "A".repeat(32),
  delivery_id: "delivery-one",
  email: "ana@example.invalid",
  name: "Ana <script>",
  household_name: "Casa & familia",
};
const request = (
  data: unknown = { email: invite.email, name: invite.name, role: "member" },
  headers: Record<string, string> = { Authorization: "Bearer user-jwt" },
) =>
  new Request("https://app.skendal.com/api/invitations", {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
afterEach(() => vi.unstubAllGlobals());

describe("private invitation delivery", () => {
  it("rejects unauthenticated, cross-origin and oversized requests without contacting providers", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await sendInvitation(request({}, {}), env)).status).toBe(401);
    expect(
      (
        await sendInvitation(
          request({}, { Authorization: "Bearer user-jwt", Origin: "https://other.invalid" }),
          env,
        )
      ).status,
    ).toBe(403);
    expect((await sendInvitation(request({ name: "a".repeat(9000) }), env)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("checks adult permission before sending any email", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: "42501" }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await sendInvitation(request(), env)).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("escapes household data, defaults to a recipient-bound signup link and records provider acceptance", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(invite))
      .mockResolvedValueOnce(Response.json({ id: "provider-receipt" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await sendInvitation(request(), env);
    expect(await response.json()).toEqual({ sent: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const delivery = fetcher.mock.calls[1]![1];
    const message = JSON.parse(delivery.body);
    expect(message.to).toEqual([invite.email]);
    expect(message.html).toContain("Ana &lt;script&gt;");
    expect(message.html).toContain("Casa &amp; familia");
    expect(message.text).toContain(`/?invite=${invite.code}&email=ana%40example.invalid`);
    expect(delivery.headers["Idempotency-Key"]).toBe("homehub-invite-delivery-one");
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({
      _code: invite.code,
      _message_id: "provider-receipt",
      _delivery_id: "delivery-one",
    });
    expect(JSON.stringify(message)).not.toContain(env.RESEND_API_KEY);
  });
  it("keeps a provider failure pending and never reports a successful send", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(invite))
      .mockResolvedValueOnce(Response.json({ message: "Unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await sendInvitation(request(), env);
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ error: expect.stringContaining("pendiente") });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("warns when a sent email cannot be recorded instead of silently prompting a duplicate send", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(invite))
      .mockResolvedValueOnce(Response.json({ id: "accepted" }))
      .mockResolvedValueOnce(Response.json({}, { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await sendInvitation(request(), env)).json()).toMatchObject({
      sent: true,
      warning: expect.any(String),
    });
  });
});

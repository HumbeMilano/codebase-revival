import type { WorkerEnv } from "./app";
import { reconcileSandboxEvent } from "./subscription-state";

// Sandbox is intentionally isolated from household entitlements and real revenue.
export const STRIPE_API_VERSION = "2026-09-30.endive";
const WEBHOOK_URL = "https://app.skendal.com/api/billing/stripe-webhook";
const EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid response");
  return value as Record<string, unknown>;
};
export async function boundedText(source: Request | Response, limit = 262144) {
  const reader = source.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function gatewayEqual(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}
export class BillingFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
export async function billingRpc(
  env: WorkerEnv,
  name: string,
  args: unknown,
  authorization?: string,
) {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_PUBLIC_KEY,
    "Content-Type": "application/json",
  };
  if (authorization) headers["Authorization"] = authorization;
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const failure = record(JSON.parse(await boundedText(response)));
    throw new BillingFailure(String(failure["code"] ?? "backend"), response.status);
  }
  return JSON.parse(await boundedText(response));
}
export async function sandboxStripe(
  env: WorkerEnv,
  path: string,
  form?: URLSearchParams,
  idempotency?: string,
  method?: "DELETE",
) {
  const stripeKey = env.SecreteStripe?.trim() ?? "";
  if (!/^(sk|rk)_test_/.test(stripeKey)) throw new Error("Sandbox key required");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotency) headers["Idempotency-Key"] = idempotency;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: method ?? (form ? "POST" : "GET"),
    headers,
    ...(form ? { body: form.toString() } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const failure = record(JSON.parse(await boundedText(response)));
    const error = record(failure["error"]);
    throw new BillingFailure(String(error["code"] ?? error["type"] ?? "provider"), 503);
  }
  return record(JSON.parse(await boundedText(response)));
}
function stripeSignatures(header: string, now: number) {
  const parts = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
    return null;
  const signatures = parts.filter(
    ([key, value]) => key === "v1" && /^[a-f\d]{64}$/.test(value ?? ""),
  );
  if (!signatures.length || signatures.length > 5) return null;
  return { timestamp, signatures };
}
export async function verifyStripeSignature(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const parsed = stripeSignatures(header, now);
  if (!parsed) return false;
  const { timestamp, signatures } = parsed;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${timestamp}.${raw}`);
  for (const [, signature] of signatures) {
    const bytes = new Uint8Array(signature!.match(/../g)!.map((hex) => parseInt(hex, 16)));
    if (await crypto.subtle.verify("HMAC", key, bytes, data)) return true;
  }
  return false;
}
async function webhook(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const signature = request.headers.get("stripe-signature");
  if (!signature || signature.length > 2000 || !stripeSignatures(signature, Date.now()))
    return json({ error: "Firma de Stripe requerida." }, 400);
  if (!env.BILLING_GATEWAY_KEY) return json({ error: "Webhook pendiente de configurar." }, 503);
  try {
    const secret =
      env.STRIPE_WEBHOOK_SECRET ||
      record(
        await billingRpc(env, "stripe_sandbox_configuration", {
          _gateway_key: env.BILLING_GATEWAY_KEY,
        }),
      )["webhook_secret"];
    if (typeof secret !== "string") return json({ error: "Webhook pendiente de configurar." }, 503);
    const raw = await boundedText(request);
    if (!(await verifyStripeSignature(raw, signature, secret)))
      return json({ error: "Firma de Stripe no válida." }, 400);
    const event = record(JSON.parse(raw));
    if (event["livemode"] !== false)
      return json({ error: "Solo se admiten eventos de sandbox." }, 400);
    if (!EVENTS.includes(String(event["type"]))) return json({ received: true, ignored: true });
    const receipt = await billingRpc(env, "record_stripe_sandbox_event", {
      _gateway_key: env.BILLING_GATEWAY_KEY,
      _event: event,
    });
    // A duplicate event may be retrying after a failed reconciliation.
    await reconcileSandboxEvent(event, env, { rpc: billingRpc, stripe: sandboxStripe });
    return json(receipt);
  } catch {
    return json({ error: "No se pudo confirmar el evento. Stripe volverá a intentarlo." }, 503);
  }
}
function checkoutParameters(name: string, amount: number, currency: string, interval: string) {
  return new URLSearchParams({
    mode: "subscription",
    "line_items[0][price_data][currency]": currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][recurring][interval]": interval,
    "line_items[0][price_data][product_data][name]": name,
    "line_items[0][quantity]": "1",
    success_url: "https://app.skendal.com/admin?stripe=success",
    cancel_url: "https://app.skendal.com/admin?stripe=canceled",
    "metadata[application]": "homehub",
    "metadata[environment]": "sandbox",
    "subscription_data[metadata][application]": "homehub",
    "subscription_data[metadata][environment]": "sandbox",
  });
}
async function probeSandbox(env: WorkerEnv) {
  const catalog = record(await billingRpc(env, "business_catalog", {}));
  if (!Array.isArray(catalog["plans"])) throw new Error("Catalog unavailable");
  const plan = record(catalog["plans"].find((value) => record(value)["id"] === "pro"));
  const amount = plan["amount_cents"];
  if (!Number.isSafeInteger(amount) || Number(amount) <= 0 || typeof plan["currency"] !== "string")
    throw new Error("Configure a plan price first");
  const form = checkoutParameters(String(plan["name"]), Number(amount), plan["currency"], "month");
  form.set("metadata[purpose]", "integration_check");
  const created = await sandboxStripe(
    env,
    "checkout/sessions",
    form,
    "homehub-sandbox-integration-check-v1",
  );
  if (
    created["livemode"] !== false ||
    typeof created["id"] !== "string" ||
    !/^cs_test_[a-zA-Z0-9]+$/.test(created["id"])
  )
    throw new Error("Invalid sandbox probe");
  const session = await sandboxStripe(env, `checkout/sessions/${created["id"]}`);
  if (session["status"] === "open") {
    const expired = await sandboxStripe(
      env,
      `checkout/sessions/${created["id"]}/expire`,
      new URLSearchParams(),
    );
    if (expired["status"] !== "expired" || expired["livemode"] !== false)
      throw new Error("Probe not expired");
  } else if (session["status"] !== "expired") throw new Error("Unexpected sandbox probe state");
  return created["id"];
}
async function configuredResponse(
  request: Request,
  env: WorkerEnv,
  value: Record<string, unknown>,
) {
  const verify = new URL(request.url).searchParams.get("verify") === "1";
  return json({ ...value, ...(verify ? { probe_session_id: await probeSandbox(env) } : {}) });
}
async function setup(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !env.BILLING_GATEWAY_KEY ||
    token.length < 40 ||
    !(await gatewayEqual(token, env.BILLING_GATEWAY_KEY))
  )
    return json({ error: "Sin acceso." }, 403);
  try {
    const existing = await billingRpc(env, "stripe_sandbox_configuration", {
      _gateway_key: env.BILLING_GATEWAY_KEY,
    });
    const account = await sandboxStripe(env, "account");
    if (typeof account["id"] !== "string" || !account["id"].startsWith("acct_"))
      throw new Error("Invalid account");
    if (existing) {
      const configured = record(existing);
      if (configured["account_id"] !== account["id"]) throw new Error("Stripe account changed");
      return await configuredResponse(request, env, {
        connected: true,
        mode: "sandbox",
        account_id: account["id"],
        webhook_id: configured["webhook_id"],
      });
    }
    const form = new URLSearchParams({
      url: WEBHOOK_URL,
      description: "Skendal HomeHub · sandbox",
      api_version: STRIPE_API_VERSION,
    });
    for (const event of EVENTS) form.append("enabled_events[]", event);
    const created = await sandboxStripe(
      env,
      "webhook_endpoints",
      form,
      "homehub-sandbox-webhook-v1",
    );
    if (
      created["livemode"] !== false ||
      typeof created["id"] !== "string" ||
      typeof created["secret"] !== "string"
    )
      throw new Error("Invalid webhook receipt");
    const saved = await billingRpc(env, "configure_stripe_sandbox", {
      _gateway_key: env.BILLING_GATEWAY_KEY,
      _account_id: account["id"],
      _webhook_id: created["id"],
      _webhook_secret: created["secret"],
    });
    return await configuredResponse(request, env, { connected: true, ...record(saved) });
  } catch {
    return json(
      { error: "No se pudo conectar el sandbox de Stripe. Revisa la clave y sus permisos." },
      503,
    );
  }
}
export async function billing(request: Request, env: WorkerEnv) {
  const path = new URL(request.url).pathname;
  if (path === "/api/billing/stripe-webhook") return webhook(request, env);
  if (path === "/api/billing/setup") return setup(request, env);
  if (!["/api/billing/status", "/api/billing/checkout"].includes(path))
    return json({ error: "Ruta no encontrada." }, 404);
  if (request.method !== (path.endsWith("status") ? "GET" : "POST"))
    return json({ error: "Método no permitido." }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Origen no permitido." }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return json({ error: "Inicia sesión como administrador." }, 401);
  let overview: Record<string, unknown>;
  try {
    overview = record(await billingRpc(env, "admin_business_overview", {}, authorization));
  } catch {
    return json({ error: "Sin acceso a la administración." }, 403);
  }
  if (path.endsWith("status"))
    return json({
      provider: "stripe",
      mode: "sandbox",
      key_configured: !!env.SecreteStripe,
      gateway_configured: !!env.BILLING_GATEWAY_KEY,
      live_payments: false,
    });
  if (!env.SecreteStripe || !env.BILLING_GATEWAY_KEY)
    return json({ error: "Stripe está pendiente de conectar." }, 503);
  try {
    const data = record(JSON.parse(await boundedText(request, 2048)));
    if (
      !["month", "year"].includes(String(data["interval"])) ||
      typeof data["request_id"] !== "string" ||
      !/^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i.test(data["request_id"]) ||
      Object.keys(data).some((key) => !["interval", "request_id"].includes(key))
    )
      return json({ error: "Solicitud de suscripción no válida." }, 400);
    const rate = await env.TABLET_PAIRING_RATE.limit({
      key: `billing:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
    });
    if (!rate.success) return json({ error: "Espera un minuto antes de crear otra prueba." }, 429);
    const plans = overview["plans"];
    if (!Array.isArray(plans)) throw new Error("Plans unavailable");
    const plan = record(plans.find((value) => record(value)["id"] === "pro"));
    const amount = plan[data["interval"] === "year" ? "annual_amount_cents" : "amount_cents"];
    if (
      !Number.isSafeInteger(amount) ||
      Number(amount) <= 0 ||
      typeof plan["currency"] !== "string" ||
      !/^[A-Z]{3}$/.test(plan["currency"])
    )
      return json({ error: "Configura el precio y la moneda del plan." }, 409);
    const form = checkoutParameters(
      String(plan["name"]),
      Number(amount),
      plan["currency"],
      String(data["interval"]),
    );
    const session = await sandboxStripe(
      env,
      "checkout/sessions",
      form,
      `homehub-sandbox:${data["request_id"]}`,
    );
    if (
      session["livemode"] !== false ||
      typeof session["url"] !== "string" ||
      new URL(session["url"]).origin !== "https://checkout.stripe.com"
    )
      throw new Error("Invalid checkout receipt");
    return json({ url: session["url"], id: session["id"], mode: "sandbox" });
  } catch {
    return json(
      { error: "No se pudo crear la prueba de Stripe. Puedes volver a intentarlo." },
      503,
    );
  }
}

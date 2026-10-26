import type { WorkerEnv } from "./app";
import { billingRpc as rpc, sandboxStripe as stripe, boundedText, BillingFailure } from "./billing";
import { asObject as obj, objectId, reconcileSubscription } from "./subscription-state";
import { subscriptionCatalog } from "./subscription-catalog";
import { subscriptionQa } from "./subscription-qa";

const services = { rpc, stripe };
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
export const uuidPattern = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
const gateway = (env: WorkerEnv) => ({ _gateway_key: env.BILLING_GATEWAY_KEY });

async function checkout(env: WorkerEnv, authorization: string, data: Record<string, unknown>) {
  const attempt = obj(
    await rpc(
      env,
      "prepare_sandbox_checkout",
      { ...gateway(env), _request_id: data["request_id"], _interval: data["interval"] },
      authorization,
    ),
  );
  // A retry always uses the originally persisted snapshot, customer and session.
  if (attempt["session_url"])
    return { url: attempt["session_url"], id: attempt["session_id"], mode: "sandbox" };
  const catalog = await subscriptionCatalog(env, attempt);
  let customer = String(attempt["customer_id"] ?? "");
  if (!customer) {
    const created = await stripe(
      env,
      "customers",
      new URLSearchParams({
        email: String(attempt["email"]),
        "metadata[application]": "homehub",
        "metadata[environment]": "sandbox",
        "metadata[household_id]": String(attempt["household_id"]),
      }),
      `skendal-sandbox-customer:${attempt["household_id"]}:${attempt["buyer_id"]}`,
    );
    if (created["livemode"] !== false) throw new Error("Invalid sandbox customer");
    customer = String(created["id"]);
    await rpc(
      env,
      "save_sandbox_customer",
      { ...gateway(env), _attempt_id: attempt["id"], _customer_id: customer },
      authorization,
    );
  }
  const form = new URLSearchParams({
    customer,
    mode: "subscription",
    "line_items[0][price]": String(
      catalog[attempt["interval"] === "year" ? "year_price_id" : "month_price_id"],
    ),
    "line_items[0][quantity]": "1",
    success_url: "https://app.skendal.com/subscription?checkout=returned",
    cancel_url: "https://app.skendal.com/subscription?checkout=canceled",
    expires_at: String(attempt["expires_at"]),
    "payment_method_types[0]": "card",
  });
  for (const prefix of ["metadata", "subscription_data[metadata]"]) {
    form.set(`${prefix}[application]`, "homehub");
    form.set(`${prefix}[environment]`, "sandbox");
    form.set(`${prefix}[attempt_id]`, String(attempt["id"]));
    form.set(`${prefix}[household_id]`, String(attempt["household_id"]));
  }
  const session = await stripe(
    env,
    "checkout/sessions",
    form,
    `skendal-sandbox-checkout:${attempt["id"]}`,
  );
  if (
    session["livemode"] !== false ||
    typeof session["url"] !== "string" ||
    new URL(session["url"]).origin !== "https://checkout.stripe.com" ||
    !/^cs_test_/.test(String(session["id"]))
  )
    throw new Error("Invalid sandbox checkout");
  await rpc(
    env,
    "save_sandbox_checkout",
    {
      ...gateway(env),
      _attempt_id: attempt["id"],
      _session_id: session["id"],
      _session_url: session["url"],
    },
    authorization,
  );
  return { url: session["url"], id: session["id"], mode: "sandbox" };
}
async function refresh(env: WorkerEnv, authorization: string) {
  let control: Record<string, unknown>;
  try {
    control = obj(await rpc(env, "sandbox_billing_control", gateway(env), authorization));
  } catch (reason) {
    if (reason instanceof BillingFailure && reason.status < 500) return;
    throw reason;
  }
  if (!control["customer_id"]) return;
  let id = String(control["subscription_id"] ?? "");
  if (control["session_id"]) {
    const session = await stripe(env, `checkout/sessions/${control["session_id"]}`);
    if (session["livemode"] !== false || objectId(session["customer"]) !== control["customer_id"])
      throw new Error("Checkout customer mismatch");
    id = objectId(session["subscription"]) || id;
    if (session["status"] === "expired")
      await rpc(env, "expire_sandbox_checkout", { ...gateway(env), _session_id: session["id"] });
  }
  if (id) await reconcileSubscription(id, env, services);
}
export async function subscriptions(request: Request, env: WorkerEnv) {
  const path = new URL(request.url).pathname;
  if (
    ![
      "/api/subscriptions/status",
      "/api/subscriptions/checkout",
      "/api/subscriptions/portal",
      "/api/subscriptions/qa",
    ].includes(path)
  )
    return json({ error: "Ruta no encontrada." }, 404);
  if (request.method !== (path.endsWith("status") ? "GET" : "POST"))
    return json({ error: "Método no permitido." }, 405);
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return json({ error: "Origen no permitido." }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return json({ error: "Inicia sesión con tu cuenta personal." }, 401);
  if (!env.BILLING_GATEWAY_KEY || !/^(sk|rk)_test_/.test(env.SecreteStripe?.trim() ?? ""))
    return json({ error: "Sandbox pendiente de configurar." }, 503);
  try {
    if (path.endsWith("qa")) return json(await subscriptionQa(request, env, authorization));
    if (path.endsWith("status")) {
      const before = obj(await rpc(env, "my_household_plan", {}, authorization));
      let refreshing = false;
      if (before["can_test"]) {
        try {
          await refresh(env, authorization);
        } catch {
          refreshing = true;
        }
      }
      return json({
        ...obj(await rpc(env, "my_household_plan", {}, authorization)),
        catalog: await rpc(env, "business_catalog", {}),
        mode: "sandbox",
        refreshing,
      });
    }
    const rate = await env.TABLET_PAIRING_RATE.limit({
      key: `subscription:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
    });
    if (!rate.success) return json({ error: "Espera un minuto y vuelve a intentarlo." }, 429);
    const data = obj(JSON.parse(await boundedText(request, 2048)));
    if (path.endsWith("checkout")) {
      if (
        data["acknowledge_sandbox"] !== true ||
        !["month", "year"].includes(String(data["interval"])) ||
        !uuidPattern.test(String(data["request_id"])) ||
        Object.keys(data).some(
          (k) => !["acknowledge_sandbox", "interval", "request_id"].includes(k),
        )
      )
        return json({ error: "Solicitud de prueba no válida." }, 400);
      return json(await checkout(env, authorization, data));
    }
    if (
      Object.keys(data).some((k) => k !== "acknowledge_sandbox") ||
      data["acknowledge_sandbox"] !== true
    )
      return json({ error: "Confirma el modo de prueba." }, 400);
    const control = obj(await rpc(env, "sandbox_billing_control", gateway(env), authorization));
    if (!control["customer_id"])
      return json({ error: "Solo la persona titular puede gestionar la suscripción." }, 403);
    const resources = obj(await rpc(env, "sandbox_catalog_resources", gateway(env)));
    const catalog = obj(resources["catalog"]);
    const session = await stripe(
      env,
      "billing_portal/sessions",
      new URLSearchParams({
        customer: String(control["customer_id"]),
        configuration: String(catalog["portal_configuration_id"]),
        return_url: "https://app.skendal.com/subscription",
      }),
    );
    if (
      typeof session["url"] !== "string" ||
      new URL(session["url"]).origin !== "https://billing.stripe.com"
    )
      throw new Error("Invalid portal");
    return json({ url: session["url"], mode: "sandbox" });
  } catch (reason) {
    const code = reason instanceof BillingFailure ? reason.code : "unavailable";
    const forbidden =
      reason instanceof BillingFailure && ["42501", "PGRST301", "PGRST302"].includes(code);
    const conflict = reason instanceof BillingFailure && ["23505", "40001", "22023"].includes(code);
    return json(
      {
        error: forbidden
          ? "Esta cuenta no tiene acceso a las pruebas de cobro."
          : conflict
            ? "Ya hay una operación pendiente. Actualiza el estado antes de continuar."
            : "No se pudo confirmar la operación de sandbox. Puedes reintentar.",
        code,
      },
      forbidden ? 403 : conflict ? 409 : 503,
    );
  }
}

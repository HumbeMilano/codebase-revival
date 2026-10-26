// An expiring, management-issued capability can operate only its synthetic QA
// customer. This is intentionally not a general-purpose Stripe API proxy.
import type { WorkerEnv } from "./app";
import { billingRpc as rpc, sandboxStripe as stripe, boundedText, BillingFailure } from "./billing";
import { asObject as obj, objectId, reconcileSubscription } from "./subscription-state";
import { subscriptionCatalog } from "./subscription-catalog";
const uuid = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
const services = { rpc, stripe };
export async function subscriptionQa(request: Request, env: WorkerEnv, authorization: string) {
  const data = obj(JSON.parse(await boundedText(request, 2048)));
  const token = authorization.slice(7);
  if (
    token.length < 40 ||
    token.length > 200 ||
    Object.keys(data).some((k) => !["action", "request_id", "interval"].includes(k))
  )
    throw new Error("Invalid QA operation");
  const action = String(data["action"]);
  const args = { _gateway_key: env.BILLING_GATEWAY_KEY, _token: token };
  let context = obj(
    await rpc(env, "subscription_test_operation", { ...args, _action: action, _value: {} }),
  );
  const id = String(context["job_id"]);
  let customer = String(context["customer_id"] ?? "");
  let clock = String(context["test_clock_id"] ?? "");
  let subscription = String(context["subscription_id"] ?? "");
  const assureCustomer = async () => {
    if (!customer) throw new Error("QA customer is not ready");
    const value = await stripe(env, `customers/${customer}`);
    if (
      value["livemode"] !== false ||
      (context["household_id"] &&
        obj(value["metadata"])["household_id"] !== context["household_id"])
    )
      throw new Error("QA customer mismatch");
    return value;
  };
  const report = async () => {
    if (subscription) await reconcileSubscription(subscription, env, services);
    context = obj(
      await rpc(env, "subscription_test_operation", { ...args, _action: "inspect", _value: {} }),
    );
    const state = subscription ? await stripe(env, `subscriptions/${subscription}`) : null;
    const invoices = customer ? await stripe(env, `invoices?customer=${customer}&limit=10`) : null;
    const clockState = clock ? await stripe(env, `test_helpers/test_clocks/${clock}`) : null;
    // No passwords, capability tokens, session secrets or billing-gateway keys.
    return {
      ...context,
      provider_status: state?.["status"] ?? null,
      cancel_at_period_end: state?.["cancel_at_period_end"] ?? false,
      items: state?.["items"] ?? null,
      latest_invoice: objectId(state?.["latest_invoice"]),
      clock: clockState
        ? {
            id: clockState["id"],
            status: clockState["status"],
            frozen_time: clockState["frozen_time"],
          }
        : null,
      invoices: Array.isArray(invoices?.["data"])
        ? invoices["data"].map((v) => {
            const i = obj(v);
            return {
              id: i["id"],
              status: i["status"],
              paid: i["paid"],
              amount_paid: i["amount_paid"],
              amount_due: i["amount_due"],
              billing_reason: i["billing_reason"],
              livemode: i["livemode"],
            };
          })
        : [],
    };
  };
  if (action === "inspect") return report();
  if (action === "create_clock_subscription") {
    if (!uuid.test(String(data["request_id"])) || context["scenario"] === "checkout")
      throw new Error("Clock test required");
    const attempt = obj(
      await rpc(env, "prepare_clock_test_checkout", { ...args, _request_id: data["request_id"] }),
    );
    const catalog = await subscriptionCatalog(env, attempt);
    if (!clock) {
      const created = await stripe(
        env,
        "test_helpers/test_clocks",
        new URLSearchParams({
          frozen_time: String(Math.floor(Date.now() / 1000)),
          name: `Skendal QA ${id}`,
        }),
        `skendal-qa-clock:${id}`,
      );
      if (created["livemode"] !== false) throw new Error("Test clock required");
      clock = String(created["id"]);
      await rpc(env, "subscription_test_operation", {
        ...args,
        _action: "save_clock",
        _value: { clock_id: clock },
      });
    }
    if (!customer) {
      const created = await stripe(
        env,
        "customers",
        new URLSearchParams({
          test_clock: clock,
          email: String(attempt["email"]),
          source: "tok_visa",
          "metadata[application]": "homehub",
          "metadata[environment]": "sandbox",
          "metadata[household_id]": String(attempt["household_id"]),
        }),
        `skendal-qa-customer:${id}`,
      );
      if (created["livemode"] !== false) throw new Error("Test customer required");
      customer = String(created["id"]);
      await rpc(env, "save_clock_test_customer", { ...args, _customer_id: customer });
      context = { ...context, customer_id: customer };
    }
    if (!subscription) {
      const form = new URLSearchParams({
        customer,
        "items[0][price]": String(
          catalog[attempt["interval"] === "year" ? "year_price_id" : "month_price_id"],
        ),
        "items[0][quantity]": "1",
        "metadata[application]": "homehub",
        "metadata[environment]": "sandbox",
        "metadata[household_id]": String(attempt["household_id"]),
        "metadata[attempt_id]": String(attempt["id"]),
      });
      const created = await stripe(env, "subscriptions", form, `skendal-qa-subscription:${id}`);
      if (created["livemode"] !== false) throw new Error("Test subscription required");
      subscription = String(created["id"]);
    }
    return report();
  }
  if (action === "cleanup_provider") {
    try {
      if (clock) {
        const value = await stripe(env, `test_helpers/test_clocks/${clock}`);
        if (value["livemode"] !== false || value["name"] !== `Skendal QA ${id}`)
          throw new Error("QA clock mismatch");
        await stripe(env, `test_helpers/test_clocks/${clock}`, undefined, undefined, "DELETE");
      } else if (customer) {
        await assureCustomer();
        await stripe(env, `customers/${customer}`, undefined, undefined, "DELETE");
      }
    } catch (reason) {
      if (!(reason instanceof BillingFailure && reason.code === "resource_missing")) throw reason;
    }
    return {
      mode: "sandbox",
      deleted: true,
      customer_id: customer || null,
      clock_id: clock || null,
    };
  }
  await assureCustomer();
  if (action === "set_success_payment" || action === "set_failure_payment") {
    await stripe(
      env,
      `customers/${customer}`,
      new URLSearchParams({
        source: action === "set_success_payment" ? "tok_visa" : "tok_chargeCustomerFail",
      }),
    );
    // Recover an unpaid test invoice using the registered customer only.
    if (action === "set_success_payment" && subscription) {
      const current = await stripe(env, `subscriptions/${subscription}`);
      const invoiceId = objectId(current["latest_invoice"]);
      if (invoiceId) {
        const invoice = await stripe(env, `invoices/${invoiceId}`);
        if (invoice["status"] === "open")
          await stripe(env, `invoices/${invoiceId}/pay`, new URLSearchParams());
      }
    }
    return report();
  }
  if (action === "advance_clock" || action === "finalize_clock") {
    if (!clock || !subscription) throw new Error("Clock subscription required");
    const current = await stripe(env, `test_helpers/test_clocks/${clock}`);
    if (current["status"] === "ready") {
      const sub = await stripe(env, `subscriptions/${subscription}`);
      const items = obj(sub["items"])["data"] as unknown[];
      const end = Number(obj(items[0])["current_period_end"] ?? sub["current_period_end"]);
      // Advance just beyond the next renewal, then 2 hours to finalize invoices.
      const frozen = Number(current["frozen_time"]);
      const next =
        action === "finalize_clock" ? frozen + 7200 : end > frozen ? end + 60 : frozen + 7200;
      await stripe(
        env,
        `test_helpers/test_clocks/${clock}/advance`,
        new URLSearchParams({ frozen_time: String(next) }),
      );
    }
    return { advancing: true, clock_id: clock };
  }
  if (action === "change_interval") {
    if (!["month", "year"].includes(String(data["interval"])) || !subscription)
      throw new Error("Interval required");
    const sub = await stripe(env, `subscriptions/${subscription}`);
    const item = obj((obj(sub["items"])["data"] as unknown[])[0]);
    const resources = obj(
      await rpc(env, "sandbox_catalog_resources", { _gateway_key: env.BILLING_GATEWAY_KEY }),
    );
    const catalog = obj(resources["catalog"]);
    await stripe(
      env,
      `subscriptions/${subscription}`,
      new URLSearchParams({
        "items[0][id]": String(item["id"]),
        "items[0][price]": String(
          catalog[data["interval"] === "year" ? "year_price_id" : "month_price_id"],
        ),
        proration_behavior: "create_prorations",
      }),
    );
    return report();
  }
  if (["cancel_at_period_end", "resume", "cancel_now"].includes(action)) {
    if (!subscription) throw new Error("Subscription required");
    if (action === "cancel_now")
      await stripe(env, `subscriptions/${subscription}`, undefined, undefined, "DELETE");
    else
      await stripe(
        env,
        `subscriptions/${subscription}`,
        new URLSearchParams({ cancel_at_period_end: action === "resume" ? "false" : "true" }),
      );
    return report();
  }
  if (action === "refund_latest") {
    const intents = await stripe(env, `payment_intents?customer=${customer}&limit=10`);
    const intent = (intents["data"] as unknown[]).map(obj).find((v) => v["status"] === "succeeded");
    if (!intent || intent["livemode"] !== false)
      throw new Error("Successful test payment required");
    const refund = await stripe(
      env,
      "refunds",
      new URLSearchParams({ payment_intent: String(intent["id"]) }),
      `skendal-qa-refund:${intent["id"]}`,
    );
    return {
      mode: "sandbox",
      refund: { id: refund["id"], status: refund["status"], amount: refund["amount"] },
    };
  }

  throw new Error("QA operation not allowed");
}

import type { WorkerEnv } from "./app";

type ObjectValue = Record<string, unknown>;
export const asObject = (value: unknown): ObjectValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid data");
  return value as ObjectValue;
};
export const objectId = (value: unknown) =>
  typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? String(asObject(value)["id"] ?? "")
      : "";
export type SubscriptionServices = {
  rpc: (env: WorkerEnv, name: string, args: unknown, authorization?: string) => Promise<unknown>;
  stripe: (
    env: WorkerEnv,
    path: string,
    form?: URLSearchParams,
    idempotency?: string,
  ) => Promise<ObjectValue>;
};
const ownedMetadata = (value: ObjectValue) => {
  const metadata = asObject(value["metadata"] ?? {});
  return (
    metadata["application"] === "homehub" &&
    metadata["environment"] === "sandbox" &&
    typeof metadata["attempt_id"] === "string"
  );
};
export function subscriptionSnapshot(value: ObjectValue) {
  if (value["livemode"] !== false || !ownedMetadata(value))
    throw new Error("Unrelated subscription");
  const metadata = asObject(value["metadata"]);
  const items = asObject(value["items"])["data"];
  if (!Array.isArray(items) || items.length !== 1) throw new Error("Unexpected subscription items");
  const item = asObject(items[0]);
  const price = asObject(item["price"]);
  const recurring = asObject(price["recurring"]);
  if (
    item["quantity"] !== 1 ||
    recurring["interval_count"] !== 1 ||
    !["month", "year"].includes(String(recurring["interval"]))
  )
    throw new Error("Unexpected billing frequency");
  const periodEnd = item["current_period_end"] ?? value["current_period_end"];
  const scheduledAtEnd =
    value["cancel_at_period_end"] === true ||
    (typeof value["cancel_at"] === "number" && value["cancel_at"] === periodEnd);
  return {
    id: value["id"],
    livemode: false,
    customer_id: objectId(value["customer"]),
    attempt_id: metadata["attempt_id"],
    household_id: metadata["household_id"],
    price_id: price["id"],
    currency: String(price["currency"]).toUpperCase(),
    amount: price["unit_amount"],
    interval: recurring["interval"],
    status: value["status"],
    cancel_at_period_end: scheduledAtEnd,
    period_start: item["current_period_start"] ?? value["current_period_start"],
    period_end: periodEnd,
    latest_invoice: objectId(value["latest_invoice"]) || null,
  };
}
export async function reconcileSubscription(
  id: string,
  env: WorkerEnv,
  services: SubscriptionServices,
) {
  if (!/^sub_[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid subscription identity");
  const lease = await services.rpc(env, "claim_sandbox_reconciliation", {
    _gateway_key: env.BILLING_GATEWAY_KEY,
    _subscription_id: id,
  });
  try {
    // Fetch the current Stripe state under a lease: event arrival order cannot roll it back.
    const current = await services.stripe(env, `subscriptions/${id}`);
    if (current["livemode"] !== false) throw new Error("Live subscription rejected");
    if (!ownedMetadata(current)) return { ignored: true };
    return await services.rpc(env, "capture_sandbox_subscription", {
      _gateway_key: env.BILLING_GATEWAY_KEY,
      _lease: lease,
      _snapshot: subscriptionSnapshot(current),
    });
  } finally {
    await services.rpc(env, "release_sandbox_reconciliation", {
      _gateway_key: env.BILLING_GATEWAY_KEY,
      _subscription_id: id,
      _lease: lease,
    });
  }
}
export async function reconcileSandboxEvent(
  event: ObjectValue,
  env: WorkerEnv,
  services: SubscriptionServices,
) {
  const object = asObject(asObject(event["data"])["object"]);
  const type = String(event["type"]);
  // Legacy console integration checks have no attempt and do not grant any plan.
  if (type.startsWith("checkout.session.")) {
    if (!ownedMetadata(object)) return;
    if (type.endsWith("expired")) {
      await services.rpc(env, "expire_sandbox_checkout", {
        _gateway_key: env.BILLING_GATEWAY_KEY,
        _session_id: object["id"],
      });
      return;
    }
  }
  let id = type.startsWith("customer.subscription.")
    ? objectId(object)
    : objectId(object["subscription"]);
  if (!id && type.startsWith("invoice.")) {
    const parent = asObject(object["parent"] ?? {});
    id = objectId(asObject(parent["subscription_details"] ?? {})["subscription"]);
  }
  if (id) await reconcileSubscription(id, env, services);
}

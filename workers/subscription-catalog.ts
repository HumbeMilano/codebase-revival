import type { WorkerEnv } from "./app";
import { billingRpc as rpc, sandboxStripe as stripe } from "./billing";
import { asObject as obj } from "./subscription-state";
const gateway = (env: WorkerEnv) => ({ _gateway_key: env.BILLING_GATEWAY_KEY });
export async function subscriptionCatalog(env: WorkerEnv, attempt: Record<string, unknown>) {
  const revision = Number(attempt["plan_revision"]);
  const resources = obj(
    await rpc(env, "sandbox_catalog_resources", { ...gateway(env), _revision: revision }),
  );
  if (resources["catalog"]) return obj(resources["catalog"]);
  let product = String(resources["product_id"] ?? "");
  if (!product) {
    const created = await stripe(
      env,
      "products",
      new URLSearchParams({
        name: "Skendal Pro",
        "metadata[application]": "homehub",
        "metadata[environment]": "sandbox",
      }),
      "skendal-sandbox-product-v1",
    );
    if (created["livemode"] !== false) throw new Error("Invalid sandbox product");
    product = String(created["id"]);
  }
  const priceIds: string[] = [];
  for (const interval of ["month", "year"]) {
    const amount = Number(attempt[interval === "month" ? "monthly_amount" : "annual_amount"]);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid protected price");
    const price = await stripe(
      env,
      "prices",
      new URLSearchParams({
        product,
        currency: String(attempt["currency"]).toLowerCase(),
        unit_amount: String(amount),
        "recurring[interval]": interval,
        "metadata[application]": "homehub",
        "metadata[environment]": "sandbox",
      }),
      `skendal-sandbox-price:${revision}:${interval}`,
    );
    if (price["livemode"] !== false) throw new Error("Invalid sandbox price");
    priceIds.push(String(price["id"]));
  }
  const config = await stripe(
    env,
    "billing_portal/configurations",
    new URLSearchParams({
      "business_profile[headline]": "Skendal · Sandbox",
      "features[customer_update][enabled]": "true",
      "features[customer_update][allowed_updates][0]": "email",
      "features[invoice_history][enabled]": "true",
      "features[payment_method_update][enabled]": "true",
      "features[subscription_cancel][enabled]": "true",
      "features[subscription_cancel][mode]": "at_period_end",
      "features[subscription_update][enabled]": "true",
      "features[subscription_update][default_allowed_updates][0]": "price",
      "features[subscription_update][proration_behavior]": "create_prorations",
      "features[subscription_update][products][0][product]": product,
      "features[subscription_update][products][0][prices][0]": priceIds[0]!,
      "features[subscription_update][products][0][prices][1]": priceIds[1]!,
      default_return_url: "https://app.skendal.com/subscription",
      "metadata[application]": "homehub",
      "metadata[environment]": "sandbox",
    }),
    `skendal-sandbox-portal-config:${revision}`,
  );
  if (config["livemode"] !== false) throw new Error("Invalid sandbox portal");
  const value = {
    plan_revision: revision,
    product_id: product,
    month_price_id: priceIds[0],
    year_price_id: priceIds[1],
    monthly_amount: attempt["monthly_amount"],
    annual_amount: attempt["annual_amount"],
    currency: attempt["currency"],
    portal_configuration_id: config["id"],
  };
  await rpc(env, "save_sandbox_catalog", { ...gateway(env), _catalog: value });
  return value;
}

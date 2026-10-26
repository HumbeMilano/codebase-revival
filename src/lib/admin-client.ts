import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const actors = new WeakMap<
  SupabaseClient<Database>,
  { accessToken: string; active: () => boolean }
>();

/** Administration is independent of the currently opened household or tablet.
 * A stale form cannot send a request using the next signed-in account. */
export function createAdminClient(accessToken: string, active: () => boolean) {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  const client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `skendal-admin-${crypto.randomUUID()}`,
    },
    global: {
      fetch: (input, init) => {
        if (!active()) return Promise.reject(new Error("La sesión administrativa ha cambiado."));
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${accessToken}`);
        headers.delete("x-device-token");
        headers.delete("x-finance-token");
        return fetch(input, { ...init, headers });
      },
    },
  });
  actors.set(client, { accessToken, active });
  return client;
}

export async function requestAdminApi(
  client: SupabaseClient<Database>,
  path: "status" | "checkout",
  body?: unknown,
) {
  const actor = actors.get(client);
  if (!actor?.active()) throw new Error("La sesión administrativa ha cambiado.");
  const response = await fetch(`/api/billing/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${actor.accessToken}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!actor.active()) throw new Error("La sesión administrativa ha cambiado.");
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : "No se pudo conectar con Stripe.";
    throw new Error(message);
  }
  return value;
}

/** Billing also uses an immutable personal-account snapshot, never a tablet PIN. */
export async function requestSubscriptionApi(
  client: SupabaseClient<Database>,
  path: "status" | "checkout" | "portal",
  body?: unknown,
) {
  const actor = actors.get(client);
  if (!actor?.active()) throw new Error("La sesión ha cambiado. Vuelve a cargar.");
  const response = await fetch(`/api/subscriptions/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${actor.accessToken}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!actor.active()) throw new Error("La sesión ha cambiado. Vuelve a cargar.");
  const value: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : "No se pudo confirmar la operación.",
    );
  return value;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** A paired tablet has no account; it proves its household with a device token header checked by RLS. */
export const DEVICE_KEY = "homehub-device-token";

let mode: "account" | "device" = "account";
let deviceClient: SupabaseClient<Database> | null = null;
let financeToken: string | null = null;
let financeClient: SupabaseClient<Database> | null = null;

export const getDeviceToken = () => (typeof window === "undefined" ? null : localStorage.getItem(DEVICE_KEY));

function makeDeviceClient(token: string | null) {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "homehub-device" },
    global: {
      fetch: async (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        if (token) h.set("x-device-token", token);
        else {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) h.set("Authorization", `Bearer ${session.access_token}`);
        }
        if (financeToken) h.set("x-finance-token", financeToken);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export function setDeviceMode(token: string | null) {
  financeToken = null;
  financeClient = null;
  if (token) {
    mode = "device";
    deviceClient = makeDeviceClient(token);
  } else {
    mode = "account";
    deviceClient = null;
  }
}

export const isDeviceMode = () => mode === "device";

/** Client for household data: device client on a paired tablet, otherwise the signed-in account. */
export function db(): SupabaseClient<Database> {
  return mode === "device" && deviceClient ? deviceClient : financeClient ?? supabase;
}

export function setFinanceToken(token: string) {
  financeToken = token;
  if (mode === "account") financeClient = makeDeviceClient(null);
  window.dispatchEvent(new Event("homehub-finance-access"));
}

export async function clearFinanceAccess() {
  const token = financeToken;
  if (token) {
    const { error } = await db().rpc("revoke_finance_session", { _token: token });
    if (error) throw error;
  }
  financeToken = null;
  financeClient = null;
  window.dispatchEvent(new Event("homehub-finance-access"));
}

export function forgetDevice() {
  localStorage.removeItem(DEVICE_KEY);
  setDeviceMode(null);
}

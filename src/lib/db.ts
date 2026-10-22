import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** A paired tablet has no account; it proves its household with a device token header checked by RLS. */
export const DEVICE_KEY = "homehub-device-token";

let mode: "account" | "device" = "account";
let deviceClient: SupabaseClient<Database> | null = null;

export const getDeviceToken = () => (typeof window === "undefined" ? null : localStorage.getItem(DEVICE_KEY));

function makeDeviceClient(token: string) {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "homehub-device" },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        h.set("x-device-token", token);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export function setDeviceMode(token: string | null) {
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
  return mode === "device" && deviceClient ? deviceClient : supabase;
}

export function forgetDevice() {
  localStorage.removeItem(DEVICE_KEY);
  setDeviceMode(null);
}

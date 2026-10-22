import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const DEVICE_KEY = "homehub-device-token";
const FINANCE_TTL = 15 * 60 * 1000;
type Connection = {
  client: SupabaseClient<Database>;
  mode: "account" | "device";
  identity: string;
  accessToken: string | null;
  deviceToken: string | null;
  financeToken: string | null;
  expiresAt: number;
  valid: boolean;
};
let current: Connection | null = null;
let connectionSerial = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const financeChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("homehub-finance-access"));
};
export const getDeviceToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem(DEVICE_KEY);
export const currentDbIdentity = () => current?.identity ?? null;
export const isDeviceMode = () => current?.mode === "device";
export const hasFinanceToken = () =>
  Boolean(current?.financeToken && current.expiresAt > Date.now());

/** Build a candidate without changing the active household or authentication context. */
export function prepareDbContext(options: {
  accessToken: string | null;
  deviceToken: string | null;
  identity: string;
}) {
  const mode: "device" | "account" = options.deviceToken ? "device" : "account";
  const reused = current?.valid && current.identity === options.identity && current.mode === mode;
  const connection: Connection =
    reused && current
      ? current
      : {
          client: null as unknown as SupabaseClient<Database>,
          mode,
          identity: options.identity,
          accessToken: options.accessToken,
          deviceToken: options.deviceToken,
          financeToken: null,
          expiresAt: 0,
          valid: true,
        };
  if (!reused) {
    const url = import.meta.env["VITE_SUPABASE_URL"] as string;
    const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
    connection.client = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: `homehub-${mode}-${++connectionSerial}`,
      },
      global: {
        fetch: (input, init) => {
          if (!connection.valid)
            return Promise.reject(new Error("La sesión ha cambiado. Vuelve a abrir el hogar."));
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
          headers.set("apikey", key);
          headers.delete("Authorization");
          if (connection.accessToken)
            headers.set("Authorization", `Bearer ${connection.accessToken}`);
          else if (!key.startsWith("sb_")) headers.set("Authorization", `Bearer ${key}`);
          if (connection.deviceToken) headers.set("x-device-token", connection.deviceToken);
          else headers.delete("x-device-token");
          if (connection.financeToken && connection.expiresAt > Date.now())
            headers.set("x-finance-token", connection.financeToken);
          else headers.delete("x-finance-token");
          return fetch(input, { ...init, headers });
        },
      },
    });
  }
  return {
    client: connection.client,
    mode,
    activate() {
      if (current !== connection) {
        if (current) current.valid = false;
        if (expiryTimer) clearTimeout(expiryTimer);
        current = connection;
      }
      connection.accessToken = options.accessToken;
    },
    discard() {
      if (!reused && current !== connection) connection.valid = false;
    },
  };
}

export function invalidateDbContext() {
  if (current) current.valid = false;
  current = null;
  if (expiryTimer) clearTimeout(expiryTimer);
  financeChanged();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("homehub-db-invalidated"));
}

/** Household clients remain bound to their identity, including queued writes. */
export const db = (): SupabaseClient<Database> => current?.client ?? supabase;
export function updateAccountToken(accessToken: string) {
  if (current?.mode === "account") current.accessToken = accessToken;
}
export function setFinanceToken(token: string) {
  if (!current) throw new Error("Abre un hogar antes de autorizar las finanzas.");
  current.financeToken = token;
  current.expiresAt = Date.now() + FINANCE_TTL;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => {
    if (current) {
      current.financeToken = null;
      current.expiresAt = 0;
    }
    financeChanged();
  }, FINANCE_TTL);
  financeChanged();
}
export async function clearFinanceAccess() {
  if (current?.financeToken) {
    const { error } = await current.client.rpc("revoke_finance_session", {
      _token: current.financeToken,
    });
    if (error) throw error;
    current.financeToken = null;
    current.expiresAt = 0;
  }
  if (expiryTimer) clearTimeout(expiryTimer);
  financeChanged();
}
export function forgetDevice() {
  localStorage.removeItem(DEVICE_KEY);
  invalidateDbContext();
}

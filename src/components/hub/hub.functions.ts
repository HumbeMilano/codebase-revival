import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { HOUSEHOLD_ID } from "@/lib/hub-db";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * PIN-only login: the PIN identifies the person. Verified server-side against
 * the stored hash; the PIN itself never leaves the server unhashed.
 */
export const verifyPin = createServerFn({ method: "POST" })
  .inputValidator((input: { pin: string; adminOnly?: boolean }) => input)
  .handler(async ({ data }) => {
    if (!/^\d{4}$/.test(data.pin)) return null;
    const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"]!;
    const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      } },
    });
    const hash = await sha256(data.pin);
    const { data: member, error } = await supabase
      .from("members")
      .select("key, name, role")
      .eq("household_id", HOUSEHOLD_ID)
      .eq("pin_hash", hash)
      .maybeSingle();
    if (error) throw new Error(`PIN lookup failed: ${error.message}`);
    const { count } = await supabase.from("members").select("key", { count: "exact", head: true });
    if (!member) return { debug: { hash, count, url: url.slice(0, 40) } } as never;
    if (data.adminOnly && member.role !== "admin") return null;
    return { id: member.key, name: member.name, role: member.role as "admin" | "member" };
  });

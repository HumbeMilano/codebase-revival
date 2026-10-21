import { createServerFn } from "@tanstack/react-start";
import { HOUSEHOLD_ID } from "@/lib/hub-db";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * PIN-only login: the PIN identifies the person. Verified server-side against
 * the stored hash; the PIN itself and the hash never reach the browser.
 */
export const verifyPin = createServerFn({ method: "POST" })
  .inputValidator((input: { pin: string; adminOnly?: boolean }) => input)
  .handler(async ({ data }) => {
    if (!/^\d{4}$/.test(data.pin)) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256(data.pin);
    const { data: member } = await supabaseAdmin
      .from("members")
      .select("key, name, role")
      .eq("household_id", HOUSEHOLD_ID)
      .eq("pin_hash", hash)
      .maybeSingle();
    if (!member) return null;
    if (data.adminOnly && member.role !== "admin") return null;
    return { id: member.key, name: member.name, role: member.role as "admin" | "member" };
  });

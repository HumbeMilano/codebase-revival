import { createServerFn } from "@tanstack/react-start";
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
    const hash = await sha256(data.pin);
    const res = await fetch(
      `${url}/rest/v1/members?select=key,name,role&household_id=eq.${HOUSEHOLD_ID}&pin_hash=eq.${hash}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) throw new Error(`PIN lookup failed: ${res.status}`);
    const rows = (await res.json()) as { key: string; name: string; role: string }[];
    const member = rows[0];
    if (!member) return null;
    if (data.adminOnly && member.role !== "admin") return null;
    return { id: member.key, name: member.name, role: member.role as "admin" | "member" };
  });

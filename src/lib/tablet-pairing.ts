import { z } from "zod";
import { createPairingClient, supabase } from "@/integrations/supabase/client";
import { DEVICE_KEY } from "./db";
import { withVerifiedPasskey } from "./passkeys";

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const requestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  claimSecret: hex,
  approvalSecret: hex,
  expiresAt: z.string().datetime({ offset: true }),
});
export type TabletPairingRequest = z.infer<typeof requestSchema>;
export const previewSchema = z.object({
  name: z.string(),
  household_name: z.string(),
  expires_at: z.string(),
  status: z.enum(["pending", "approved"]),
});
const storageKey = "homehub-tablet-pairing-v1";
let starting: Promise<TabletPairingRequest> | null = null;
export const pairingClient = createPairingClient;
export const randomPairingSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function pairingHash(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
function restoredRequest(): TabletPairingRequest | null {
  try {
    const parsed = requestSchema.safeParse(
      JSON.parse(sessionStorage.getItem(storageKey) ?? "null"),
    );
    if (parsed.success && Date.parse(parsed.data.expiresAt) > Date.now()) return parsed.data;
  } catch {
    /* A blocked session store still permits this pairing in memory. */
  }
  return null;
}
export function clearPairingRequest() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* optional cache */
  }
}
export function pairingLink(request: TabletPairingRequest): string {
  return `${window.location.origin}/vincular#${request.id}.${request.approvalSecret}`;
}
export function readPairingLink(
  hash = window.location.hash,
): { id: string; approvalSecret: string } | null {
  const match = /^#([0-9a-f-]{36})\.([a-f0-9]{64})$/i.exec(hash);
  if (!match || !z.string().uuid().safeParse(match[1]).success) return null;
  return { id: match[1]!, approvalSecret: match[2]!.toLowerCase() };
}
export async function startTabletPairing(): Promise<TabletPairingRequest> {
  const cached = restoredRequest();
  if (cached) return cached;
  if (starting) return starting;
  starting = (async () => {
    const id = crypto.randomUUID(),
      claimSecret = randomPairingSecret(),
      approvalSecret = randomPairingSecret();
    const [claim_hash, approval_hash] = await Promise.all([
      pairingHash(claimSecret),
      pairingHash(approvalSecret),
    ]);
    const response = await fetch("/api/tablet-pairing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ id, name: "Tablet del hogar", claim_hash, approval_hash }),
    });
    const data = (await response.json()) as {
      id?: string;
      name?: string;
      expires_at?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? "No se pudo preparar el QR.");
    const request = requestSchema.parse({
      id: data.id,
      name: data.name,
      expiresAt: data.expires_at,
      claimSecret,
      approvalSecret,
    });
    if (
      request.id !== id ||
      Date.parse(request.expiresAt) <= Date.now() ||
      Date.parse(request.expiresAt) > Date.now() + 10 * 60_000
    )
      throw new Error("No se pudo validar el QR.");
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request));
    } catch {
      /* request remains in memory */
    }
    return request;
  })().finally(() => {
    starting = null;
  });
  return starting;
}
export async function finishTabletPairing(token: string, signal?: AbortSignal): Promise<void> {
  hex.parse(token);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (signal?.aborted) throw new Error("Pairing aborted");
  if (data.session) {
    const signedOut = await supabase.auth.signOut({ scope: "local" });
    if (signedOut.error) throw signedOut.error;
  }
  if (signal?.aborted) throw new Error("Pairing aborted");
  localStorage.setItem(DEVICE_KEY, token);
  clearPairingRequest();
}
export async function approveTabletPairing(
  request: { id: string; approvalSecret: string },
  expectedUserId: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error("Pairing aborted");
  const current = await supabase.auth.getUser();
  if (current.error || current.data.user?.id !== expectedUserId)
    throw new Error("La sesión cambió. Vuelve a abrir el enlace.");
  if (signal.aborted) throw new Error("Pairing aborted");
  const keys = await supabase.auth.passkey.list();
  if (keys.error) throw keys.error;
  if (signal.aborted) throw new Error("Pairing aborted");
  if (!keys.data?.length) {
    const registered = await supabase.auth.registerPasskey({ options: { signal } });
    if (registered.error) throw registered.error;
  }
  if (signal.aborted) throw new Error("Pairing aborted");
  await withVerifiedPasskey(
    expectedUserId,
    async (client) => {
      const result = await client
        .rpc("approve_tablet_pairing", {
          _id: request.id,
          _approval_secret: request.approvalSecret,
        })
        .abortSignal(signal);
      if (result.error) throw result.error;
    },
    signal,
  );
}

import { createPairingClient } from "@/integrations/supabase/client";

export const supportsPasskeys = () =>
  typeof window !== "undefined" &&
  typeof PublicKeyCredential !== "undefined" &&
  !!navigator.credentials;

function decode(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    .buffer;
}
function encode(value: ArrayBuffer): string {
  return btoa(Array.from(new Uint8Array(value), (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function passkeyError(reason: unknown): string {
  const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
  const name = reason instanceof Error ? reason.name : "";
  if (code === "passkey_disabled")
    return "Las passkeys todavía no están activadas en este servicio.";
  if (name === "NotAllowedError" || /cancel|abort/i.test(String(reason)))
    return "La verificación se canceló o caducó. Puedes volver a intentarlo.";
  if (String(reason).includes("fresh passkey"))
    return "La verificación caducó. Vuelve a vincular con tu passkey.";
  return "No se pudo completar la verificación. Usa una passkey de una cuenta adulta de este hogar y comprueba la conexión.";
}

/** A fresh phone-side verification in a separate, nonpersistent Auth session. */
export async function withVerifiedPasskey<T>(
  expectedUserId: string,
  action: (client: ReturnType<typeof createPairingClient>) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!supportsPasskeys())
    throw new Error(
      "Este navegador no admite passkeys. Actualiza el sistema y abre la app en Safari o Chrome.",
    );
  const client = createPairingClient();
  try {
    const { data: start, error: startError } = await client.auth.passkey.startAuthentication();
    if (startError || !start) throw startError ?? new Error("Challenge unavailable");
    const { allowCredentials, challenge, ...options } = start.options;
    const publicKey: PublicKeyCredentialRequestOptions & { hints: string[] } = {
      ...options,
      challenge: decode(challenge),
      userVerification: "required",
      hints: ["client-device"],
      ...(allowCredentials
        ? {
            allowCredentials: allowCredentials.map((item) => ({
              type: item.type,
              id: decode(item.id),
              ...(item.transports
                ? {
                    transports: item.transports.filter((value) =>
                      ["usb", "nfc", "ble", "internal", "hybrid"].includes(value),
                    ) as AuthenticatorTransport[],
                  }
                : {}),
            })),
          }
        : {}),
    };
    const credential = (await navigator.credentials.get({
      publicKey,
      ...(signal ? { signal } : {}),
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error("Passkey cancelled");
    const response = credential.response as AuthenticatorAssertionResponse;
    const { data, error } = await client.auth.passkey.verifyAuthentication({
      challengeId: start.challenge_id,
      credential: {
        id: credential.id,
        rawId: encode(credential.rawId),
        type: "public-key",
        response: {
          clientDataJSON: encode(response.clientDataJSON),
          authenticatorData: encode(response.authenticatorData),
          signature: encode(response.signature),
          ...(response.userHandle ? { userHandle: encode(response.userHandle) } : {}),
        },
        clientExtensionResults: credential.getClientExtensionResults(),
        ...(credential.authenticatorAttachment
          ? {
              authenticatorAttachment: credential.authenticatorAttachment as
                "platform" | "cross-platform",
            }
          : {}),
      },
    });
    if (error || !data.session) throw error ?? new Error("Verification unavailable");
    if (data.session.user.id !== expectedUserId)
      throw new Error("La passkey corresponde a otra cuenta. Usa la de tu cuenta adulta actual.");
    if (signal?.aborted) throw new Error("Pairing aborted");
    return await action(client);
  } finally {
    // This is a separate, nonpersistent session. Never sign out the phone's other sessions.
    await client.auth.signOut({ scope: "local" }).catch(() => {});
  }
}

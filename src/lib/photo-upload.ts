import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PhotoUpload = { path: string; blob: Blob; uploaded: boolean };

/** Keep the same path after a lost response. Neither an uncertain upload nor an
 * uncertain metadata response permits blindly deleting the household's photo. */
export async function saveHouseholdPhoto(
  client: SupabaseClient<Database>,
  pending: PhotoUpload,
  assertCurrent: () => void,
): Promise<void> {
  assertCurrent();
  const bucket = client.storage.from("household-photos");
  if (!pending.uploaded) {
    const result = await bucket.upload(pending.path, pending.blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    assertCurrent();
    if (result.error) {
      // A successful upload whose response was lost returns Duplicate on retry.
      // The private, random path belongs to this operation; read permission is
      // still checked by Storage before accepting it as the original upload.
      const existing = await bucket.info(pending.path);
      assertCurrent();
      if (existing.error || !existing.data) throw result.error;
    }
    pending.uploaded = true;
  }
  const registered = await client.rpc("add_household_photo", { _path: pending.path });
  if (registered.error) throw registered.error;
  assertCurrent();
}

export async function discardHouseholdPhoto(
  client: SupabaseClient<Database>,
  pending: PhotoUpload,
  assertCurrent: () => void,
): Promise<void> {
  assertCurrent();
  const metadata = await client.rpc("list_household_photos");
  if (metadata.error) throw metadata.error;
  assertCurrent();
  if (metadata.data?.some((photo) => photo.path === pending.path)) return;
  const removed = await client.storage.from("household-photos").remove([pending.path]);
  if (removed.error) throw removed.error;
  assertCurrent();
}

export function photoErrorMessage(reason: unknown): string {
  const message =
    reason && typeof reason === "object" && "message" in reason ? String(reason.message) : "";
  if (/row.level security|permission|Only adults|42501/i.test(message))
    return "Solo una cuenta adulta de este hogar puede cambiar las fotos. Actualiza tu sesión y reintenta.";
  if (/suspended/i.test(message))
    return "Este hogar está suspendido. Consulta con quien administra el servicio.";
  const limit = /At most (\d+) household photos/i.exec(message);
  if (limit) return `Este plan permite hasta ${limit[1]} fotos. Quita una antes de añadir otra.`;
  if (
    /^(Elige |La imagen |La foto |No se pudo abrir |No se pudo comprimir |Este navegador |La sesión cambió)/.test(
      message,
    )
  )
    return message;
  return "No se pudo confirmar que la foto quedó guardada. Comprueba la conexión y pulsa Reintentar.";
}

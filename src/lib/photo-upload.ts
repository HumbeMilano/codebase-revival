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
  // A partial cleanup may be retried if replacing a batch fails later. The
  // object may already be gone even when Storage's deletion response is lost.
  pending.uploaded = false;
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
    /^(Elige |La imagen |La foto |No se pudo abrir |No se pudo comprimir |No se pudo comprobar la capacidad |Este navegador |La sesión cambió)/.test(
      message,
    )
  )
    return message;
  return "No se pudo confirmar que la foto quedó guardada. Comprueba la conexión y pulsa Reintentar.";
}

export type PhotoBatchItem = {
  id: string;
  name: string;
  file: File | null;
  operation: PhotoUpload | null;
  status: "pending" | "saving" | "saved" | "failed";
  error: string;
};
export function photoBatchItems(files: File[]): PhotoBatchItem[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    name: file.name,
    file,
    operation: null,
    status: "pending",
    error: "",
  }));
}

/** Compress only one image at a time and keep receipts for failed files.
 * Completed files release their bytes and are never uploaded again on retry. */
export async function saveHouseholdPhotoBatch(
  client: SupabaseClient<Database>,
  householdId: string,
  items: PhotoBatchItem[],
  prepare: (file: File) => Promise<Blob>,
  assertCurrent: () => void,
  progress: (index: number) => void,
): Promise<void> {
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    if (item.status === "saved") continue;
    assertCurrent();
    item.status = "saving";
    item.error = "";
    progress(index);
    try {
      if (!item.operation) {
        if (!item.file) throw new Error("La foto ya no está disponible. Vuelve a seleccionarla.");
        const blob = await prepare(item.file);
        assertCurrent();
        item.operation = {
          path: `${householdId}/${crypto.randomUUID()}.jpg`,
          blob,
          uploaded: false,
        };
        item.file = null;
      }
      await saveHouseholdPhoto(client, item.operation, assertCurrent);
      item.status = "saved";
      item.operation = null;
      item.file = null;
    } catch (reason) {
      item.status = "failed";
      item.error = photoErrorMessage(reason);
      progress(index);
      assertCurrent();
      const message =
        reason && typeof reason === "object" && "message" in reason ? String(reason.message) : "";
      if (
        /permission|row.level security|Only adult|42501|suspended|At most|La sesión cambió/i.test(
          message,
        )
      )
        break;
      continue;
    }
    progress(index);
  }
}

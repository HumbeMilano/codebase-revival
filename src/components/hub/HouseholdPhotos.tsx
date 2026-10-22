import { useState } from "react";
import { ArrowLeft, ArrowRight, Images, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { HOUSEHOLD } from "./data";
import {
  prepareHouseholdPhoto,
  useHouseholdPhotos,
  type HouseholdPhoto,
} from "@/lib/household-photos";
import { Button } from "@/components/ui/button";

export function HouseholdPhotos() {
  const { photos, error: loadingError, refresh } = useHouseholdPhotos();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = () => {
    refresh();
    window.dispatchEvent(new Event("homehub-photos-changed"));
  };
  const upload = async (file: File | undefined) => {
    if (!file || busy || photos.length >= 12) return;
    const client = db();
    const householdId = HOUSEHOLD.id;
    setBusy(true);
    setError("");
    let uploadedPath: string | null = null;
    try {
      const blob = await prepareHouseholdPhoto(file);
      if (client !== db() || HOUSEHOLD.id !== householdId)
        throw new Error("La sesión cambió. Vuelve a abrir el hogar.");
      const path = `${householdId}/${crypto.randomUUID()}.jpg`;
      const result = await client.storage
        .from("household-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (result.error) throw result.error;
      uploadedPath = path;
      const saved = await client.rpc("add_household_photo", { _path: path });
      if (saved.error) throw saved.error;
      uploadedPath = null;
      changed();
    } catch (reason) {
      if (uploadedPath) await client.storage.from("household-photos").remove([uploadedPath]);
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la foto. Reintenta.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (photo: HouseholdPhoto) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const client = db();
    try {
      const removed = await client.storage.from("household-photos").remove([photo.path]);
      if (removed.error) throw removed.error;
      const result = await client.rpc("remove_household_photo", { _id: photo.id });
      if (result.error) throw result.error;
      changed();
    } catch {
      setError("No se pudo completar la eliminación. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };
  const reorder = async (index: number, direction: number) => {
    if (busy || !photos[index + direction]) return;
    setBusy(true);
    setError("");
    try {
      const ids = photos.map((photo) => photo.id);
      [ids[index], ids[index + direction]] = [ids[index + direction]!, ids[index]!];
      const result = await db().rpc("reorder_household_photos", { _ids: ids });
      if (result.error) throw result.error;
      changed();
    } catch {
      setError("No se pudo guardar el orden. Actualiza las fotos y reintenta.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-3xl bg-card p-5 shadow-card md:col-span-2">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <Images /> Fotos de la pantalla de bloqueo
      </h2>
      <p className="text-sm text-muted-foreground">
        Hasta 12 fotos privadas del hogar. Se alternan cada 20 segundos en la tablet; puedes
        ordenarlas o quitarlas. Las imágenes se comprimen antes de subirlas.
      </p>
      {(error || loadingError) && (
        <p role="alert" className="text-sm text-destructive">
          {error || loadingError}{" "}
          <button type="button" className="underline" onClick={refresh}>
            Reintentar
          </button>
        </p>
      )}
      <label className="block text-sm font-semibold">
        Añadir foto
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || photos.length >= 12}
          className="mt-2 block w-full text-base"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void upload(file);
          }}
        />
      </label>
      {busy && (
        <p role="status" className="text-sm">
          Guardando fotos…
        </p>
      )}
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <li key={photo.id} className="overflow-hidden rounded-2xl border">
            <img
              src={photo.url}
              alt={`Foto ${index + 1} del hogar`}
              className="aspect-video w-full object-cover"
            />
            <div className="flex justify-between gap-1 p-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy || index === 0}
                aria-label={`Adelantar foto ${index + 1}`}
                onClick={() => void reorder(index, -1)}
              >
                <ArrowLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy || index === photos.length - 1}
                aria-label={`Retrasar foto ${index + 1}`}
                onClick={() => void reorder(index, 1)}
              >
                <ArrowRight />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`Eliminar foto ${index + 1}`}
                onClick={() => void remove(photo)}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {!photos.length && (
        <p className="text-sm text-muted-foreground">
          Mientras no añadas fotos se mostrará el fondo inicial.
        </p>
      )}
    </section>
  );
}

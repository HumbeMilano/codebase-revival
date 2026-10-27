import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Images, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { HOUSEHOLD } from "./data";
import {
  prepareHouseholdPhoto,
  useHouseholdPhotos,
  type HouseholdPhoto,
} from "@/lib/household-photos";
import { Button } from "@/components/ui/button";
import {
  discardHouseholdPhoto,
  photoErrorMessage,
  saveHouseholdPhoto,
  type PhotoUpload,
} from "@/lib/photo-upload";

export function HouseholdPhotos() {
  const { photos, error: loadingError, refresh } = useHouseholdPhotos();
  const [busy, setBusy] = useState(false);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [capacityError, setCapacityError] = useState("");
  const [capacityRevision, setCapacityRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const client = db(),
      householdId = HOUSEHOLD.id;
    const controller = new AbortController();
    setCapacity(null);
    setCapacityError("");
    void client
      .rpc("household_photo_capacity")
      .abortSignal(controller.signal)
      .then(
        ({ data, error }) => {
          if (!active || client !== db() || householdId !== HOUSEHOLD.id) return;
          if (error || !Number.isSafeInteger(data) || Number(data) < 1 || Number(data) > 30) {
            setCapacityError("No se pudo comprobar la capacidad de fotos. Reintenta.");
            return;
          }
          setCapacity(Number(data));
        },
        () => {
          if (active && client === db() && householdId === HOUSEHOLD.id)
            setCapacityError("No se pudo comprobar la capacidad de fotos. Reintenta.");
        },
      );
    return () => {
      active = false;
      controller.abort();
    };
  }, [capacityRevision]);
  const [error, setError] = useState("");
  const pending = useRef<{
    client: ReturnType<typeof db>;
    householdId: string;
    operation: PhotoUpload;
  } | null>(null);
  const changed = () => {
    window.dispatchEvent(new Event("homehub-photos-changed"));
  };
  const assertCurrent = () => {
    if (
      pending.current &&
      (pending.current.client !== db() || pending.current.householdId !== HOUSEHOLD.id)
    )
      throw new Error("La sesión cambió. Vuelve a abrir el hogar.");
  };
  const upload = async (file?: File) => {
    if (
      busy ||
      (!file && !pending.current) ||
      (file && (capacity === null || photos.length >= capacity))
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (file) {
        if (pending.current) {
          await discardHouseholdPhoto(
            pending.current.client,
            pending.current.operation,
            assertCurrent,
          );
          pending.current = null;
          changed();
        }
        const client = db(),
          householdId = HOUSEHOLD.id;
        const blob = await prepareHouseholdPhoto(file);
        if (client !== db() || householdId !== HOUSEHOLD.id)
          throw new Error("La sesión cambió. Vuelve a abrir el hogar.");
        pending.current = {
          client,
          householdId,
          operation: { path: `${householdId}/${crypto.randomUUID()}.jpg`, blob, uploaded: false },
        };
      }
      if (!pending.current) return;
      await saveHouseholdPhoto(pending.current.client, pending.current.operation, assertCurrent);
      pending.current = null;
      changed();
    } catch (reason) {
      setError(photoErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (photo: HouseholdPhoto) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const client = db(),
      householdId = HOUSEHOLD.id;
    try {
      const removed = await client.storage.from("household-photos").remove([photo.path]);
      if (removed.error) throw removed.error;
      if (client !== db() || householdId !== HOUSEHOLD.id)
        throw new Error("La sesión cambió. Vuelve a abrir el hogar.");
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
      const client = db(),
        householdId = HOUSEHOLD.id;
      const result = await client.rpc("reorder_household_photos", { _ids: ids });
      if (result.error) throw result.error;
      if (client !== db() || householdId !== HOUSEHOLD.id)
        throw new Error("La sesión cambió. Vuelve a abrir el hogar.");
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
        <Images /> Fotos del hogar
      </h2>
      <p className="text-sm text-muted-foreground">
        {photos.length} {photos.length === 1 ? "foto" : "fotos"}
      </p>
      {(error || loadingError || capacityError) && (
        <p role="alert" className="text-sm text-destructive">
          {error || loadingError || capacityError}{" "}
          <button
            type="button"
            className="underline"
            disabled={busy}
            onClick={() => {
              if (pending.current) void upload();
              else {
                setError("");
                refresh();
                setCapacityRevision((v) => v + 1);
              }
            }}
          >
            Reintentar
          </button>
        </p>
      )}
      <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold focus-within:ring-2 focus-within:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
        <Plus className="size-4" /> Añadir foto
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || capacity === null || photos.length >= capacity}
          className="sr-only"
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
              className="aspect-[4/3] w-full bg-muted object-contain"
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
    </section>
  );
}

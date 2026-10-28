import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Images, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
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
  saveHouseholdPhotoBatch,
  photoBatchItems,
  type PhotoBatchItem,
} from "@/lib/photo-upload";

export function HouseholdPhotos() {
  const { photos, error: loadingError, refresh } = useHouseholdPhotos();
  const [action, setAction] = useState<"upload" | "remove" | "reorder" | null>(null);
  const busy = action !== null;
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
  const lifetime = useRef({
    active: true,
    epoch: 0,
    actor: undefined as string | null | undefined,
  });
  const running = useRef(false);
  type Batch = {
    client: ReturnType<typeof db>;
    householdId: string;
    epoch: number;
    items: PhotoBatchItem[];
  };
  const pending = useRef<Batch | null>(null);
  const [report, setReport] = useState<Pick<PhotoBatchItem, "id" | "name" | "status">[] | null>(
    null,
  );
  const [currentPhoto, setCurrentPhoto] = useState(0);
  useEffect(() => {
    const life = lifetime.current;
    life.active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const actor = session?.user.id ?? null;
      if (life.actor !== undefined && life.actor !== actor) {
        life.epoch++;
        pending.current = null;
        setReport(null);
        setError("");
      }
      life.actor = actor;
    });
    return () => {
      life.active = false;
      life.epoch++;
      pending.current = null;
      subscription.unsubscribe();
    };
  }, []);
  const changed = () => window.dispatchEvent(new Event("homehub-photos-changed"));
  const assertBatch = (batch: Batch) => {
    if (
      !lifetime.current.active ||
      batch.epoch !== lifetime.current.epoch ||
      batch.client !== db() ||
      batch.householdId !== HOUSEHOLD.id
    )
      throw new Error("La sesión cambió. Vuelve a abrir las fotos.");
  };
  const show = (batch: Batch, index: number) => {
    assertBatch(batch);
    if (!batch.items.length) {
      setReport(null);
      setCurrentPhoto(0);
      return;
    }
    setCurrentPhoto(index + 1);
    setReport(batch.items.map(({ id, name, status }) => ({ id, name, status })));
  };
  const upload = async (files?: File[]) => {
    if (running.current || (files && !files.length) || (!files && !pending.current)) return;
    running.current = true;
    setAction("upload");
    setError("");
    let batch = pending.current;
    try {
      if (files) {
        // A new selection replaces only unfinished work; confirmed photos are retained.
        if (batch) {
          const previous = batch;
          for (const item of previous.items)
            if (item.operation)
              await discardHouseholdPhoto(previous.client, item.operation, () =>
                assertBatch(previous),
              );
          pending.current = null;
          batch = null;
          setReport(null);
        }
        const binding = { client: db(), householdId: HOUSEHOLD.id, epoch: lifetime.current.epoch };
        const [limit, listed] = await Promise.all([
          binding.client.rpc("household_photo_capacity"),
          binding.client.rpc("list_household_photos"),
        ]);
        const next: Batch = { ...binding, items: [] };
        assertBatch(next);
        if (limit.error) throw limit.error;
        if (listed.error) throw listed.error;
        if (
          !Number.isSafeInteger(limit.data) ||
          limit.data < 1 ||
          limit.data > 30 ||
          !Array.isArray(listed.data)
        )
          throw new Error("No se pudo comprobar la capacidad de fotos.");
        setCapacity(limit.data);
        const remaining = Math.max(0, limit.data - listed.data.length);
        if (files.length > remaining) {
          setError(
            remaining
              ? remaining === 1
                ? "Queda 1 espacio disponible. Selecciona solo 1 foto."
                : `Quedan ${remaining} espacios disponibles. Selecciona hasta ${remaining} fotos.`
              : "No queda espacio para más fotos. Quita alguna y vuelve a seleccionar.",
          );
          return;
        }
        next.items = photoBatchItems(files);
        batch = next;
        pending.current = next;
      }
      if (!batch) return;
      const active = batch;
      await saveHouseholdPhotoBatch(
        active.client,
        active.householdId,
        active.items,
        prepareHouseholdPhoto,
        () => assertBatch(active),
        (index) => show(active, index),
      );
      assertBatch(active);
      const failed = active.items.find((item) => item.error);
      if (failed) setError(`${failed.name}: ${failed.error}`);
      show(active, active.items.length - 1);
      if (active.items.every((item) => item.status === "saved")) pending.current = null;
    } catch (reason) {
      if (lifetime.current.active && (!batch || batch.epoch === lifetime.current.epoch))
        setError(photoErrorMessage(reason));
    } finally {
      running.current = false;
      if (lifetime.current.active) {
        setAction(null);
        changed();
      }
    }
  };
  const remove = async (photo: HouseholdPhoto) => {
    if (running.current) return;
    running.current = true;
    setAction("remove");
    setError("");
    const binding: Batch = {
      client: db(),
      householdId: HOUSEHOLD.id,
      epoch: lifetime.current.epoch,
      items: [],
    };
    try {
      assertBatch(binding);
      const removed = await binding.client.storage.from("household-photos").remove([photo.path]);
      if (removed.error) throw removed.error;
      assertBatch(binding);
      const result = await binding.client.rpc("remove_household_photo", { _id: photo.id });
      if (result.error) throw result.error;
      assertBatch(binding);
      if (pending.current) {
        pending.current.items = pending.current.items.filter(
          (item) => item.operation?.path !== photo.path,
        );
        const batch = pending.current;
        show(batch, Math.max(0, batch.items.length - 1));
        if (batch.items.every((item) => item.status === "saved")) pending.current = null;
      }
      changed();
    } catch {
      if (lifetime.current.active && binding.epoch === lifetime.current.epoch)
        setError("No se pudo completar la eliminación. Vuelve a intentarlo.");
    } finally {
      running.current = false;
      if (lifetime.current.active) setAction(null);
    }
  };
  const reorder = async (index: number, direction: number) => {
    if (running.current || !photos[index + direction]) return;
    running.current = true;
    setAction("reorder");
    setError("");
    const binding: Batch = {
      client: db(),
      householdId: HOUSEHOLD.id,
      epoch: lifetime.current.epoch,
      items: [],
    };
    try {
      const ids = photos.map((photo) => photo.id);
      [ids[index], ids[index + direction]] = [ids[index + direction]!, ids[index]!];
      assertBatch(binding);
      const result = await binding.client.rpc("reorder_household_photos", { _ids: ids });
      if (result.error) throw result.error;
      assertBatch(binding);
      changed();
    } catch {
      if (lifetime.current.active && binding.epoch === lifetime.current.epoch)
        setError("No se pudo guardar el orden. Actualiza las fotos y reintenta.");
    } finally {
      running.current = false;
      if (lifetime.current.active) setAction(null);
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
        <Plus className="size-4" /> Añadir fotos
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || capacity === null || photos.length >= capacity}
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(files);
          }}
        />
      </label>
      {busy && (
        <p role="status" className="text-sm">
          {action === "remove"
            ? "Eliminando foto…"
            : action === "reorder"
              ? "Guardando orden…"
              : report
                ? `Guardando foto ${currentPhoto} de ${report.length}…`
                : "Preparando fotos…"}
        </p>
      )}
      {!busy && report && (
        <p role="status" aria-label="Estado de la subida" className="text-sm">
          {report.every((item) => item.status === "saved")
            ? `${report.length} ${report.length === 1 ? "foto guardada" : "fotos guardadas"}`
            : `${report.filter((item) => item.status === "saved").length} de ${report.length} fotos confirmadas`}
        </p>
      )}
      {report && report.length > 1 && (
        <ul
          aria-label="Estado de las fotos seleccionadas"
          className="max-h-40 space-y-1 overflow-y-auto text-sm"
        >
          {report.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{item.name}</span>
              <span
                className={
                  item.status === "failed"
                    ? "shrink-0 text-destructive"
                    : "shrink-0 text-muted-foreground"
                }
              >
                {
                  {
                    pending: "Pendiente",
                    saving: "Guardando…",
                    saved: "Guardada",
                    failed: "Sin confirmar",
                  }[item.status]
                }
              </span>
            </li>
          ))}
        </ul>
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

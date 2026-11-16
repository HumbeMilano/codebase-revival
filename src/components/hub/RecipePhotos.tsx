import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, ImageOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HOUSEHOLD } from "./data";
import { db } from "@/lib/db";
import { useRecipePhotos } from "@/hooks/use-recipe-photos";
import { prepareHouseholdPhoto } from "@/lib/household-photos";
import { saveRecipePhoto } from "@/lib/recipe-photos";
import type { PhotoUpload } from "@/lib/photo-upload";

export function RecipePhotos({ recipeId, canEdit }: { recipeId: string; canEdit: boolean }) {
  const { photos, error: loadingError, refresh } = useRecipePhotos([recipeId]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const life = useRef({ active: true, client: db(), household: HOUSEHOLD.id, recipeId });
  const running = useRef(false);
  type Pending = { file: File | null; operation: PhotoUpload | null; saved: boolean };
  const pending = useRef<Pending[]>([]);
  const removing = useRef<(typeof photos)[number] | null>(null);
  const assertCurrent = () => {
    const value = life.current;
    if (
      !value.active ||
      value.client !== db() ||
      value.household !== HOUSEHOLD.id ||
      value.recipeId !== recipeId
    )
      throw new Error("La sesión cambió.");
  };
  useEffect(() => {
    const value = life.current;
    value.active = true;
    return () => {
      value.active = false;
      pending.current = [];
      removing.current = null;
    };
  }, []);
  useEffect(() => {
    if (!busy && !retry) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [busy, retry]);
  const preparationError = (reason: unknown) =>
    reason instanceof Error &&
    /^(Elige una imagen|La imagen|La foto|No se pudo abrir|No se pudo comprimir|Este navegador)/.test(
      reason.message,
    );
  const message = (reason: unknown) =>
    preparationError(reason)
      ? (reason as Error).message
      : /At most 4/.test(String((reason as { message?: string })?.message))
        ? "Puedes añadir hasta 4 fotos por receta."
        : "No se pudo completar el cambio de fotos. Reintenta para confirmar el resultado.";
  const upload = async (files?: File[]) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      assertCurrent();
      if (files) {
        const listed = await life.current.client
          .from("recipe_photos")
          .select("path")
          .eq("recipe_id", recipeId);
        assertCurrent();
        if (listed.error) throw listed.error;
        if (files.length + (listed.data?.length ?? 0) > 4) {
          setError("Puedes añadir hasta 4 fotos por receta.");
          return;
        }
        pending.current = files.map((file) => ({ file, operation: null, saved: false }));
      }
      const jobs = pending.current;
      for (let n = 0; n < jobs.length; n++) {
        const job = jobs[n]!;
        if (job.saved) continue;
        assertCurrent();
        setProgress(`Subiendo ${n + 1} de ${jobs.length}…`);
        if (!job.operation) {
          if (!job.file) throw new Error("Vuelve a elegir la foto.");
          const blob = await prepareHouseholdPhoto(job.file);
          assertCurrent();
          job.operation = {
            path: `${life.current.household}/${recipeId}/${crypto.randomUUID()}.jpg`,
            blob,
            uploaded: false,
          };
          job.file = null;
        }
        await saveRecipePhoto(life.current.client, recipeId, job.operation, assertCurrent);
        job.saved = true;
        job.operation = null;
        job.file = null;
      }
      assertCurrent();
      pending.current = [];
      setRetry(false);
    } catch (reason) {
      if (life.current.active) {
        // A file that never reached Storage can be replaced safely. Keep every
        // uncertain upload/registration receipt until it has been reconciled.
        if (preparationError(reason))
          pending.current = pending.current.filter((p) => !p.saved && p.operation !== null);
        setError(message(reason));
        setRetry(pending.current.some((p) => !p.saved));
      }
    } finally {
      running.current = false;
      if (life.current.active) {
        setBusy(false);
        setProgress("");
        void refresh();
      }
    }
  };
  const remove = async (photo: (typeof photos)[number]) => {
    if (running.current) return;
    running.current = true;
    removing.current = photo;
    setBusy(true);
    setError("");
    try {
      assertCurrent();
      const removed = await life.current.client.storage.from("recipe-photos").remove([photo.path]);
      assertCurrent();
      if (removed.error) throw removed.error;
      const result = await life.current.client.rpc("remove_recipe_photo", { _id: photo.id });
      assertCurrent();
      if (result.error) throw result.error;
      removing.current = null;
      setRetry(false);
      setIndex(0);
    } catch (reason) {
      if (life.current.active) {
        setError(message(reason));
        setRetry(true);
      }
    } finally {
      running.current = false;
      if (life.current.active) {
        setBusy(false);
        void refresh();
      }
    }
  };
  const shown = photos.length ? photos[index % photos.length] : null;
  return (
    <section aria-label="Fotos de la receta" className="space-y-3">
      {shown && (
        <div className="overflow-hidden rounded-3xl border bg-secondary/40">
          {shown.url && shown.url !== failed ? (
            <img
              src={shown.url}
              alt={`Foto ${(index % photos.length) + 1} de la receta`}
              onError={() => setFailed(shown.url)}
              className="max-h-[48dvh] min-h-40 w-full object-contain"
            />
          ) : (
            <div className="grid min-h-40 place-items-center text-muted-foreground">
              <ImageOff aria-label="Foto no disponible" />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Foto anterior"
                disabled={photos.length < 2}
                onClick={() => setIndex((n) => (n + photos.length - 1) % photos.length)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm tabular-nums">
                {(index % photos.length) + 1} / {photos.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Foto siguiente"
                disabled={photos.length < 2}
                onClick={() => setIndex((n) => (n + 1) % photos.length)}
              >
                <ChevronRight />
              </Button>
            </div>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy || retry}
                aria-label="Quitar foto de la receta"
                onClick={() => void remove(shown)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
      {canEdit && (
        <label
          className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm ${busy || retry || photos.length >= 4 ? "pointer-events-none opacity-50" : ""}`}
        >
          <ImagePlus className="size-4" />
          <span>Añadir fotos</span>
          <input
            aria-label="Añadir fotos a la receta"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy || retry || photos.length >= 4}
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void upload(files);
            }}
          />
        </label>
      )}
      {progress && (
        <p role="status" className="text-sm text-muted-foreground">
          {progress}
        </p>
      )}
      {(error || loadingError) && (
        <p role="alert" className="text-sm text-destructive">
          {error || loadingError}{" "}
          <button
            className="underline"
            type="button"
            disabled={busy}
            onClick={() => {
              if (removing.current) void remove(removing.current);
              else if (pending.current.length) void upload();
              else void refresh();
            }}
          >
            Reintentar fotos
          </button>
        </p>
      )}
    </section>
  );
}

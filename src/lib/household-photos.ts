import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import { HOUSEHOLD } from "@/components/hub/data";

export type HouseholdPhoto = { id: string; path: string; position: number; url: string };
const imageCache = new Map<string, string>();
let cleanupInstalled = false;
export function useHouseholdPhotos() {
  const householdId = HOUSEHOLD.id;
  const [photos, setPhotos] = useState<HouseholdPhoto[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!cleanupInstalled) {
      cleanupInstalled = true;
      window.addEventListener("homehub-db-invalidated", () => {
        for (const url of imageCache.values()) URL.revokeObjectURL(url);
        imageCache.clear();
      });
    }
    let active = true;
    const client = db();
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const { data: metadata, error: metadataError } = await client.rpc("list_household_photos");
        if (metadataError) throw metadataError;
        const rows = metadata ?? [];
        const missing = rows.some((photo) => !imageCache.has(photo.path));
        if (missing) {
          const { data, error: signedError } = await client.functions.invoke<{
            photos: HouseholdPhoto[];
          }>("household-photos", { body: {} });
          if (signedError || !data) throw signedError ?? new Error("Photos unavailable");
          const allowed = new Set(rows.map((photo) => photo.path));
          await Promise.all(
            data.photos
              .filter((photo) => allowed.has(photo.path) && !imageCache.has(photo.path))
              .map(async (photo) => {
                const response = await fetch(photo.url, { cache: "no-store" });
                if (!response.ok) throw new Error("Photo unavailable");
                const blob = await response.blob();
                if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 2097152)
                  throw new Error("Invalid photo");
                if (active && HOUSEHOLD.id === householdId)
                  imageCache.set(photo.path, URL.createObjectURL(blob));
              }),
          );
        }
        if (!active || HOUSEHOLD.id !== householdId) return;
        const paths = new Set(rows.map((photo) => photo.path));
        for (const [path, url] of imageCache)
          if (!path.startsWith(householdId + "/") || !paths.has(path)) {
            URL.revokeObjectURL(url);
            imageCache.delete(path);
          }
        setPhotos(
          rows
            .filter((photo) => imageCache.has(photo.path))
            .map((photo) => ({ ...photo, url: imageCache.get(photo.path)! })),
        );
        setError("");
      } catch {
        if (active)
          setError("No se pudieron actualizar las fotos. Comprueba la conexión y reintenta.");
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    const changed = () => void load();
    window.addEventListener("homehub-photos-changed", changed);
    window.addEventListener("online", changed);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("homehub-photos-changed", changed);
      window.removeEventListener("online", changed);
    };
  }, [householdId, retry]);
  return { photos, error, refresh: useCallback(() => setRetry((value) => value + 1), []) };
}

export async function prepareHouseholdPhoto(file: File): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Elige una imagen JPG, PNG o WebP de hasta 20 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo abrir la foto."));
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 60_000_000
    )
      throw new Error("La imagen es demasiado grande. Reduce sus dimensiones.");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador no pudo preparar la imagen.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("No se pudo comprimir la foto."))),
        "image/jpeg",
        0.78,
      ),
    );
    if (blob.size > 2097152)
      throw new Error("La foto sigue siendo demasiado grande. Elige una imagen más pequeña.");
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}

import { useMemo, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { HOUSEHOLD } from "@/components/hub/data";

export type HouseholdPhoto = { id: string; path: string; position: number; url: string };
type PhotoRow = Omit<HouseholdPhoto, "url">;
type Snapshot = { photos: HouseholdPhoto[]; loading: boolean; error: string };
const stores = new Set<PhotoStore>();
let cleanupInstalled = false;
const unavailable = "No se pudieron actualizar las fotos. Comprueba la conexión y reintenta.";
function accessDenied(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const error = value as { code?: string; status?: number; context?: Response };
  return (
    ["42501", "PGRST301", "PGRST302"].includes(error.code ?? "") ||
    [401, 403].includes(error.status ?? 0) ||
    [401, 403].includes(error.context?.status ?? 0)
  );
}

class PhotoStore {
  snapshot: Snapshot = { photos: [], loading: true, error: "" };
  private listeners = new Set<() => void>();
  private images = new Map<string, string>();
  private rows: PhotoRow[] = [];
  private metadataKnown = false;
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    readonly client: ReturnType<typeof db>,
    readonly householdId: string,
  ) {}
  getSnapshot = () => this.snapshot;
  private publish(error = "", finished = false) {
    const photos = this.rows
      .filter((row) => this.images.has(row.path))
      .map((row) => ({ ...row, url: this.images.get(row.path)! }));
    this.snapshot = { photos, loading: !finished && !photos.length, error };
    this.listeners.forEach((notify) => notify());
  }
  clear = () => {
    this.controller?.abort();
    for (const url of this.images.values()) URL.revokeObjectURL(url);
    this.images.clear();
    this.rows = [];
    this.metadataKnown = false;
    this.snapshot = { photos: [], loading: true, error: "" };
    this.listeners.forEach((notify) => notify());
  };
  private valid(controller: AbortController) {
    return (
      !controller.signal.aborted &&
      this.controller === controller &&
      this.client === db() &&
      this.householdId === HOUSEHOLD.id
    );
  }
  private load = () => {
    if (
      this.running ||
      document.visibilityState === "hidden" ||
      this.client !== db() ||
      this.householdId !== HOUSEHOLD.id
    )
      return;
    const controller = new AbortController();
    this.controller = controller;
    this.running = (async () => {
      try {
        let signedPhotos: HouseholdPhoto[] | null = null;
        let metadata: PhotoRow[];
        if (!this.metadataKnown) {
          // This endpoint already authorizes and lists the household; avoid a cold-start round trip.
          const signed = await this.client.functions.invoke<{ photos: HouseholdPhoto[] }>(
            "household-photos",
            { body: {} },
          );
          if (signed.error || !signed.data) throw signed.error ?? new Error("Photos unavailable");
          signedPhotos = signed.data.photos;
          metadata = signedPhotos.map(({ id, path, position }) => ({ id, path, position }));
        } else {
          const result = await this.client
            .rpc("list_household_photos")
            .abortSignal(controller.signal);
          if (result.error) throw result.error;
          metadata = result.data ?? [];
        }
        if (!this.valid(controller)) return;
        const rows = [...metadata].sort((a, b) => a.position - b.position);
        if (rows.length > 12 || rows.some((row) => !row.path.startsWith(this.householdId + "/")))
          throw new Error("Invalid photo scope");
        this.rows = rows;
        this.metadataKnown = true;
        const allowed = new Set(rows.map((row) => row.path));
        for (const [path, url] of this.images)
          if (!allowed.has(path)) {
            URL.revokeObjectURL(url);
            this.images.delete(path);
          }
        this.publish("", !rows.length);
        const missing = rows.filter((row) => !this.images.has(row.path));
        if (missing.length) {
          if (!signedPhotos) {
            const signed = await this.client.functions.invoke<{ photos: HouseholdPhoto[] }>(
              "household-photos",
              { body: {} },
            );
            if (signed.error || !signed.data) throw signed.error ?? new Error("Photos unavailable");
            signedPhotos = signed.data.photos;
          }
          if (!this.valid(controller)) return;
          const urls = new Map(
            signedPhotos
              .filter((photo) => allowed.has(photo.path))
              .map((photo) => [photo.path, photo.url]),
          );
          const download = async (row: PhotoRow) => {
            if (!this.valid(controller)) return;
            const source = urls.get(row.path);
            if (!source) throw new Error("Missing photo URL");
            const response = await fetch(source, { cache: "no-store", signal: controller.signal });
            if (!response.ok) throw new Error("Photo unavailable");
            const blob = await response.blob();
            if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 2097152)
              throw new Error("Invalid photo");
            if (!this.valid(controller)) return;
            const url = URL.createObjectURL(blob);
            try {
              const image = new Image();
              image.src = url;
              if (image.decode) await image.decode();
              else
                await new Promise<void>((resolve, reject) => {
                  image.onload = () => resolve();
                  image.onerror = () => reject(new Error("Invalid image"));
                });
              if (!this.valid(controller)) {
                URL.revokeObjectURL(url);
                return;
              }
              const old = this.images.get(row.path);
              if (old) URL.revokeObjectURL(old);
              this.images.set(row.path, url);
              this.publish();
            } catch (error) {
              URL.revokeObjectURL(url);
              throw error;
            }
          };
          // The first frame never waits for the remaining carousel downloads.
          let failed = false;
          try {
            await download(missing[0]!);
          } catch {
            failed = true;
          }
          const rest = await Promise.allSettled(missing.slice(1).map(download));
          failed ||= rest.some((result) => result.status === "rejected");
          if (this.valid(controller)) this.publish(failed ? unavailable : "", true);
        } else this.publish("", true);
      } catch (error) {
        if (this.valid(controller)) {
          if (accessDenied(error)) this.clear();
          this.publish(unavailable, true);
        }
      }
    })().finally(() => {
      this.running = null;
      if (this.dirty && this.listeners.size) {
        this.dirty = false;
        this.load();
      }
    });
  };
  refresh = () => {
    if (this.running) this.dirty = true;
    else this.load();
  };
  subscribe = (notify: () => void) => {
    if (this.client !== db() || this.householdId !== HOUSEHOLD.id) return () => {};
    if (!cleanupInstalled) {
      cleanupInstalled = true;
      window.addEventListener("homehub-db-invalidated", () => {
        for (const store of stores) store.clear();
      });
    }
    for (const store of stores)
      if (
        store !== this &&
        (store.client !== this.client || store.householdId !== this.householdId)
      ) {
        store.clear();
        if (!store.listeners.size) stores.delete(store);
      }
    this.listeners.add(notify);
    if (this.listeners.size === 1) {
      this.refresh();
      this.timer = setInterval(this.refresh, 60_000);
      window.addEventListener("homehub-photos-changed", this.refresh);
      window.addEventListener("online", this.refresh);
      document.addEventListener("visibilitychange", this.refresh);
    }
    return () => {
      this.listeners.delete(notify);
      if (!this.listeners.size) {
        this.controller?.abort();
        clearInterval(this.timer);
        window.removeEventListener("homehub-photos-changed", this.refresh);
        window.removeEventListener("online", this.refresh);
        document.removeEventListener("visibilitychange", this.refresh);
      }
    };
  };
}
const noSubscription = () => () => {};
export function useHouseholdPhotos(enabled = true) {
  const client = db(),
    householdId = HOUSEHOLD.id;
  const store = useMemo(() => {
    const old = [...stores].find(
      (item) => item.client === client && item.householdId === householdId,
    );
    if (old) return old;
    const next = new PhotoStore(client, householdId);
    stores.add(next);
    return next;
  }, [client, householdId]);
  const snapshot = useSyncExternalStore(
    enabled ? store.subscribe : noSubscription,
    store.getSnapshot,
    store.getSnapshot,
  );
  return { ...snapshot, refresh: store.refresh };
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

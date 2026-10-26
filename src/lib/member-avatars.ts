import { useMemo, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { HOUSEHOLD } from "@/components/hub/data";

type Row = { member_key: string; path: string; url?: string };
type Snapshot = Readonly<Record<string, string>>;
const empty: Snapshot = Object.freeze({});
const stores = new Set<AvatarStore>();
let cleanupInstalled = false;
class AvatarStore {
  private snapshot: Snapshot = empty;
  private rows: Row[] = [];
  private images = new Map<string, string>();
  private listeners = new Set<() => void>();
  private known = false;
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    readonly client: ReturnType<typeof db>,
    readonly household: string,
  ) {}
  getSnapshot = () => this.snapshot;
  private publish() {
    this.snapshot = Object.fromEntries(
      this.rows
        .filter((r) => this.images.has(r.path))
        .map((r) => [r.member_key, this.images.get(r.path)!]),
    );
    this.listeners.forEach((notify) => notify());
  }
  clear = () => {
    this.controller?.abort();
    this.images.forEach((url) => URL.revokeObjectURL(url));
    this.images.clear();
    this.rows = [];
    this.known = false;
    this.snapshot = empty;
    this.listeners.forEach((notify) => notify());
  };
  private valid(controller: AbortController) {
    return (
      !controller.signal.aborted &&
      this.controller === controller &&
      this.client === db() &&
      this.household === HOUSEHOLD.id
    );
  }
  private load = () => {
    if (
      this.running ||
      document.visibilityState === "hidden" ||
      this.client !== db() ||
      this.household !== HOUSEHOLD.id ||
      !this.household
    )
      return;
    const controller = new AbortController();
    this.controller = controller;
    this.running = (async () => {
      try {
        let signed: Row[] | null = null,
          rows: Row[];
        if (!this.known) {
          const result = await this.client.functions.invoke<{ avatars: Row[] }>("member-avatars", {
            body: {},
          });
          if (result.error || !result.data) throw result.error ?? new Error("Avatars unavailable");
          rows = result.data.avatars;
          signed = rows;
        } else {
          const result = await this.client
            .rpc("household_avatar_paths")
            .abortSignal(controller.signal);
          if (result.error) throw result.error;
          rows = result.data ?? [];
        }
        if (!this.valid(controller)) return;
        if (
          rows.length > 128 ||
          new Set(rows.map((r) => r.member_key)).size !== rows.length ||
          rows.some(
            (r) =>
              !/^[a-zA-Z0-9_-]{1,100}$/.test(r.member_key) ||
              !/^[a-f0-9-]{36}\/[a-zA-Z0-9._-]{1,200}\.(jpe?g|png|webp)$/.test(r.path),
          )
        )
          throw new Error("Invalid avatar metadata");
        this.rows = rows;
        this.known = true;
        const allowed = new Set(rows.map((r) => r.path));
        for (const [path, url] of this.images)
          if (!allowed.has(path)) {
            URL.revokeObjectURL(url);
            this.images.delete(path);
          }
        this.publish();
        const missing = rows.filter((r) => !this.images.has(r.path));
        if (!missing.length) return;
        if (!signed) {
          const result = await this.client.functions.invoke<{ avatars: Row[] }>("member-avatars", {
            body: {},
          });
          if (result.error || !result.data) throw result.error ?? new Error("Avatars unavailable");
          signed = result.data.avatars;
        }
        if (!this.valid(controller)) return;
        const sources = new Map(
          signed.filter((r) => allowed.has(r.path)).map((r) => [r.path, r.url]),
        );
        const download = async (row: Row) => {
          if (!this.valid(controller)) return;
          const source = sources.get(row.path);
          if (!source || new URL(source).protocol !== "https:")
            throw new Error("Invalid avatar URL");
          const response = await fetch(source, {
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
          if (!response.ok) throw new Error("Avatar unavailable");
          const blob = await response.blob();
          if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 2097152)
            throw new Error("Invalid avatar image");
          if (!this.valid(controller)) return;
          const url = URL.createObjectURL(blob);
          try {
            const image = new Image();
            image.src = url;
            if (image.decode) await image.decode();
            else
              await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error("Invalid avatar"));
              });
            if (!this.valid(controller)) {
              URL.revokeObjectURL(url);
              return;
            }
            this.images.set(row.path, url);
            this.publish();
          } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
          }
        };
        for (let i = 0; i < missing.length; i += 4)
          await Promise.allSettled(missing.slice(i, i + 4).map(download));
      } catch (error) {
        const e = error as { code?: string; status?: number; context?: Response } | null;
        if (
          this.valid(controller) &&
          (["42501", "PGRST301", "PGRST302"].includes(e?.code ?? "") ||
            [401, 403].includes(e?.status ?? 0) ||
            [401, 403].includes(e?.context?.status ?? 0))
        )
          this.clear();
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
    if (this.client !== db() || this.household !== HOUSEHOLD.id || !this.household) return () => {};
    if (!cleanupInstalled) {
      cleanupInstalled = true;
      window.addEventListener("homehub-db-invalidated", () => {
        for (const store of stores) store.clear();
      });
    }
    for (const store of stores)
      if (store !== this && (store.client !== this.client || store.household !== this.household)) {
        store.clear();
        if (!store.listeners.size) stores.delete(store);
      }
    this.listeners.add(notify);
    if (this.listeners.size === 1) {
      this.refresh();
      this.timer = setInterval(this.refresh, 60_000);
      window.addEventListener("homehub-avatars-changed", this.refresh);
      window.addEventListener("online", this.refresh);
      document.addEventListener("visibilitychange", this.refresh);
    }
    return () => {
      this.listeners.delete(notify);
      if (!this.listeners.size) {
        this.controller?.abort();
        clearInterval(this.timer);
        window.removeEventListener("homehub-avatars-changed", this.refresh);
        window.removeEventListener("online", this.refresh);
        document.removeEventListener("visibilitychange", this.refresh);
      }
    };
  };
}
const noSubscription = () => () => {};
export function useHouseholdAvatars() {
  const client = db(),
    household = HOUSEHOLD.id;
  const store = useMemo(() => {
    const existing = [...stores].find((s) => s.client === client && s.household === household);
    if (existing) return existing;
    const next = new AvatarStore(client, household);
    stores.add(next);
    return next;
  }, [client, household]);
  return useSyncExternalStore(
    household ? store.subscribe : noSubscription,
    store.getSnapshot,
    store.getSnapshot,
  );
}
export function useMemberAvatar(memberId: string) {
  return useHouseholdAvatars()[memberId];
}

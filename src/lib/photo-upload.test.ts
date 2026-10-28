import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  discardHouseholdPhoto,
  photoErrorMessage,
  photoBatchItems,
  saveHouseholdPhoto,
  saveHouseholdPhotoBatch,
  type PhotoUpload,
} from "./photo-upload";

function fixture() {
  const bucket = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    info: vi.fn().mockResolvedValue({ data: { id: "stored-photo" }, error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };
  const rpc = vi.fn().mockResolvedValue({ data: "registered-photo", error: null });
  const client = { storage: { from: () => bucket }, rpc } as unknown as SupabaseClient<Database>;
  const operation: PhotoUpload = {
    path: "household/private-random-path.jpg",
    blob: new Blob(["photo"], { type: "image/jpeg" }),
    uploaded: false,
  };
  return { bucket, rpc, client, operation };
}
describe("household photo recovery", () => {
  it("retries uncertain metadata without duplicating or deleting the stored file", async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    await expect(saveHouseholdPhoto(f.client, f.operation, () => {})).rejects.toMatchObject({
      message: "Failed to fetch",
    });
    await saveHouseholdPhoto(f.client, f.operation, () => {});
    expect(f.bucket.upload).toHaveBeenCalledOnce();
    expect(f.bucket.remove).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.map((call) => call[1])).toEqual([
      { _path: f.operation.path },
      { _path: f.operation.path },
    ]);
  });
  it("recovers an uploaded object after a lost Storage response using its same private path", async () => {
    const f = fixture();
    f.bucket.upload.mockResolvedValueOnce({ error: { message: "The resource already exists" } });
    await saveHouseholdPhoto(f.client, f.operation, () => {});
    expect(f.bucket.info).toHaveBeenCalledWith(f.operation.path);
    expect(f.rpc).toHaveBeenCalledWith("add_household_photo", { _path: f.operation.path });
  });
  it("does not register a photo when Storage denies access", async () => {
    const f = fixture();
    f.bucket.upload.mockResolvedValueOnce({
      error: { message: "new row violates row-level security policy" },
    });
    f.bucket.info.mockResolvedValueOnce({ data: null, error: { message: "Not found" } });
    await expect(saveHouseholdPhoto(f.client, f.operation, () => {})).rejects.toMatchObject({
      message: expect.stringContaining("row-level security"),
    });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.operation.uploaded).toBe(false);
  });
  it("preserves committed photos when a user chooses a different image after an uncertain response", async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ data: [{ path: f.operation.path }], error: null });
    await discardHouseholdPhoto(f.client, f.operation, () => {});
    expect(f.bucket.remove).not.toHaveBeenCalled();
    f.rpc.mockResolvedValue({ data: [], error: null });
    await discardHouseholdPhoto(f.client, f.operation, () => {});
    expect(f.bucket.remove).toHaveBeenCalledWith([f.operation.path]);
  });
  it("does not write after the original household session is invalidated", async () => {
    const f = fixture();
    await expect(
      saveHouseholdPhoto(f.client, f.operation, () => {
        throw new Error("Session changed");
      }),
    ).rejects.toThrow("Session changed");
    expect(f.bucket.upload).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("shows a useful message instead of raw SQL authorization errors", () => {
    expect(photoErrorMessage({ message: "new row violates row-level security policy" })).toContain(
      "cuenta adulta",
    );
    expect(photoErrorMessage({ message: "At most 30 household photos" })).toContain("30 fotos");
  });
});

const selection = () =>
  photoBatchItems([
    new File(["first"], "viaje.png", { type: "image/png" }),
    new File(["second"], "familia.png", { type: "image/png" }),
    new File(["third"], "casa.png", { type: "image/png" }),
  ]);
describe("multiple household photos", () => {
  it("prepares and saves sequentially, releasing confirmed image bytes", async () => {
    const f = fixture();
    const items = selection();
    const calls: string[] = [];
    const prepare = vi.fn(async (file: File) => {
      if (calls.length) expect(items[calls.length / 2 - 1]?.file).toBeNull();
      calls.push(file.name);
      return new Blob([file.name], { type: "image/jpeg" });
    });
    f.rpc.mockImplementation(async () => {
      calls.push("confirmed");
      return { data: "photo-id", error: null };
    });
    await saveHouseholdPhotoBatch(
      f.client,
      "home",
      items,
      prepare,
      () => {},
      () => {},
    );
    expect(calls).toEqual([
      "viaje.png",
      "confirmed",
      "familia.png",
      "confirmed",
      "casa.png",
      "confirmed",
    ]);
    expect(f.bucket.upload).toHaveBeenCalledTimes(3);
    expect(new Set(f.bucket.upload.mock.calls.map(([path]) => path)).size).toBe(3);
    for (const item of items) {
      expect(item.status).toBe("saved");
      expect(item.file).toBeNull();
      expect(item.operation).toBeNull();
    }
  });

  it("continues after a lost registration response and retries only that receipt", async () => {
    const f = fixture();
    const items = selection();
    const prepare = vi.fn(async () => new Blob(["compressed"]));
    f.rpc
      .mockResolvedValueOnce({ data: "first-id", error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Response lost after commit" } });
    await saveHouseholdPhotoBatch(
      f.client,
      "home",
      items,
      prepare,
      () => {},
      () => {},
    );
    expect(items.map((item) => item.status)).toEqual(["saved", "failed", "saved"]);
    const uncertainPath = items[1]!.operation!.path;
    await saveHouseholdPhotoBatch(
      f.client,
      "home",
      items,
      prepare,
      () => {},
      () => {},
    );
    expect(items.every((item) => item.status === "saved")).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(f.bucket.upload).toHaveBeenCalledTimes(3);
    expect(f.rpc).toHaveBeenCalledTimes(4);
    expect(f.rpc.mock.calls[1]?.[1]).toEqual({ _path: uncertainPath });
    expect(f.rpc.mock.calls[3]?.[1]).toEqual({ _path: uncertainPath });
    expect(f.bucket.remove).not.toHaveBeenCalled();
  });

  it("saves valid photos when another selected file cannot be decoded", async () => {
    const f = fixture();
    const items = selection();
    const prepare = vi.fn(async (file: File) => {
      if (file.name === "familia.png") throw new Error("No se pudo abrir la foto.");
      return new Blob(["compressed"]);
    });
    await saveHouseholdPhotoBatch(
      f.client,
      "home",
      items,
      prepare,
      () => {},
      () => {},
    );
    expect(items.map((item) => item.status)).toEqual(["saved", "failed", "saved"]);
    expect(items[1]?.error).toBe("No se pudo abrir la foto.");
    expect(f.bucket.upload).toHaveBeenCalledTimes(2);
  });

  it("stops before another file when the original session changes", async () => {
    const f = fixture();
    const items = selection();
    let current = true;
    f.rpc.mockImplementationOnce(async () => {
      current = false;
      return { data: "first-id", error: null };
    });
    const prepare = vi.fn(async () => new Blob(["compressed"]));
    await expect(
      saveHouseholdPhotoBatch(
        f.client,
        "home",
        items,
        prepare,
        () => {
          if (!current) throw new Error("La sesión cambió.");
        },
        () => {},
      ),
    ).rejects.toThrow("La sesión cambió.");
    expect(prepare).toHaveBeenCalledOnce();
    expect(f.bucket.upload).toHaveBeenCalledOnce();
    expect(f.rpc).toHaveBeenCalledOnce();
    expect(items[1]?.status).toBe("pending");
  });

  it("stops the remaining uploads when the server capacity is reached concurrently", async () => {
    const f = fixture();
    const items = selection();
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: "At most 10 household photos" } });
    await saveHouseholdPhotoBatch(
      f.client,
      "home",
      items,
      async () => new Blob(["compressed"]),
      () => {},
      () => {},
    );
    expect(items.map((item) => item.status)).toEqual(["failed", "pending", "pending"]);
    expect(items[0]?.error).toContain("10 fotos");
    expect(f.bucket.upload).toHaveBeenCalledOnce();
  });

  it("can retry an unfinished upload after a partial replacement cleanup", async () => {
    const f = fixture();
    f.operation.uploaded = true;
    f.rpc.mockResolvedValueOnce({ data: [], error: null });
    f.bucket.remove.mockResolvedValueOnce({ error: { message: "Response lost after delete" } });
    await expect(discardHouseholdPhoto(f.client, f.operation, () => {})).rejects.toMatchObject({
      message: "Response lost after delete",
    });
    await saveHouseholdPhoto(f.client, f.operation, () => {});
    expect(f.bucket.upload).toHaveBeenCalledOnce();
    expect(f.rpc).toHaveBeenLastCalledWith("add_household_photo", { _path: f.operation.path });
  });
});

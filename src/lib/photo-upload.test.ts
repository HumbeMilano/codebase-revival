import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  discardHouseholdPhoto,
  photoErrorMessage,
  saveHouseholdPhoto,
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

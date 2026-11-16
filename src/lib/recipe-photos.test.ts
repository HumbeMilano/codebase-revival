import { describe, expect, it, vi } from "vitest";
import { saveRecipePhoto } from "./recipe-photos";
import type { PhotoUpload } from "./photo-upload";
import { db } from "./db";
describe("recipe photo upload receipts", () => {
  it("retries a lost registration with the same private path and without uploading the bytes again", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "Response lost" } })
      .mockResolvedValue({ data: "photo-id", error: null });
    const client = { storage: { from: () => ({ upload }) }, rpc } as unknown as ReturnType<
      typeof db
    >;
    const pending: PhotoUpload = {
      path: "house/recipe/random.jpg",
      blob: new Blob(["image"]),
      uploaded: false,
    };
    await expect(saveRecipePhoto(client, "recipe", pending, () => {})).rejects.toEqual({
      message: "Response lost",
    });
    await saveRecipePhoto(client, "recipe", pending, () => {});
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith("add_recipe_photo", {
      _recipe_id: "recipe",
      _path: pending.path,
    });
  });
  it("checks authorization context again after an upload before attaching its photo", async () => {
    const rpc = vi.fn();
    let active = true;
    const client = {
      storage: {
        from: () => ({
          upload: async () => {
            active = false;
            return { error: null };
          },
        }),
      },
      rpc,
    } as unknown as ReturnType<typeof db>;
    await expect(
      saveRecipePhoto(client, "recipe", { path: "path", blob: new Blob(), uploaded: false }, () => {
        if (!active) throw Error("changed");
      }),
    ).rejects.toThrow("changed");
    expect(rpc).not.toHaveBeenCalled();
  });
});

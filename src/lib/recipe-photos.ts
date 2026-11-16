import { db } from "@/lib/db";
import type { PhotoUpload } from "./photo-upload";

/** The random upload path is retained across retries, including lost receipts. */
export async function saveRecipePhoto(
  client: ReturnType<typeof db>,
  recipeId: string,
  pending: PhotoUpload,
  assertCurrent: () => void,
) {
  assertCurrent();
  const bucket = client.storage.from("recipe-photos");
  if (!pending.uploaded) {
    const uploaded = await bucket.upload(pending.path, pending.blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    assertCurrent();
    if (uploaded.error) {
      const existing = await bucket.info(pending.path);
      assertCurrent();
      if (existing.error || !existing.data) throw uploaded.error;
    }
    pending.uploaded = true;
  }
  const registered = await client.rpc("add_recipe_photo", {
    _recipe_id: recipeId,
    _path: pending.path,
  });
  if (registered.error) throw registered.error;
  assertCurrent();
}

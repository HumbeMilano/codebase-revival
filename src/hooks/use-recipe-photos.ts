import { useCallback, useEffect, useRef, useState } from "react";
import { HOUSEHOLD } from "@/components/hub/data";
import { db } from "@/lib/db";
import type { RecipePhoto } from "@/lib/recipes";

export function useRecipePhotos(recipeIds: string[], covers = false) {
  const ids = [...new Set(recipeIds)].sort().join(",");
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const scope = useRef({ client: db(), household: HOUSEHOLD.id });
  const active = useRef(false);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    const client = scope.current.client;
    const valid = () =>
      active.current &&
      generation.current === ticket &&
      client === db() &&
      scope.current.household === HOUSEHOLD.id;
    if (!ids || !valid()) {
      if (valid()) setPhotos([]);
      return;
    }
    try {
      const result = await client.functions.invoke<{ photos: RecipePhoto[] }>("recipe-photos", {
        body: { recipe_ids: ids.split(","), covers },
      });
      if (!valid()) return;
      if (result.error || !result.data) throw result.error;
      if (
        result.data.photos.some(
          (p) =>
            !ids.split(",").includes(p.recipe_id) ||
            !p.path.startsWith(scope.current.household + "/" + p.recipe_id + "/"),
        )
      )
        throw new Error("Invalid recipe photo scope");
      setPhotos(result.data.photos);
      setError("");
    } catch {
      if (valid()) {
        setPhotos([]);
        setError("No se pudieron cargar las fotos.");
      }
    }
  }, [ids, covers]);
  useEffect(() => {
    active.current = true;
    setPhotos([]);
    setError("");
    void refresh();
    const reload = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const clear = () => {
      generation.current++;
      setPhotos([]);
    };
    const timer = setInterval(reload, 240000);
    window.addEventListener("focus", reload);
    window.addEventListener("homehub-db-invalidated", clear);
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", reload);
      window.removeEventListener("homehub-db-invalidated", clear);
    };
  }, [refresh]);
  return { photos, error, refresh };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { HOUSEHOLD } from "@/components/hub/data";
import { db } from "@/lib/db";
import { recipeRowSchema, type Recipe, type RecipeContent } from "@/lib/recipes";

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const lifetime = useRef({ active: false, read: 0, write: 0 });
  const binding = useRef({ client: db(), household: HOUSEHOLD.id });
  const current = useCallback(() => {
    const bound = binding.current;
    return lifetime.current.active && bound.client === db() && bound.household === HOUSEHOLD.id;
  }, []);
  const refresh = useCallback(async () => {
    if (!current() || document.visibilityState === "hidden") return;
    const ticket = ++lifetime.current.read;
    const write = lifetime.current.write;
    try {
      const { data, error: failure } = await binding.current.client
        .from("recipes")
        .select("*")
        .eq("household_id", binding.current.household)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!current() || ticket !== lifetime.current.read || write !== lifetime.current.write)
        return;
      if (failure) throw failure;
      const parsed = recipeRowSchema.array().parse(data);
      setRecipes(parsed);
      setError("");
    } catch (reason) {
      if (!current() || ticket !== lifetime.current.read || write !== lifetime.current.write)
        return;
      if (["42501", "PGRST301", "PGRST302"].includes(String((reason as { code?: string })?.code)))
        setRecipes([]);
      setError("No se pudieron actualizar las recetas. Comprueba la conexión y reintenta.");
    } finally {
      if (current() && ticket === lifetime.current.read) setLoading(false);
    }
  }, [current]);
  useEffect(() => {
    const life = lifetime.current;
    life.active = true;
    void refresh();
    const focus = () => void refresh();
    const invalidated = () => {
      setRecipes([]);
      setError("");
      life.read++;
    };
    const timer = setInterval(focus, 30000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("homehub-db-invalidated", invalidated);
    return () => {
      life.active = false;
      life.read++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("homehub-db-invalidated", invalidated);
    };
  }, [refresh]);
  const accept = (value: unknown) => {
    if (!current()) throw new Error("La sesión cambió. Abre de nuevo las recetas.");
    const row = recipeRowSchema.parse(value);
    if (row.household_id !== binding.current.household) throw new Error("Invalid recipe scope");
    lifetime.current.write++;
    setRecipes((rows) => [row, ...rows.filter((r) => r.id !== row.id)]);
    setError("");
    return row;
  };
  const save = async (id: string, revision: number, content: RecipeContent) => {
    if (!current()) throw new Error("La sesión cambió.");
    lifetime.current.write++;
    const result = await binding.current.client.rpc("save_recipe", {
      _id: id,
      _expected_revision: revision,
      _content: content,
    });
    if (result.error) throw result.error;
    return accept(result.data);
  };
  const archive = async (row: Recipe, archived: boolean) => {
    if (!current()) throw new Error("La sesión cambió.");
    lifetime.current.write++;
    const result = await binding.current.client.rpc("archive_recipe", {
      _id: row.id,
      _expected_revision: row.revision,
      _archived: archived,
    });
    if (result.error) throw result.error;
    return accept(result.data);
  };
  return { recipes, loading, error, refresh, save, archive };
}
